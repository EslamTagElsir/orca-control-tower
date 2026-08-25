"""
Operational Policy Suite for Experiment E10.

Implements all 6 operational policies:
- P0: NO_ACTION (Passive default fulfillment)
- P1: E8_COST_SENSITIVE (Instance Bayes-optimal decision rule with gamma*=1.20)
- P2: EXPEDITE (Targeted speed-up when holding+stockout savings > expedite fee)
- P3: TRANSPORT_MODE_REVIEW (Modal shift / routing review for friction shipments)
- P4: SUPPLIER_ESCALATION (Pre-dispatch / Direct Drop vendor SLA escalation)
- P5: HUMAN_REVIEW (Control-tower expert review for high uncertainty W_i > 14d or telemetry alerts)
"""

from __future__ import annotations

import abc
import math
from typing import Any, Dict, Optional, Type, Union
import numpy as np

from delay_intelligence.counterfactual.state import ObservableShipmentState


class BasePolicy(abc.ABC):
    """
    Abstract base class for all operational delay intelligence policies.

    Policies operate exclusively on observable shipment states S_i(t).
    """

    @property
    @abc.abstractmethod
    def policy_id(self) -> str:
        """Unique policy identifier (e.g. 'P0', 'P1')."""
        pass

    @property
    @abc.abstractmethod
    def policy_name(self) -> str:
        """Human-readable policy name."""
        pass

    @abc.abstractmethod
    def select_action(
        self,
        state: ObservableShipmentState,
        cost_params: Dict[str, Any],
    ) -> str:
        """
        Selects an operational action a in A given observable state S_i(t) and cost parameters.

        Args:
            state: Observable shipment state.
            cost_params: Active cost scenario parameters.

        Returns:
            Action string (e.g. 'NO_ACTION', 'EXPEDITE', etc.)
        """
        pass


class PolicyP0_NoAction(BasePolicy):
    """P0: Default passive business-as-usual fulfillment with zero intervention."""

    @property
    def policy_id(self) -> str:
        return "P0"

    @property
    def policy_name(self) -> str:
        return "P0_NO_ACTION"

    def select_action(
        self,
        state: ObservableShipmentState,
        cost_params: Dict[str, Any],
    ) -> str:
        return "NO_ACTION"


class PolicyP1_E8CostSensitive(BasePolicy):
    """
    P1: E8 Cost-Sensitive Decision Rule.

    Applies tuned Bayes-optimal thresholding tau*_i with gamma* = 1.20.
    Triggers EXPEDITE when delay_prob >= tau*_i.
    """

    def __init__(self, gamma_multiplier: float = 1.20):
        self.gamma_multiplier = float(gamma_multiplier)

    @property
    def policy_id(self) -> str:
        return "P1"

    @property
    def policy_name(self) -> str:
        return "P1_E8_COST_SENSITIVE"

    def compute_threshold(
        self,
        state: ObservableShipmentState,
        cost_params: Dict[str, Any],
    ) -> float:
        """Computes instance-dependent Bayes-optimal decision threshold tau*_i."""
        v = state.line_item_value
        cp = cost_params

        kappa = state.clinical_criticality
        lambda_mode = state.transport_mode_factor

        c_triage = float(cp.get("c_triage_base", 50.0))
        beta_a = float(cp.get("beta_audit", 10.0))
        c_inq = float(cp.get("c_direct_inquiry", 30.0) if state.fulfillment_channel == "Direct Drop" else cp.get("c_rdc_inquiry", 10.0))
        fp_cost = c_triage + beta_a * math.log(1.0 + v) + c_inq

        c_daily = float(cp.get("c_daily_base", 150.0))
        rho = float(cp.get("rho_value", 0.0010))
        c_fixed_stockout = float(cp.get("c_fixed_stockout", 500.0))
        daily_holding_penalty = c_daily + rho * v

        delay_days = state.expected_delay_days if state.expected_delay_days > 0 else float(cp.get("delay_days_assumed", 12.0))
        days_saved = float(cp.get("days_saved_efficacy", 5.0))

        fn_cost = kappa * lambda_mode * (c_fixed_stockout + daily_holding_penalty * delay_days)

        c_exp = float(cp.get("c_expedite_base", 500.0))
        gamma_exp = float(cp.get("gamma_expedite", 0.0050))
        intervention_cost = c_exp + gamma_exp * v

        residual_days = max(0.0, delay_days - days_saved)
        residual_delay_cost = kappa * lambda_mode * daily_holding_penalty * residual_days

        net_benefit = fn_cost - (intervention_cost + residual_delay_cost)

        if net_benefit <= 0.0:
            return 1.0  # Cannot justify intervention even with p=1.0

        tau_star = fp_cost / (self.gamma_multiplier * net_benefit + fp_cost)
        return float(np.clip(tau_star, 0.0, 1.0))

    def select_action(
        self,
        state: ObservableShipmentState,
        cost_params: Dict[str, Any],
    ) -> str:
        tau_star = self.compute_threshold(state, cost_params)
        if state.delay_prob >= tau_star:
            return "EXPEDITE"
        return "NO_ACTION"


class PolicyP2_Expedite(BasePolicy):
    """
    P2: Proactive Expedited Logistics.

    Targeted speed-up triggered when expected delay holding savings exceed expediting fee.
    """

    @property
    def policy_id(self) -> str:
        return "P2"

    @property
    def policy_name(self) -> str:
        return "P2_EXPEDITE"

    def select_action(
        self,
        state: ObservableShipmentState,
        cost_params: Dict[str, Any],
    ) -> str:
        v = state.line_item_value
        cp = cost_params

        c_daily = float(cp.get("c_daily_base", 150.0))
        rho = float(cp.get("rho_value", 0.0010))
        holding_rate_daily = c_daily * state.transport_mode_factor + rho * v

        days_saved = 3.0
        eff_days = min(state.expected_delay_days, days_saved) if state.expected_delay_days > 0 else days_saved

        expected_savings = state.delay_prob * holding_rate_daily * eff_days

        c_exp = float(cp.get("c_expedite_base", 500.0))
        gamma_exp = float(cp.get("gamma_expedite", 0.0050))
        expedite_fee = c_exp + gamma_exp * v

        if expected_savings > expedite_fee:
            return "EXPEDITE"
        return "NO_ACTION"


class PolicyP3_TransportModeReview(BasePolicy):
    """
    P3: Transport Mode / Routing Review.

    Targeted modal shift triggered for friction modes (Air/Truck/Ocean) when expected modal
    savings exceed modal review cost.
    """

    @property
    def policy_id(self) -> str:
        return "P3"

    @property
    def policy_name(self) -> str:
        return "P3_TRANSPORT_MODE_REVIEW"

    def select_action(
        self,
        state: ObservableShipmentState,
        cost_params: Dict[str, Any],
    ) -> str:
        v = state.line_item_value
        cp = cost_params

        c_daily = float(cp.get("c_daily_base", 150.0))
        rho = float(cp.get("rho_value", 0.0010))
        holding_rate_daily = c_daily * state.transport_mode_factor + rho * v

        days_saved = 2.0
        eff_days = min(state.expected_delay_days, days_saved) if state.expected_delay_days > 0 else days_saved

        expected_savings = state.delay_prob * holding_rate_daily * eff_days

        c_mode_base = float(cp.get("c_mode_review_base", 200.0))
        beta_m = float(cp.get("beta_mode", 20.0))
        mode_review_cost = c_mode_base + beta_m * math.log(1.0 + v)

        if expected_savings > mode_review_cost and state.transport_mode_factor >= 0.95:
            return "TRANSPORT_MODE_REVIEW"
        return "NO_ACTION"


class PolicyP4_SupplierEscalation(BasePolicy):
    """
    P4: Supplier Escalation & SLA Enforcement.

    Pre-dispatch vendor escalation triggered for Direct Drop shipments where -15% risk reduction
    yields expected savings exceeding escalation administrative friction.
    """

    @property
    def policy_id(self) -> str:
        return "P4"

    @property
    def policy_name(self) -> str:
        return "P4_SUPPLIER_ESCALATION"

    def select_action(
        self,
        state: ObservableShipmentState,
        cost_params: Dict[str, Any],
    ) -> str:
        v = state.line_item_value
        cp = cost_params

        c_daily = float(cp.get("c_daily_base", 150.0))
        rho = float(cp.get("rho_value", 0.0010))
        c_fixed_stockout = float(cp.get("c_fixed_stockout", 500.0))
        holding_rate_daily = c_daily * state.transport_mode_factor + rho * v

        baseline_unmitigated_cost = (
            holding_rate_daily * state.expected_delay_days
            + c_fixed_stockout * state.clinical_criticality
        )

        expected_risk_savings = state.delay_prob * 0.15 * baseline_unmitigated_cost

        c_esc = float(cp.get("c_escalation_base", 150.0))
        c_inq = float(cp.get("c_direct_inquiry", 30.0) if state.fulfillment_channel == "Direct Drop" else cp.get("c_rdc_inquiry", 10.0))
        escalation_cost = c_esc + c_inq

        if expected_risk_savings > escalation_cost and state.fulfillment_channel == "Direct Drop":
            return "SUPPLIER_ESCALATION"
        return "NO_ACTION"


class PolicyP5_HumanReview(BasePolicy):
    """
    P5: Control-Tower Human Expert Review.

    Triage triggered by high epistemic uncertainty (W_i > 14.0 days) or telemetry alerts.
    """

    @property
    def policy_id(self) -> str:
        return "P5"

    @property
    def policy_name(self) -> str:
        return "P5_HUMAN_REVIEW"

    def select_action(
        self,
        state: ObservableShipmentState,
        cost_params: Dict[str, Any],
    ) -> str:
        # Check conformal uncertainty width trigger
        if state.uncertainty_width > 14.0:
            return "HUMAN_REVIEW"

        # Check IoT telemetry triggers if available
        if state.iot_temperature_c is not None and (state.iot_temperature_c < 2.0 or state.iot_temperature_c > 8.0):
            return "HUMAN_REVIEW"

        if state.iot_route_deviation_km is not None and state.iot_route_deviation_km > 50.0:
            return "HUMAN_REVIEW"

        return "NO_ACTION"


# Registry of standard policies
POLICY_REGISTRY: Dict[str, BasePolicy] = {
    "P0": PolicyP0_NoAction(),
    "P0_NO_ACTION": PolicyP0_NoAction(),
    "NO_ACTION": PolicyP0_NoAction(),
    "P1": PolicyP1_E8CostSensitive(gamma_multiplier=1.20),
    "P1_E8_COST_SENSITIVE": PolicyP1_E8CostSensitive(gamma_multiplier=1.20),
    "E8_COST_SENSITIVE": PolicyP1_E8CostSensitive(gamma_multiplier=1.20),
    "P2": PolicyP2_Expedite(),
    "P2_EXPEDITE": PolicyP2_Expedite(),
    "EXPEDITE": PolicyP2_Expedite(),
    "P3": PolicyP3_TransportModeReview(),
    "P3_TRANSPORT_MODE_REVIEW": PolicyP3_TransportModeReview(),
    "TRANSPORT_MODE_REVIEW": PolicyP3_TransportModeReview(),
    "P4": PolicyP4_SupplierEscalation(),
    "P4_SUPPLIER_ESCALATION": PolicyP4_SupplierEscalation(),
    "SUPPLIER_ESCALATION": PolicyP4_SupplierEscalation(),
    "P5": PolicyP5_HumanReview(),
    "P5_HUMAN_REVIEW": PolicyP5_HumanReview(),
    "HUMAN_REVIEW": PolicyP5_HumanReview(),
}


def get_policy(name_or_id: str) -> BasePolicy:
    """Retrieves policy instance by name or ID."""
    key = name_or_id.strip()
    if key in POLICY_REGISTRY:
        return POLICY_REGISTRY[key]
    raise KeyError(f"Policy '{name_or_id}' not found. Available: {sorted(list(POLICY_REGISTRY.keys()))}")


def list_standard_policies() -> Dict[str, BasePolicy]:
    """Returns dictionary of standard unique policies P0-P5."""
    return {
        "P0": PolicyP0_NoAction(),
        "P1": PolicyP1_E8CostSensitive(gamma_multiplier=1.20),
        "P2": PolicyP2_Expedite(),
        "P3": PolicyP3_TransportModeReview(),
        "P4": PolicyP4_SupplierEscalation(),
        "P5": PolicyP5_HumanReview(),
    }
