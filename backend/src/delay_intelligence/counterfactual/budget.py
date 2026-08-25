"""
Operational Review Budget Prioritization Engine for Experiment E10.

Under operational capacity limits K in {0.05, 0.10, 0.20} (5%, 10%, 20% of shipment volume):
1. Prioritizes shipments by Expected Net Benefit:
   Score_i = max_{a in A_intervene} (E[Cost(NO_ACTION | S_i)] - E[Cost(a | S_i)])
2. Top M = floor(K * N) shipments with Score_i > 0 receive their optimal intervention.
3. Remaining shipments default to NO_ACTION.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union
import numpy as np
import pandas as pd

from delay_intelligence.counterfactual.provenance import ProvenanceTag
from delay_intelligence.counterfactual.state import (
    CounterfactualTransitionResult,
    ObservableShipmentState,
)
from delay_intelligence.counterfactual.transitions import (
    DeterministicTransitionEngine,
    normalize_action_name,
)


class ReviewBudgetAllocator:
    """
    Capacity-constrained review budget allocation engine.
    """

    def __init__(
        self,
        cost_params: Optional[Dict[str, Any]] = None,
        candidate_actions: Optional[List[str]] = None,
    ):
        self.cost_params = cost_params or {}
        self.candidate_actions = candidate_actions or [
            "EXPEDITE",
            "TRANSPORT_MODE_REVIEW",
            "SUPPLIER_ESCALATION",
            "HUMAN_REVIEW",
        ]
        self.transition_engine = DeterministicTransitionEngine(cost_params=self.cost_params)

    def compute_shipment_benefit_scores(
        self,
        states: Sequence[ObservableShipmentState],
        cost_multiplier: float = 1.0,
        efficacy_multiplier: float = 1.0,
    ) -> List[Dict[str, Any]]:
        """
        Computes the maximum net benefit score and best intervention action for each shipment.

        Args:
            states: Sequence of ObservableShipmentState instances.
            cost_multiplier: Sensitivity cost multiplier.
            efficacy_multiplier: Sensitivity efficacy multiplier.

        Returns:
            List of score dictionaries with keys:
            ['shipment_id', 'no_action_cost', 'best_action', 'best_action_cost',
             'max_net_benefit', 'transition_result']
        """
        scores = []
        for state in states:
            # Baseline NO_ACTION cost
            no_action_res = self.transition_engine.transition(
                state=state,
                action="NO_ACTION",
                cost_multiplier=cost_multiplier,
                efficacy_multiplier=efficacy_multiplier,
            )
            c_no_action = no_action_res.expected_realized_cost

            best_act = "NO_ACTION"
            best_cost = c_no_action
            best_benefit = 0.0
            best_res = no_action_res

            for act in self.candidate_actions:
                res = self.transition_engine.transition(
                    state=state,
                    action=act,
                    cost_multiplier=cost_multiplier,
                    efficacy_multiplier=efficacy_multiplier,
                )
                benefit = float(c_no_action - res.expected_realized_cost)
                if benefit > best_benefit:
                    best_benefit = benefit
                    best_act = act
                    best_cost = res.expected_realized_cost
                    best_res = res

            scores.append({
                "shipment_id": state.shipment_id,
                "state": state,
                "no_action_cost": float(c_no_action),
                "best_action": best_act,
                "best_action_cost": float(best_cost),
                "max_net_benefit": float(best_benefit),
                "best_transition_result": best_res,
                "no_action_transition_result": no_action_res,
            })
        return scores

    def allocate_budget(
        self,
        states: Sequence[ObservableShipmentState],
        capacity_k: float = 0.10,
        cost_multiplier: float = 1.0,
        efficacy_multiplier: float = 1.0,
    ) -> Dict[str, Any]:
        """
        Allocates review capacity K to the top-ranking shipments by expected net benefit.

        Args:
            states: Sequence of ObservableShipmentState instances.
            capacity_k: Capacity fraction K in (0, 1] (e.g. 0.05, 0.10, 0.20).
            cost_multiplier: Sensitivity cost multiplier.
            efficacy_multiplier: Sensitivity efficacy multiplier.

        Returns:
            Dictionary with allocation summary and shipment-level records.
        """
        n_total = len(states)
        if n_total == 0:
            return {
                "capacity_k": capacity_k,
                "total_shipments": 0,
                "capacity_limit_count": 0,
                "allocated_count": 0,
                "total_realized_cost": 0.0,
                "total_no_action_cost": 0.0,
                "total_net_benefit": 0.0,
                "records": [],
            }

        scores = self.compute_shipment_benefit_scores(
            states,
            cost_multiplier=cost_multiplier,
            efficacy_multiplier=efficacy_multiplier,
        )

        # Sort descending by net benefit, with deterministic tie-breaking on shipment_id
        scores_sorted = sorted(
            scores,
            key=lambda x: (x["max_net_benefit"], str(x["shipment_id"])),
            reverse=True,
        )

        capacity_limit = int(math.floor(capacity_k * n_total))
        allocated_records = []
        allocated_count = 0
        total_realized_cost = 0.0
        total_no_action_cost = 0.0

        for i, item in enumerate(scores_sorted):
            total_no_action_cost += item["no_action_cost"]
            # Allocate intervention if within budget capacity AND net benefit is strictly positive
            if i < capacity_limit and item["max_net_benefit"] > 0.0:
                allocated_count += 1
                action_assigned = item["best_action"]
                realized_cost = item["best_action_cost"]
                res = item["best_transition_result"]
                net_benefit = item["max_net_benefit"]
            else:
                action_assigned = "NO_ACTION"
                realized_cost = item["no_action_cost"]
                res = item["no_action_transition_result"]
                net_benefit = 0.0

            total_realized_cost += realized_cost

            allocated_records.append({
                "shipment_id": item["shipment_id"],
                "rank": i + 1,
                "action_assigned": action_assigned,
                "action_cost": res.action_cost,
                "realized_cost": realized_cost,
                "no_action_cost": item["no_action_cost"],
                "net_benefit": net_benefit,
                "residual_delay_days": res.residual_delay_days,
                "residual_delay_prob": res.residual_delay_prob,
                "is_intervened": bool(action_assigned != "NO_ACTION"),
                "provenance_tag": ProvenanceTag.SIMULATED_COUNTERFACTUAL.value,
            })

        total_net_benefit = total_no_action_cost - total_realized_cost

        return {
            "capacity_k": float(capacity_k),
            "total_shipments": n_total,
            "capacity_limit_count": capacity_limit,
            "allocated_count": allocated_count,
            "utilization_pct": float((allocated_count / capacity_limit) * 100.0) if capacity_limit > 0 else 0.0,
            "total_realized_cost": float(total_realized_cost),
            "total_no_action_cost": float(total_no_action_cost),
            "total_net_benefit": float(total_net_benefit),
            "mean_cost_per_shipment": float(total_realized_cost / n_total),
            "mean_benefit_per_shipment": float(total_net_benefit / n_total),
            "records": allocated_records,
        }
