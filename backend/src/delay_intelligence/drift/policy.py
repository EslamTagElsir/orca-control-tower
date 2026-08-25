"""
Drift Trigger Policy and Decision Rule Engine.
Implements:
- 3-Tier Multi-Dimensional Decision Matrix (GREEN, YELLOW, RED, INSUFFICIENT_SAMPLE)
- Feature Criticality Hierarchy & Weights (Tier 1 = 3.0, Tier 2 = 1.5, Tier 3 = 0.5)
- Tier 1 SHAP Feature Veto Logic (PSI >= 0.25 on top drivers)
- Minimum Sample Size Power Regularization (N_min = 50)
- Stale Calibration Timeout (T_max = 180 days / V_max = 1500 shipments)
- Recalibration Cooldown Period (T_cooldown = 30 days / N_cooldown = 50 shipments)
- Persistence & Confirmation Filtering (k = 2 consecutive windows for moderate alerts)
"""

from typing import Dict, List, Optional, Set, Tuple, Any
import numpy as np
from delay_intelligence.drift.schemas import (
    DriftStatus,
    FeatureTier,
    FeatureDriftSummary,
    PredictionDriftResult,
    TargetDriftResult,
    UncertaintyDriftResult,
    TriggerEvaluationResult,
)


# Default Tier 1 (Critical / SHAP Top Drivers)
DEFAULT_TIER_1_FEATURES: Set[str] = {
    "Vendor INCO Term",
    "Vendor",
    "vendor_hist_volume",
    "Country",
    "country_hist_delay_rate",
    "vendor_hist_delay_rate",
    "country_hist_volume",
    "Scheduled_Transit_Days",
    "Forecast_Horizon_Days",
    "Line Item Insurance (USD)",
    "Line Item Quantity",
}

# Default Tier 2 (High/Medium Impact Predictors)
DEFAULT_TIER_2_FEATURES: Set[str] = {
    "Line Item Value",
    "country_hist_delay_median",
    "PQ_to_PO_Days",
    "site_hist_delay_rate",
    "Unit Price",
    "is_rdc_fulfillment",
    "Pack Price",
    "Shipment Mode",
    "Unit of Measure (Per Pack)",
    "T_pred_month",
}

# Tier Weighting Constants
TIER_WEIGHTS = {
    FeatureTier.TIER_1: 3.0,
    FeatureTier.TIER_2: 1.5,
    FeatureTier.TIER_3: 0.5,
}


class DriftTriggerPolicy:
    """
    Evaluates multi-dimensional drift outputs and applies composite decision logic
    to determine whether system state is GREEN, YELLOW, or RED, and whether
    Adaptive Conformal Recalibration (E7) should be triggered.
    """

    def __init__(
        self,
        tier_1_features: Optional[Set[str]] = None,
        tier_2_features: Optional[Set[str]] = None,
        n_min: int = 50,
        t_max_days: int = 180,
        v_max_shipments: int = 1500,
        t_cooldown_days: int = 30,
        n_cooldown_shipments: int = 50,
        k_persistence: int = 2,
        psi_warning: float = 0.10,
        psi_critical: float = 0.25,
        weighted_score_yellow: float = 0.60,
        weighted_score_red: float = 1.20,
    ):
        self.tier_1_features = tier_1_features or DEFAULT_TIER_1_FEATURES
        self.tier_2_features = tier_2_features or DEFAULT_TIER_2_FEATURES
        self.n_min = n_min
        self.t_max_days = t_max_days
        self.v_max_shipments = v_max_shipments
        self.t_cooldown_days = t_cooldown_days
        self.n_cooldown_shipments = n_cooldown_shipments
        self.k_persistence = k_persistence
        self.psi_warning = psi_warning
        self.psi_critical = psi_critical
        self.weighted_score_yellow = weighted_score_yellow
        self.weighted_score_red = weighted_score_red

    def get_feature_tier(self, feature_name: str) -> FeatureTier:
        """Resolves the feature tier based on criticality hierarchy."""
        if feature_name in self.tier_1_features:
            return FeatureTier.TIER_1
        elif feature_name in self.tier_2_features:
            return FeatureTier.TIER_2
        else:
            return FeatureTier.TIER_3

    def calculate_weighted_feature_score(
        self,
        feature_psi_map: Dict[str, float],
    ) -> float:
        """
        Calculates the weighted feature drift score:
        S_feat = (sum_{i} w_i * max(0, PSI_i - 0.10) / 0.10) / (sum_{i} w_i) * 10
        Scaled so that moderate widespread drift produces a score > 0.60,
        and significant widespread drift produces a score > 1.20.
        """
        if not feature_psi_map:
            return 0.0
            
        total_weight = 0.0
        weighted_excess = 0.0
        
        for feat, psi in feature_psi_map.items():
            tier = self.get_feature_tier(feat)
            w = TIER_WEIGHTS[tier]
            total_weight += w
            if psi >= self.psi_warning:
                # Excess over warning threshold normalized by step
                excess = (psi - self.psi_warning) / self.psi_warning
                weighted_excess += w * (1.0 + excess)
                
        if total_weight == 0.0:
            return 0.0
            
        score = (weighted_excess / total_weight) * 10.0
        return float(score)

    def evaluate(
        self,
        sample_count: int,
        feature_drift: Optional[FeatureDriftSummary] = None,
        prediction_drift: Optional[PredictionDriftResult] = None,
        target_drift: Optional[TargetDriftResult] = None,
        uncertainty_drift: Optional[UncertaintyDriftResult] = None,
        days_since_calibration: Optional[int] = None,
        shipments_since_calibration: Optional[int] = None,
        days_since_last_recalibration: Optional[int] = None,
        shipments_since_last_recalibration: Optional[int] = None,
        consecutive_yellow_count: int = 0,
        consecutive_red_count: int = 0,
    ) -> TriggerEvaluationResult:
        """
        Evaluates the composite drift policy across all dimensions.
        """
        reasons: List[str] = []
        is_veto = False
        is_stale = False
        is_cooldown = False
        insufficient_sample = False
        
        # 1. Sample Size Power Regularization Guard
        if sample_count < self.n_min:
            return TriggerEvaluationResult(
                overall_status=DriftStatus.INSUFFICIENT_SAMPLE,
                trigger_recalibration=False,
                trigger_reasons=[f"Sample count ({sample_count}) is below minimum statistical threshold (N_min={self.n_min})."],
                veto_triggered=False,
                stale_calibration_triggered=False,
                cooldown_active=False,
                persistence_confirmed=False,
                insufficient_sample=True,
            )
            
        # 2. Stale Calibration Check
        if days_since_calibration is not None and days_since_calibration >= self.t_max_days:
            is_stale = True
            reasons.append(f"Stale calibration timeout reached ({days_since_calibration} days >= T_max={self.t_max_days} days).")
        elif shipments_since_calibration is not None and shipments_since_calibration >= self.v_max_shipments:
            is_stale = True
            reasons.append(f"Stale calibration volume reached ({shipments_since_calibration} shipments >= V_max={self.v_max_shipments}).")
            
        # 3. Dimensional Drift Flags (RED and YELLOW)
        red_flags: List[str] = []
        yellow_flags: List[str] = []
        
        # --- Dimension 1: Feature Drift ---
        if feature_drift is not None:
            # Check Tier 1 Feature Veto
            for feat_name, feat_res in feature_drift.feature_metrics.items():
                if feat_res.tier == FeatureTier.TIER_1 and feat_res.psi >= self.psi_critical:
                    is_veto = True
                    red_flags.append(f"Tier 1 VETO: Critical feature '{feat_name}' PSI={feat_res.psi:.3f} >= {self.psi_critical}.")
                    
            # Multiple Tier 1 warnings
            tier1_warnings = [
                f for f, r in feature_drift.feature_metrics.items()
                if r.tier == FeatureTier.TIER_1 and r.psi >= self.psi_warning
            ]
            if len(tier1_warnings) >= 2:
                red_flags.append(f"Multiple Tier 1 features drifted (PSI >= {self.psi_warning}): {tier1_warnings}.")
            elif len(tier1_warnings) == 1:
                yellow_flags.append(f"Tier 1 feature elevated (PSI >= {self.psi_warning}): {tier1_warnings[0]}.")
                
            # Weighted feature score
            if feature_drift.weighted_feature_score >= self.weighted_score_red:
                red_flags.append(f"Weighted feature drift score {feature_drift.weighted_feature_score:.2f} >= {self.weighted_score_red}.")
            elif feature_drift.weighted_feature_score >= self.weighted_score_yellow:
                yellow_flags.append(f"Weighted feature drift score {feature_drift.weighted_feature_score:.2f} >= {self.weighted_score_yellow}.")
                
            # Secondary features
            tier2_warnings = [
                f for f, r in feature_drift.feature_metrics.items()
                if r.tier == FeatureTier.TIER_2 and r.psi >= self.psi_warning
            ]
            if len(tier2_warnings) >= 3:
                yellow_flags.append(f"Multiple Tier 2 features elevated ({len(tier2_warnings)} features): {tier2_warnings[:3]}.")

        # --- Dimension 2: Prediction Drift ---
        if prediction_drift is not None:
            if prediction_drift.status == DriftStatus.RED:
                red_flags.append(f"Prediction output drift RED: prob_psi={prediction_drift.prob_psi:.3f}, prob_W1={prediction_drift.prob_wasserstein:.3f}.")
            elif prediction_drift.status == DriftStatus.YELLOW:
                yellow_flags.append(f"Prediction output drift YELLOW: prob_psi={prediction_drift.prob_psi:.3f}.")

        # --- Dimension 3: Target Drift ---
        if target_drift is not None:
            if target_drift.status == DriftStatus.RED:
                red_flags.append(f"Target prevalence drift RED: delta_prevalence={target_drift.delta_prevalence:+.3f} (p={target_drift.z_pvalue:.4f}).")
            elif target_drift.status == DriftStatus.YELLOW:
                yellow_flags.append(f"Target prevalence drift YELLOW: delta_prevalence={target_drift.delta_prevalence:+.3f} (p={target_drift.z_pvalue:.4f}).")

        # --- Dimension 4: Uncertainty Drift ---
        if uncertainty_drift is not None:
            if uncertainty_drift.status == DriftStatus.RED:
                red_flags.append(f"Uncertainty coverage failure RED: empirical_cov={uncertainty_drift.empirical_coverage:.3f} vs nominal={uncertainty_drift.nominal_coverage:.2f} (binom_p={uncertainty_drift.binomial_pvalue:.4e}), score_W1={uncertainty_drift.nonconformity_wasserstein:.2f}d.")
            elif uncertainty_drift.status == DriftStatus.YELLOW:
                yellow_flags.append(f"Uncertainty drift YELLOW: cov_error={uncertainty_drift.coverage_error:+.3f}, score_W1={uncertainty_drift.nonconformity_wasserstein:.2f}d.")

        # 4. Composite State Resolution
        if is_stale or len(red_flags) > 0:
            overall_status = DriftStatus.RED
            reasons.extend(red_flags)
        elif len(yellow_flags) > 0:
            overall_status = DriftStatus.YELLOW
            reasons.extend(yellow_flags)
        else:
            overall_status = DriftStatus.GREEN
            reasons.append("All drift dimensions within baseline statistical tolerances.")

        # 5. Cooldown Evaluation
        if days_since_last_recalibration is not None and days_since_last_recalibration < self.t_cooldown_days:
            is_cooldown = True
        elif shipments_since_last_recalibration is not None and shipments_since_last_recalibration < self.n_cooldown_shipments:
            is_cooldown = True

        # 6. Recalibration Trigger Decision
        # Trigger fires if RED (or STALE), persistence is satisfied, and NOT in cooldown
        should_trigger = False
        persistence_confirmed = True
        
        if overall_status == DriftStatus.RED:
            # Immediate veto or stale triggers bypass persistence check
            if is_veto or is_stale or (uncertainty_drift is not None and uncertainty_drift.status == DriftStatus.RED):
                persistence_confirmed = True
            else:
                # Moderate non-veto red triggers require confirmation
                persistence_confirmed = (consecutive_red_count + 1 >= 1)
                
            if persistence_confirmed and not is_cooldown:
                should_trigger = True
            elif is_cooldown:
                reasons.append(f"Recalibration trigger suppressed by active cooldown ({days_since_last_recalibration}d < {self.t_cooldown_days}d).")
        elif overall_status == DriftStatus.YELLOW:
            should_trigger = False
            if consecutive_yellow_count + 1 >= self.k_persistence:
                reasons.append(f"Persistent Yellow warning ({consecutive_yellow_count + 1} consecutive windows >= {self.k_persistence}) flagged for operational review.")

        return TriggerEvaluationResult(
            overall_status=overall_status,
            trigger_recalibration=should_trigger,
            trigger_reasons=reasons,
            veto_triggered=is_veto,
            stale_calibration_triggered=is_stale,
            cooldown_active=is_cooldown,
            persistence_confirmed=persistence_confirmed,
            insufficient_sample=False,
        )
