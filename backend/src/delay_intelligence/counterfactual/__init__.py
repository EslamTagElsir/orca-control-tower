"""
Counterfactual Policy Evaluation Package (Phase 2 — Experiment E10).

Provides:
- ObservableShipmentState and CounterfactualTransitionResult immutable data structures.
- DeterministicTransitionEngine with frozen E9 action dynamics.
- Operational policy suite (P0..P5).
- Offline isolated OfflineOraclePolicy.
- Capacity-constrained ReviewBudgetAllocator.
- Multi-dimensional SensitivityGridEvaluator (3x3 grid).
- Temporal CounterfactualEvaluator for rolling-origin evaluation.
- Scientific provenance guardrails and non-causal verification.
"""

from __future__ import annotations

from delay_intelligence.counterfactual.budget import ReviewBudgetAllocator
from delay_intelligence.counterfactual.evaluator import CounterfactualEvaluator
from delay_intelligence.counterfactual.oracle import OfflineOraclePolicy
from delay_intelligence.counterfactual.policies import (
    POLICY_REGISTRY,
    BasePolicy,
    PolicyP0_NoAction,
    PolicyP1_E8CostSensitive,
    PolicyP2_Expedite,
    PolicyP3_TransportModeReview,
    PolicyP4_SupplierEscalation,
    PolicyP5_HumanReview,
    get_policy,
    list_standard_policies,
)
from delay_intelligence.counterfactual.provenance import (
    NON_CAUSAL_DISCLAIMER,
    ProvenanceTag,
    ProvenanceValidationError,
    attach_provenance_metadata,
    get_provenance_header,
    validate_provenance_tag,
)
from delay_intelligence.counterfactual.sensitivity import (
    SENSITIVITY_GRID_CELLS,
    SensitivityGridEvaluator,
)
from delay_intelligence.counterfactual.state import (
    CounterfactualTransitionResult,
    ObservableShipmentState,
)
from delay_intelligence.counterfactual.transitions import (
    DeterministicTransitionEngine,
    apply_counterfactual_transition,
    normalize_action_name,
)

__all__ = [
    "ObservableShipmentState",
    "CounterfactualTransitionResult",
    "DeterministicTransitionEngine",
    "apply_counterfactual_transition",
    "normalize_action_name",
    "BasePolicy",
    "PolicyP0_NoAction",
    "PolicyP1_E8CostSensitive",
    "PolicyP2_Expedite",
    "PolicyP3_TransportModeReview",
    "PolicyP4_SupplierEscalation",
    "PolicyP5_HumanReview",
    "POLICY_REGISTRY",
    "get_policy",
    "list_standard_policies",
    "OfflineOraclePolicy",
    "ReviewBudgetAllocator",
    "SensitivityGridEvaluator",
    "SENSITIVITY_GRID_CELLS",
    "CounterfactualEvaluator",
    "ProvenanceTag",
    "ProvenanceValidationError",
    "validate_provenance_tag",
    "attach_provenance_metadata",
    "get_provenance_header",
    "NON_CAUSAL_DISCLAIMER",
]
