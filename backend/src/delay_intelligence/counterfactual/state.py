"""
Immutable State and Transition Data Structures for Experiment E10.

Guarantees:
- Strict immutability (frozen dataclasses).
- Zero hidden scenario leakage (no scenario labels or disruption types in observable state).
- Strict provenance tagging.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Union
import numpy as np
import pandas as pd

from delay_intelligence.counterfactual.provenance import (
    ProvenanceTag,
    validate_provenance_tag,
)


@dataclass(frozen=True)
class ObservableShipmentState:
    """
    Observable operational state vector S_i(t) for shipment i available at prediction anchor.

    Strictly contains ONLY observable attributes. No hidden scenario regime labels
    (e.g., S0..S6) are permitted in this structure.
    """
    shipment_id: str
    pred_date: pd.Timestamp
    line_item_value: float  # V_i (USD)
    clinical_criticality: float  # kappa_i (multiplier >= 1.0)
    transport_mode_factor: float  # lambda_mode
    fulfillment_channel: str  # 'Direct Drop' vs 'From RDC'
    delay_prob: float  # p_hat_i in [0, 1]
    expected_delay_days: float  # D_hat_i >= 0.0
    uncertainty_width: float  # W_i (CQR width) >= 0.1
    iot_temperature_c: Optional[float] = None
    iot_route_deviation_km: Optional[float] = None
    provenance_tag: str = ProvenanceTag.SYNTHETIC_E9_STATE.value

    def __post_init__(self) -> None:
        # Validate immutability bounds and integrity
        object.__setattr__(self, "shipment_id", str(self.shipment_id))
        
        if not isinstance(self.pred_date, pd.Timestamp):
            object.__setattr__(self, "pred_date", pd.to_datetime(self.pred_date))

        if self.line_item_value < 0:
            raise ValueError(f"line_item_value must be non-negative, got {self.line_item_value}")

        if self.clinical_criticality < 0.5:
            raise ValueError(f"clinical_criticality must be >= 0.5, got {self.clinical_criticality}")

        if not (0.0 <= self.delay_prob <= 1.0):
            raise ValueError(f"delay_prob must be in [0, 1], got {self.delay_prob}")

        if self.expected_delay_days < 0:
            raise ValueError(f"expected_delay_days must be >= 0, got {self.expected_delay_days}")

        if self.uncertainty_width <= 0:
            raise ValueError(f"uncertainty_width must be > 0, got {self.uncertainty_width}")

        validate_provenance_tag(self.provenance_tag)

    def to_dict(self) -> Dict[str, Any]:
        """Serializes observable state to a dictionary."""
        return {
            "shipment_id": self.shipment_id,
            "pred_date": str(self.pred_date.date()) if hasattr(self.pred_date, "date") else str(self.pred_date),
            "line_item_value": float(self.line_item_value),
            "clinical_criticality": float(self.clinical_criticality),
            "transport_mode_factor": float(self.transport_mode_factor),
            "fulfillment_channel": self.fulfillment_channel,
            "delay_prob": float(self.delay_prob),
            "expected_delay_days": float(self.expected_delay_days),
            "uncertainty_width": float(self.uncertainty_width),
            "iot_temperature_c": float(self.iot_temperature_c) if self.iot_temperature_c is not None else None,
            "iot_route_deviation_km": float(self.iot_route_deviation_km) if self.iot_route_deviation_km is not None else None,
            "provenance_tag": self.provenance_tag,
        }

    @classmethod
    def from_row(
        cls,
        row: Union[pd.Series, Dict[str, Any]],
        delay_prob: float,
        expected_delay_days: Optional[float] = None,
        uncertainty_width: Optional[float] = None,
        cost_params: Optional[Dict[str, Any]] = None,
        provenance_tag: str = ProvenanceTag.SYNTHETIC_E9_STATE.value,
    ) -> ObservableShipmentState:
        """
        Constructs an ObservableShipmentState instance from a dataset row.

        Calculates clinical criticality kappa_i and mode multiplier lambda_mode
        deterministically from observable attributes.
        """
        r = row if isinstance(row, dict) else row.to_dict()

        shipment_id = str(r.get("ID", r.get("shipment_id", r.get("Project Code", "0"))))
        pred_date = pd.to_datetime(r.get("T_pred", r.get("pred_date", "2010-01-01")))
        line_item_value = float(r.get("Line Item Value", r.get("line_item_value", r.get("line_item_value_usd", 10000.0))))

        # Clinical criticality calculation
        delta_first_line = 0.30
        delta_pediatric = 0.20
        delta_arv = 0.15
        mode_multipliers = {
            "Air": 1.00,
            "Air Charter": 0.90,
            "Truck": 1.10,
            "Ocean": 1.25,
            "Default": 1.00,
        }
        if cost_params:
            delta_first_line = float(cost_params.get("delta_first_line", delta_first_line))
            delta_pediatric = float(cost_params.get("delta_pediatric", delta_pediatric))
            delta_arv = float(cost_params.get("delta_arv", delta_arv))
            if "mode_multipliers" in cost_params:
                mode_multipliers = cost_params["mode_multipliers"]

        first_line = bool(
            r.get("First Line Designation", "") == "Yes"
            or str(r.get("First Line Designation", "")).lower() in ("yes", "1", "true")
        )
        dosage = str(r.get("Dosage", "")).lower()
        molecule = str(r.get("Molecule/Test Type", "")).lower()
        sub_class = str(r.get("Sub Classification", "")).lower()
        prod_group = str(r.get("Product Group", "")).lower()

        pediatric = bool("pediatric" in dosage or "pediatric" in molecule or "pediatric" in sub_class)
        arv = bool("arv" in prod_group or "arv" in sub_class or "antiretroviral" in molecule)

        clinical_criticality = (
            1.0
            + (delta_first_line if first_line else 0.0)
            + (delta_pediatric if pediatric else 0.0)
            + (delta_arv if arv else 0.0)
        )

        # Transport mode factor
        shipment_mode = str(r.get("Shipment Mode", "Air")).strip()
        transport_mode_factor = float(mode_multipliers.get(shipment_mode, mode_multipliers.get("Default", 1.00)))

        # Fulfillment channel
        fulfill_via = str(r.get("Fulfill Via", "Direct Drop")).strip()
        if "RDC" in fulfill_via or r.get("is_rdc_fulfillment", 0) == 1:
            fulfillment_channel = "From RDC"
        else:
            fulfillment_channel = "Direct Drop"

        # Expected delay days
        if expected_delay_days is None:
            # Benchmark default or regression baseline
            assumed = float(cost_params.get("delay_days_assumed", 12.0)) if cost_params else 12.0
            expected_delay_days = float(r.get("delay_days_pred", r.get("expected_delay_days", assumed)))
        expected_delay_days = max(0.0, float(expected_delay_days))

        # Uncertainty width
        if uncertainty_width is None:
            uncertainty_width = float(r.get("uncertainty_width", r.get("cqr_width", 10.0)))
        uncertainty_width = max(0.1, float(uncertainty_width))

        # IoT Telemetry signals (monitoring-only, if available)
        iot_temp = r.get("iot_temperature_c", None)
        if iot_temp is not None and not pd.isna(iot_temp):
            iot_temp = float(iot_temp)
        else:
            iot_temp = None

        iot_route = r.get("iot_route_deviation_km", None)
        if iot_route is not None and not pd.isna(iot_route):
            iot_route = float(iot_route)
        else:
            iot_route = None

        return cls(
            shipment_id=shipment_id,
            pred_date=pred_date,
            line_item_value=line_item_value,
            clinical_criticality=clinical_criticality,
            transport_mode_factor=transport_mode_factor,
            fulfillment_channel=fulfillment_channel,
            delay_prob=float(np.clip(delay_prob, 0.0, 1.0)),
            expected_delay_days=expected_delay_days,
            uncertainty_width=uncertainty_width,
            iot_temperature_c=iot_temp,
            iot_route_deviation_km=iot_route,
            provenance_tag=provenance_tag,
        )


@dataclass(frozen=True)
class CounterfactualTransitionResult:
    """
    Simulated outcome of applying an operational action 'a' to observable state S_i(t).

    Calculated deterministically via the state transition dynamics.
    """
    action: str
    action_cost: float
    residual_delay_days: float
    residual_delay_prob: float
    residual_delay_cost: float
    residual_risk_cost: float
    expected_realized_cost: float
    residual_uncertainty_width: float = 0.0
    provenance_tag: str = ProvenanceTag.SIMULATED_COUNTERFACTUAL.value

    def __post_init__(self) -> None:
        if self.action_cost < 0:
            raise ValueError(f"action_cost must be >= 0, got {self.action_cost}")
        if self.residual_delay_days < 0:
            raise ValueError(f"residual_delay_days must be >= 0, got {self.residual_delay_days}")
        if not (0.0 <= self.residual_delay_prob <= 1.00001):
            raise ValueError(f"residual_delay_prob must be in [0, 1], got {self.residual_delay_prob}")
        if self.residual_delay_cost < 0:
            raise ValueError(f"residual_delay_cost must be >= 0, got {self.residual_delay_cost}")
        if self.residual_risk_cost < 0:
            raise ValueError(f"residual_risk_cost must be >= 0, got {self.residual_risk_cost}")
        if self.expected_realized_cost < 0:
            raise ValueError(f"expected_realized_cost must be >= 0, got {self.expected_realized_cost}")
        validate_provenance_tag(self.provenance_tag)

    def to_dict(self) -> Dict[str, Any]:
        """Serializes transition result to a dictionary."""
        return {
            "action": self.action,
            "action_cost": float(self.action_cost),
            "residual_delay_days": float(self.residual_delay_days),
            "residual_delay_prob": float(self.residual_delay_prob),
            "residual_delay_cost": float(self.residual_delay_cost),
            "residual_risk_cost": float(self.residual_risk_cost),
            "expected_realized_cost": float(self.expected_realized_cost),
            "residual_uncertainty_width": float(self.residual_uncertainty_width),
            "provenance_tag": self.provenance_tag,
        }
