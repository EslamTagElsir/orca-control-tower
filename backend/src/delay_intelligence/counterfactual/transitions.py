"""
Deterministic State Transition Engine for Experiment E10.

Applies frozen E9 action effects:
- EXPEDITE: Delta D = -3.0 days
- TRANSPORT_MODE_REVIEW: Delta D = -2.0 days
- SUPPLIER_ESCALATION: Delta R = -15% relative risk
- HUMAN_REVIEW: Delta W = -50% conformal uncertainty width
- NO_ACTION: Delta D = 0.0, Delta R = 0.0, Delta W = 0.0

Computes:
- Action cost C_action(a, i)
- Residual delay D_tilde_i(a)
- Residual risk p_tilde_i(a)
- Residual uncertainty width W_tilde_i(a)
- Residual delay cost E[C_residual_delay(a | S_i)]
- Residual risk cost E[C_risk(a | S_i)]
- Expected realized cost E[Cost(a | S_i)]
"""

from __future__ import annotations

import math
from typing import Any, Dict, Optional, Tuple, Union
import numpy as np

from delay_intelligence.counterfactual.provenance import ProvenanceTag
from delay_intelligence.counterfactual.state import (
    CounterfactualTransitionResult,
    ObservableShipmentState,
)


def normalize_action_name(action: str) -> str:
    """Normalizes action code across policy prefix styles."""
    a = action.upper().strip()
    if a in ("P0", "P0_NO_ACTION", "NO_ACTION", "DO_NOTHING", "DEFAULT"):
        return "NO_ACTION"
    if a in ("P1", "P1_E8_COST_SENSITIVE", "E8_COST_SENSITIVE", "COST_SENSITIVE"):
        return "E8_COST_SENSITIVE"
    if a in ("P2", "P2_EXPEDITE", "EXPEDITE"):
        return "EXPEDITE"
    if a in ("P3", "P3_TRANSPORT_MODE_REVIEW", "TRANSPORT_MODE_REVIEW", "MODE_REVIEW"):
        return "TRANSPORT_MODE_REVIEW"
    if a in ("P4", "P4_SUPPLIER_ESCALATION", "SUPPLIER_ESCALATION", "ESCALATION"):
        return "SUPPLIER_ESCALATION"
    if a in ("P5", "P5_HUMAN_REVIEW", "HUMAN_REVIEW", "MANUAL_REVIEW", "TRIAGE"):
        return "HUMAN_REVIEW"
    return a


class DeterministicTransitionEngine:
    """
    Deterministic state transition and cost engine parameterized by frozen assumptions.
    """

    def __init__(self, cost_params: Optional[Dict[str, Any]] = None):
        """
        Initializes engine with cost scenario parameters.

        Default parameters reflect Base Cost Scenario.
        """
        self.cost_params = cost_params or {}

    def compute_action_cost(
        self,
        action: str,
        state: ObservableShipmentState,
        cost_multiplier: float = 1.0,
    ) -> float:
        """
        Computes direct operational cost of executing action 'a' on shipment state.

        Args:
            action: Action identifier.
            state: Observable shipment state.
            cost_multiplier: Sensitivity multiplier for action costs.

        Returns:
            Direct operational cost in USD.
        """
        norm_action = normalize_action_name(action)
        cp = self.cost_params
        v = state.line_item_value

        if norm_action == "NO_ACTION":
            return 0.0

        if norm_action == "EXPEDITE":
            c_base = float(cp.get("c_expedite_base", 500.0))
            gamma = float(cp.get("gamma_expedite", 0.0050))
            return float(cost_multiplier * (c_base + gamma * v))

        if norm_action == "TRANSPORT_MODE_REVIEW":
            c_base = float(cp.get("c_mode_review_base", 200.0))
            beta_m = float(cp.get("beta_mode", 20.0))
            return float(cost_multiplier * (c_base + beta_m * math.log(1.0 + v)))

        if norm_action == "SUPPLIER_ESCALATION":
            c_base = float(cp.get("c_escalation_base", 150.0))
            if state.fulfillment_channel == "Direct Drop":
                c_inq = float(cp.get("c_direct_inquiry", 30.0))
            else:
                c_inq = float(cp.get("c_rdc_inquiry", 10.0))
            return float(cost_multiplier * (c_base + c_inq))

        if norm_action == "HUMAN_REVIEW":
            c_base = float(cp.get("c_triage_base", 50.0))
            beta_a = float(cp.get("beta_audit", 10.0))
            return float(cost_multiplier * (c_base + beta_a * math.log(1.0 + v)))

        raise ValueError(f"Unknown operational action '{action}'")

    def transition(
        self,
        state: ObservableShipmentState,
        action: str,
        cost_multiplier: float = 1.0,
        efficacy_multiplier: float = 1.0,
    ) -> CounterfactualTransitionResult:
        """
        Applies action 'a' to state S_i and deterministically computes counterfactual outcome.

        Args:
            state: Observable shipment state.
            action: Selected action.
            cost_multiplier: Multiplier for action costs (sensitivity grid).
            efficacy_multiplier: Multiplier for action efficacy (sensitivity grid).

        Returns:
            CounterfactualTransitionResult containing residual states and realized costs.
        """
        norm_action = normalize_action_name(action)
        cp = self.cost_params

        # Base frozen action deltas
        if norm_action == "NO_ACTION":
            delta_d = 0.0
            delta_r = 0.0
            delta_w = 0.0
        elif norm_action == "EXPEDITE":
            delta_d = -3.0 * efficacy_multiplier
            delta_r = 0.0
            delta_w = 0.0
        elif norm_action == "TRANSPORT_MODE_REVIEW":
            delta_d = -2.0 * efficacy_multiplier
            delta_r = 0.0
            delta_w = 0.0
        elif norm_action == "SUPPLIER_ESCALATION":
            delta_d = 0.0
            delta_r = -0.15 * efficacy_multiplier
            delta_w = 0.0
        elif norm_action == "HUMAN_REVIEW":
            delta_d = 0.0
            delta_r = 0.0
            delta_w = -0.50 * efficacy_multiplier
        else:
            raise ValueError(f"Unknown operational action '{action}'")

        action_cost = self.compute_action_cost(norm_action, state, cost_multiplier=cost_multiplier)

        # State transitions
        residual_delay_days = max(0.0, float(state.expected_delay_days + delta_d))
        residual_delay_prob = float(np.clip(state.delay_prob * (1.0 + delta_r), 0.0, 1.0))
        residual_uncertainty_width = max(0.1, float(state.uncertainty_width * (1.0 + delta_w)))

        # Economic parameters
        c_daily_base = float(cp.get("c_daily_base", 150.0))
        rho_value = float(cp.get("rho_value", 0.0010))
        c_fixed_stockout = float(cp.get("c_fixed_stockout", 500.0))

        holding_rate_daily = c_daily_base * state.transport_mode_factor + rho_value * state.line_item_value

        # Expected residual costs
        residual_delay_cost = float(residual_delay_prob * holding_rate_daily * residual_delay_days)
        residual_risk_cost = float(residual_delay_prob * c_fixed_stockout * state.clinical_criticality)

        expected_realized_cost = float(action_cost + residual_delay_cost + residual_risk_cost)

        return CounterfactualTransitionResult(
            action=norm_action,
            action_cost=action_cost,
            residual_delay_days=residual_delay_days,
            residual_delay_prob=residual_delay_prob,
            residual_delay_cost=residual_delay_cost,
            residual_risk_cost=residual_risk_cost,
            expected_realized_cost=expected_realized_cost,
            residual_uncertainty_width=residual_uncertainty_width,
            provenance_tag=ProvenanceTag.SIMULATED_COUNTERFACTUAL.value,
        )


def apply_counterfactual_transition(
    state: ObservableShipmentState,
    action: str,
    cost_params: Dict[str, Any],
    cost_multiplier: float = 1.0,
    efficacy_multiplier: float = 1.0,
) -> CounterfactualTransitionResult:
    """
    Functional helper to compute state transition.
    """
    engine = DeterministicTransitionEngine(cost_params=cost_params)
    return engine.transition(
        state=state,
        action=action,
        cost_multiplier=cost_multiplier,
        efficacy_multiplier=efficacy_multiplier,
    )
