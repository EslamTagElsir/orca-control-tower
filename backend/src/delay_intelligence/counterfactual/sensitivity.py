"""
Multi-Dimensional Sensitivity Analysis Grid Engine for Experiment E10.

Evaluates a 3x3 matrix varying Action Costs and Action Efficacy:
- Cost Multipliers: Low (0.50), Base (1.00), High (2.00)
- Efficacy Multipliers: Low (0.50), Base (1.00), High (1.50)

Across 9 grid cells and 3 cost scenarios (Low, Base, High), measuring:
- Expected Realized Cost ($)
- Simulated Net Benefit ($)
- Oracle Gap & Policy Regret ($)
- Operational Intervention Rate (%)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple, Union
import numpy as np
import pandas as pd

from delay_intelligence.counterfactual.oracle import OfflineOraclePolicy
from delay_intelligence.counterfactual.policies import list_standard_policies
from delay_intelligence.counterfactual.provenance import ProvenanceTag
from delay_intelligence.counterfactual.state import ObservableShipmentState
from delay_intelligence.counterfactual.transitions import DeterministicTransitionEngine

# Definition of the 3x3 sensitivity grid cells
SENSITIVITY_GRID_CELLS: List[Dict[str, Any]] = [
    {"cell_id": "Cost_Low__Eff_Low", "cost_mult": 0.50, "eff_mult": 0.50, "description": "Cheap actions, weak efficacy"},
    {"cell_id": "Cost_Low__Eff_Base", "cost_mult": 0.50, "eff_mult": 1.00, "description": "Cheap actions, standard efficacy"},
    {"cell_id": "Cost_Low__Eff_High", "cost_mult": 0.50, "eff_mult": 1.50, "description": "Cheap actions, strong efficacy"},
    {"cell_id": "Cost_Base__Eff_Low", "cost_mult": 1.00, "eff_mult": 0.50, "description": "Standard cost, weak efficacy"},
    {"cell_id": "Cost_Base__Eff_Base", "cost_mult": 1.00, "eff_mult": 1.00, "description": "Standard cost, standard efficacy (Baseline)"},
    {"cell_id": "Cost_Base__Eff_High", "cost_mult": 1.00, "eff_mult": 1.50, "description": "Standard cost, strong efficacy"},
    {"cell_id": "Cost_High__Eff_Low", "cost_mult": 2.00, "eff_mult": 0.50, "description": "Expensive actions, weak efficacy"},
    {"cell_id": "Cost_High__Eff_Base", "cost_mult": 2.00, "eff_mult": 1.00, "description": "Expensive actions, standard efficacy"},
    {"cell_id": "Cost_High__Eff_High", "cost_mult": 2.00, "eff_mult": 1.50, "description": "Expensive actions, strong efficacy"},
]


class SensitivityGridEvaluator:
    """
    Evaluator for multi-dimensional sensitivity grids over operational policies.
    """

    def __init__(
        self,
        cost_scenarios: Optional[Dict[str, Dict[str, Any]]] = None,
        grid_cells: Optional[List[Dict[str, Any]]] = None,
    ):
        self.cost_scenarios = cost_scenarios or {}
        self.grid_cells = grid_cells or list(SENSITIVITY_GRID_CELLS)

    def evaluate_grid(
        self,
        states: Sequence[ObservableShipmentState],
        scenario_name: str = "base",
        cost_params: Optional[Dict[str, Any]] = None,
    ) -> pd.DataFrame:
        """
        Executes the 3x3 sensitivity grid on a cohort of shipment states for a cost scenario.

        Args:
            states: Sequence of ObservableShipmentState instances.
            scenario_name: Name of scenario (e.g. 'base', 'low', 'high').
            cost_params: Optional parameter dict for scenario.

        Returns:
            DataFrame containing aggregated metrics for each (grid_cell, policy) combination.
        """
        cp = cost_params or self.cost_scenarios.get(scenario_name, {})
        policies = list_standard_policies()
        transition_engine = DeterministicTransitionEngine(cost_params=cp)
        oracle = OfflineOraclePolicy(cost_params=cp)

        records = []
        n_samples = len(states)
        if n_samples == 0:
            return pd.DataFrame()

        for cell in self.grid_cells:
            cell_id = cell["cell_id"]
            c_mult = float(cell["cost_mult"])
            e_mult = float(cell["eff_mult"])

            # Compute oracle baseline for this grid cell
            oracle_costs = []
            oracle_actions = []
            for s in states:
                act, c_opt, _ = oracle.evaluate_optimal_action(
                    s, cost_multiplier=c_mult, efficacy_multiplier=e_mult
                )
                oracle_costs.append(c_opt)
                oracle_actions.append(act)

            mean_oracle_cost = float(np.mean(oracle_costs))
            total_oracle_cost = float(np.sum(oracle_costs))

            # Base NO_ACTION cost for net benefit reference
            no_action_costs = []
            for s in states:
                res_p0 = transition_engine.transition(
                    s, "NO_ACTION", cost_multiplier=c_mult, efficacy_multiplier=e_mult
                )
                no_action_costs.append(res_p0.expected_realized_cost)
            mean_p0_cost = float(np.mean(no_action_costs))
            total_p0_cost = float(np.sum(no_action_costs))

            # Record Oracle row
            records.append({
                "scenario": scenario_name,
                "grid_cell": cell_id,
                "cost_multiplier": c_mult,
                "efficacy_multiplier": e_mult,
                "policy_id": "Oracle",
                "policy_name": "Offline_Oracle_Benchmark",
                "mean_expected_cost": mean_oracle_cost,
                "total_realized_cost": total_oracle_cost,
                "net_benefit_vs_p0": float(total_p0_cost - total_oracle_cost),
                "oracle_gap": 0.0,
                "mean_regret": 0.0,
                "intervention_rate": float(np.mean([1.0 if a != "NO_ACTION" else 0.0 for a in oracle_actions])),
                "mean_action_cost": 0.0,  # Included in total
                "provenance_tag": ProvenanceTag.SIMULATED_COST.value,
            })

            # Evaluate each operational policy
            for pol_id, pol in policies.items():
                p_costs = []
                p_regrets = []
                p_actions = []
                p_action_costs = []
                p_residual_delays = []

                for idx, s in enumerate(states):
                    act = pol.select_action(s, cp)
                    res = transition_engine.transition(
                        s, act, cost_multiplier=c_mult, efficacy_multiplier=e_mult
                    )
                    cost_val = res.expected_realized_cost
                    p_costs.append(cost_val)
                    p_regrets.append(max(0.0, cost_val - oracle_costs[idx]))
                    p_actions.append(act)
                    p_action_costs.append(res.action_cost)
                    p_residual_delays.append(res.residual_delay_days)

                tot_cost = float(np.sum(p_costs))
                mean_cost = float(np.mean(p_costs))
                mean_regret = float(np.mean(p_regrets))
                interv_rate = float(np.mean([1.0 if a != "NO_ACTION" else 0.0 for a in p_actions]))

                records.append({
                    "scenario": scenario_name,
                    "grid_cell": cell_id,
                    "cost_multiplier": c_mult,
                    "efficacy_multiplier": e_mult,
                    "policy_id": pol.policy_id,
                    "policy_name": pol.policy_name,
                    "mean_expected_cost": mean_cost,
                    "total_realized_cost": tot_cost,
                    "net_benefit_vs_p0": float(total_p0_cost - tot_cost),
                    "oracle_gap": float(tot_cost - total_oracle_cost),
                    "mean_regret": mean_regret,
                    "intervention_rate": interv_rate,
                    "mean_action_cost": float(np.mean(p_action_costs)),
                    "mean_residual_delay_days": float(np.mean(p_residual_delays)),
                    "provenance_tag": ProvenanceTag.SIMULATED_COST.value,
                })

        return pd.DataFrame(records)
