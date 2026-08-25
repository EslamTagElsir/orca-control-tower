"""
Chronological Drift Detection Package (E6.5).
Provides mathematical metrics, multi-dimensional detection engine,
tier-based trigger policy, and temporal evaluation runners.
"""

from delay_intelligence.drift.schemas import (
    DriftStatus,
    FeatureTier,
    FeatureDriftResult,
    FeatureDriftSummary,
    PredictionDriftResult,
    TargetDriftResult,
    UncertaintyDriftResult,
    WindowMetadata,
    TriggerEvaluationResult,
    DriftReport,
)
from delay_intelligence.drift.metrics import (
    calculate_psi,
    calculate_normalized_wasserstein,
    calculate_ks_test,
    calculate_benjamini_hochberg_fdr,
    calculate_categorical_psi,
    calculate_categorical_jsd,
    calculate_chi_square_test,
    calculate_prediction_drift,
    calculate_target_drift,
    calculate_uncertainty_drift,
)
from delay_intelligence.drift.policy import (
    DriftTriggerPolicy,
    DEFAULT_TIER_1_FEATURES,
    DEFAULT_TIER_2_FEATURES,
    TIER_WEIGHTS,
)
from delay_intelligence.drift.detector import ChronologicalDriftDetector
from delay_intelligence.drift.runner import DriftRunner

__all__ = [
    "DriftStatus",
    "FeatureTier",
    "FeatureDriftResult",
    "FeatureDriftSummary",
    "PredictionDriftResult",
    "TargetDriftResult",
    "UncertaintyDriftResult",
    "WindowMetadata",
    "TriggerEvaluationResult",
    "DriftReport",
    "calculate_psi",
    "calculate_normalized_wasserstein",
    "calculate_ks_test",
    "calculate_benjamini_hochberg_fdr",
    "calculate_categorical_psi",
    "calculate_categorical_jsd",
    "calculate_chi_square_test",
    "calculate_prediction_drift",
    "calculate_target_drift",
    "calculate_uncertainty_drift",
    "DriftTriggerPolicy",
    "DEFAULT_TIER_1_FEATURES",
    "DEFAULT_TIER_2_FEATURES",
    "TIER_WEIGHTS",
    "ChronologicalDriftDetector",
    "DriftRunner",
]
