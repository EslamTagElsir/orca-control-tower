"""
Isolated Offline Omniscient Oracle Engine for Experiment E10.

CRITICAL ARCHITECTURAL ISOLATION CONTRACT:
This module implements the theoretical offline lower-bound benchmark:
    a*_i = argmin_{a in A} E[Cost(a | S_i)]

The OfflineOraclePolicy is STRICTLY OFFLINE and MUST NEVER be imported, referenced,
or executed during online policy execution, model training, threshold tuning, or operational selection.
It is evaluated exclusively post-freeze to establish theoretical benchmark bounds, Oracle Gap,
and Policy Regret.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np

from delay_intelligence.counterfactual.provenance import ProvenanceTag
from delay_intelligence.counterfactual.state import (
    CounterfactualTransitionResult,
    ObservableShipmentState,
)
from delay_intelligence.counterfactual.transitions import (
    DeterministicTransitionEngine,
    normalize_action_name,
)

# Standard candidate action space for the Oracle
ORACLE_ACTION_SPACE: List[str] = [
    "NO_ACTION",
    "EXPEDITE",
    "TRANSPORT_MODE_REVIEW",
    "SUPPLIER_ESCALATION",
    "HUMAN_REVIEW",
]


class OfflineOraclePolicy:
    """
    Offline omniscient cost-minimizing oracle benchmark.

    Evaluates expected cost across all possible operational actions and identifies
    the theoretical minimum cost action.
    """

    def __init__(
        self,
        cost_params: Optional[Dict[str, Any]] = None,
        action_space: Optional[List[str]] = None,
    ):
        self.cost_params = cost_params or {}
        self.action_space = action_space or list(ORACLE_ACTION_SPACE)
        self.transition_engine = DeterministicTransitionEngine(cost_params=self.cost_params)

    def evaluate_all_actions(
        self,
        state: ObservableShipmentState,
        cost_multiplier: float = 1.0,
        efficacy_multiplier: float = 1.0,
    ) -> Dict[str, CounterfactualTransitionResult]:
        """
        Computes the deterministic transition outcome for every candidate action.

        Args:
            state: Observable shipment state.
            cost_multiplier: Sensitivity cost multiplier.
            efficacy_multiplier: Sensitivity efficacy multiplier.

        Returns:
            Dictionary mapping action name to CounterfactualTransitionResult.
        """
        results: Dict[str, CounterfactualTransitionResult] = {}
        for act in self.action_space:
            res = self.transition_engine.transition(
                state=state,
                action=act,
                cost_multiplier=cost_multiplier,
                efficacy_multiplier=efficacy_multiplier,
            )
            results[res.action] = res
        return results

    def evaluate_optimal_action(
        self,
        state: ObservableShipmentState,
        cost_multiplier: float = 1.0,
        efficacy_multiplier: float = 1.0,
    ) -> Tuple[str, float, CounterfactualTransitionResult]:
        """
        Finds the theoretical cost-minimizing action a*_i = argmin E[Cost(a | S_i)].

        Args:
            state: Observable shipment state.
            cost_multiplier: Sensitivity cost multiplier.
            efficacy_multiplier: Sensitivity efficacy multiplier.

        Returns:
            Tuple of (optimal_action_name, min_expected_cost, optimal_transition_result).
        """
        action_results = self.evaluate_all_actions(
            state,
            cost_multiplier=cost_multiplier,
            efficacy_multiplier=efficacy_multiplier,
        )

        best_action = "NO_ACTION"
        min_cost = float("inf")
        best_result = None

        # Sort actions to ensure deterministic tie-breaking: prefer NO_ACTION if cost tie
        for act in sorted(action_results.keys()):
            res = action_results[act]
            if res.expected_realized_cost < min_cost:
                min_cost = res.expected_realized_cost
                best_action = act
                best_result = res

        return best_action, min_cost, best_result

    def compute_policy_regret(
        self,
        policy_action: str,
        state: ObservableShipmentState,
        cost_multiplier: float = 1.0,
        efficacy_multiplier: float = 1.0,
    ) -> Tuple[float, float, str]:
        """
        Computes policy regret: E[Cost(P_k | S_i)] - E[Cost(Oracle | S_i)] >= 0.

        Args:
            policy_action: Action chosen by policy P_k.
            state: Observable shipment state.
            cost_multiplier: Sensitivity cost multiplier.
            efficacy_multiplier: Sensitivity efficacy multiplier.

        Returns:
            Tuple of (regret_usd, oracle_cost_usd, oracle_best_action).
        """
        best_action, oracle_cost, _ = self.evaluate_optimal_action(
            state,
            cost_multiplier=cost_multiplier,
            efficacy_multiplier=efficacy_multiplier,
        )

        policy_res = self.transition_engine.transition(
            state=state,
            action=policy_action,
            cost_multiplier=cost_multiplier,
            efficacy_multiplier=efficacy_multiplier,
        )

        regret = max(0.0, float(policy_res.expected_realized_cost - oracle_cost))
        return regret, oracle_cost, best_action
