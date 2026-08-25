import yaml
import os
import copy

class DecisionEngine:
    def __init__(self, config_path='configs/decision.yaml'):
        with open(config_path, 'r', encoding='utf-8') as f:
            self.config = yaml.safe_load(f)['decision']
            
    def _determine_risk_tier(self, p_late):
        tiers = self.config['risk_tiers']
        if p_late <= tiers['LOW_RISK']['p_late_max']:
            return "LOW_RISK"
        elif p_late <= tiers['WATCH']['p_late_max']:
            return "WATCH"
        elif p_late <= tiers['HIGH_RISK']['p_late_max']:
            return "HIGH_RISK"
        else:
            return "CRITICAL"
            
    def _estimate_costs(self, severity_p50, line_item_value):
        costs = self.config['cost_assumptions']
        daily_cost = costs['base_delay_cost_per_day']
        if costs['value_multiplier_enabled']:
            daily_cost += (line_item_value * costs['value_multiplier_rate'])
        
        expected_base_cost = severity_p50 * daily_cost
        
        # Evaluate actions
        action_evals = {}
        for action in self.config['actions']:
            act_cost = costs['intervention_costs'].get(action, 0.0)
            reduction = costs['intervention_efficacy'].get(action, 0.0)
            
            # Avoid negative residual
            residual_delay = max(0, severity_p50 - reduction)
            residual_cost = residual_delay * daily_cost
            total_cost = act_cost + residual_cost
            
            net_benefit = expected_base_cost - total_cost
            action_evals[action] = {
                'cost': total_cost,
                'net_benefit': net_benefit,
                'residual_delay': residual_delay
            }
        return expected_base_cost, action_evals

    def evaluate(self, shipment_id, p_late, severity_p50, severity_interval_90, 
                 line_item_value, fulfillment_channel, shap_drivers, causal_candidates):
        
        # 1. Risk Tier
        risk_tier = self._determine_risk_tier(p_late)
        
        # 2. Uncertainty
        interval_width = severity_interval_90[1] - severity_interval_90[0]
        high_uncertainty = interval_width > self.config['uncertainty_rules']['high_uncertainty_threshold_days']
        
        # 3. Cost modeling
        expected_base_cost, action_evals = self._estimate_costs(severity_p50, line_item_value)
        
        # 4. Rules Engine
        recommended_action = "NO_ACTION"
        decision_reason = []
        
        if risk_tier == "LOW_RISK":
            recommended_action = "NO_ACTION"
            decision_reason.append("Risk tier is LOW_RISK.")
        elif risk_tier == "WATCH":
            recommended_action = "MONITOR"
            decision_reason.append("Risk tier is WATCH.")
        else: # HIGH_RISK or CRITICAL
            if high_uncertainty:
                recommended_action = "HUMAN_REVIEW"
                decision_reason.append("High uncertainty in severity interval.")
            else:
                # Check SHAP / Causal overlaps
                # If 'Shipment Mode' is a top driver and causal candidate -> TRANSPORT_MODE_REVIEW
                # If 'Vendor' is a top driver -> SUPPLIER_ESCALATION
                
                has_transport = any('Shipment Mode' in d for d in shap_drivers) and any('Shipment Mode' in c for c in causal_candidates)
                has_vendor = any('Vendor' in d for d in shap_drivers)
                
                if has_transport and action_evals['TRANSPORT_MODE_REVIEW']['net_benefit'] > 0:
                    recommended_action = "TRANSPORT_MODE_REVIEW"
                    decision_reason.append("Shipment Mode is a predictive driver and matches an exploratory causal hypothesis; human validation is still required.")
                elif has_vendor and action_evals['SUPPLIER_ESCALATION']['net_benefit'] > 0:
                    recommended_action = "SUPPLIER_ESCALATION"
                    decision_reason.append("Vendor is a key predictive driver.")
                elif action_evals['EXPEDITE']['net_benefit'] > 0:
                    recommended_action = "EXPEDITE"
                    decision_reason.append("Expedite offers positive simulated net benefit.")
                else:
                    recommended_action = "HUMAN_REVIEW"
                    decision_reason.append("No automated action offers positive simulated net benefit.")
                    
        human_approval = recommended_action not in self.config['auto_eligible_actions']
        
        expected_impact = {
            'type': 'simulated_scenario_estimate',
            'base_expected_delay_cost': float(expected_base_cost),
            'action_cost': float(action_evals[recommended_action]['cost']),
            'simulated_net_benefit': float(action_evals[recommended_action]['net_benefit'])
        }

        # Sanitize outputs (no forbidden features, traceability compliance)
        
        traceable_decision = {
            "shipment_id": shipment_id,
            "risk_probability": float(p_late),
            "severity_p50": float(severity_p50),
            "severity_interval_90": [float(severity_interval_90[0]), float(severity_interval_90[1])],
            "risk_tier": risk_tier,
            "high_uncertainty": bool(high_uncertainty),
            "predictive_drivers": shap_drivers,
            "causal_candidates": causal_candidates,
            "recommended_action": recommended_action,
            "decision_reason": decision_reason,
            "expected_impact": expected_impact,
            "human_approval_required": bool(human_approval)
        }
        
        return traceable_decision
        
    def evaluate_sensitivity(self, shipment_id, p_late, severity_p50, severity_interval_90, 
                             line_item_value, fulfillment_channel, shap_drivers, causal_candidates):
        # Vary delay cost and action cost to test robustness
        original_config = copy.deepcopy(self.config)
        
        variations = [
            {'name': 'low_delay_cost', 'cost_per_day': 50.0, 'expedite_cost': 500.0},
            {'name': 'high_delay_cost', 'cost_per_day': 500.0, 'expedite_cost': 500.0},
            {'name': 'cheap_expedite', 'cost_per_day': 150.0, 'expedite_cost': 100.0},
            {'name': 'expensive_expedite', 'cost_per_day': 150.0, 'expedite_cost': 1500.0}
        ]
        
        decisions = []
        for var in variations:
            self.config['cost_assumptions']['base_delay_cost_per_day'] = var['cost_per_day']
            self.config['cost_assumptions']['intervention_costs']['EXPEDITE'] = var['expedite_cost']
            
            d = self.evaluate(shipment_id, p_late, severity_p50, severity_interval_90, 
                              line_item_value, fulfillment_channel, shap_drivers, causal_candidates)
            decisions.append(d['recommended_action'])
            
        # Restore config
        self.config = original_config
        
        base_decision = self.evaluate(shipment_id, p_late, severity_p50, severity_interval_90, 
                                      line_item_value, fulfillment_channel, shap_drivers, causal_candidates)
                                      
        all_same = all(x == base_decision['recommended_action'] for x in decisions)
        if all_same:
            robustness = "ROBUST"
        elif base_decision['recommended_action'] in decisions:
            robustness = "SENSITIVE"
        else:
            robustness = "UNSUPPORTED"
            
        base_decision['robustness_class'] = robustness
        return base_decision

