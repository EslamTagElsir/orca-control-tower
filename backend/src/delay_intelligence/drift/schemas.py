"""
Drift Detection Schema Definitions.
Defines data structures, metric containers, status enums, and reports
for the 4-dimensional chronological drift detection system.
"""

from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class DriftStatus(str, Enum):
    GREEN = "GREEN"
    YELLOW = "YELLOW"
    RED = "RED"
    INSUFFICIENT_SAMPLE = "INSUFFICIENT_SAMPLE"


class FeatureTier(str, Enum):
    TIER_1 = "TIER_1"  # Critical / High-SHAP operational drivers (Weight: 3.0)
    TIER_2 = "TIER_2"  # Secondary predictors (Weight: 1.5)
    TIER_3 = "TIER_3"  # Contextual / Metadata features (Weight: 0.5)


class FeatureDriftResult(BaseModel):
    feature_name: str
    feature_type: str  # "numerical" or "categorical"
    tier: FeatureTier
    psi: float
    wasserstein: Optional[float] = None
    normalized_wasserstein: Optional[float] = None
    ks_stat: Optional[float] = None
    ks_pvalue: Optional[float] = None
    ks_fdr_rejected: Optional[bool] = None
    jsd: Optional[float] = None
    js_distance: Optional[float] = None
    chi2_stat: Optional[float] = None
    chi2_pvalue: Optional[float] = None
    status: DriftStatus = DriftStatus.GREEN


class FeatureDriftSummary(BaseModel):
    total_features: int
    drifted_features_count: int
    tier1_red_count: int
    tier1_yellow_count: int
    tier2_red_count: int
    tier2_yellow_count: int
    max_psi: float
    max_psi_feature: str
    weighted_feature_score: float
    status: DriftStatus
    feature_metrics: Dict[str, FeatureDriftResult]


class PredictionDriftResult(BaseModel):
    prob_psi: float
    prob_wasserstein: float
    prob_mean_delta: float
    prob_status: DriftStatus
    regression_psi: Optional[float] = None
    regression_wasserstein: Optional[float] = None
    regression_mean_delta: Optional[float] = None
    regression_status: Optional[DriftStatus] = None
    quantile_shift_q05: Optional[float] = None
    quantile_shift_q50: Optional[float] = None
    quantile_shift_q95: Optional[float] = None
    status: DriftStatus


class TargetDriftResult(BaseModel):
    ref_prevalence: float
    det_prevalence: float
    delta_prevalence: float
    z_stat: float
    z_pvalue: float
    target_psi: float
    delay_days_wasserstein: Optional[float] = None
    delay_days_normalized_wasserstein: Optional[float] = None
    delay_days_psi: Optional[float] = None
    extreme_delay_ref_prop: Optional[float] = None
    extreme_delay_det_prop: Optional[float] = None
    delta_extreme_delay_prop: Optional[float] = None
    status: DriftStatus


class UncertaintyDriftResult(BaseModel):
    nominal_coverage: float
    empirical_coverage: float
    coverage_error: float
    binomial_pvalue: float
    nonconformity_wasserstein: float
    nonconformity_mean_delta: float
    nonconformity_ks_stat: float
    nonconformity_ks_pvalue: float
    ref_mean_interval_width: float
    det_mean_interval_width: float
    interval_width_wasserstein: float
    interval_width_median_delta: float
    interval_width_ratio: float
    status: DriftStatus


class WindowMetadata(BaseModel):
    reference_start: str
    reference_end: str
    detection_start: str
    detection_end: str
    ref_sample_count: int
    det_sample_count: int
    window_duration_days: int
    gap_days: int = 0


class TriggerEvaluationResult(BaseModel):
    overall_status: DriftStatus
    trigger_recalibration: bool
    trigger_reasons: List[str]
    veto_triggered: bool = False
    stale_calibration_triggered: bool = False
    cooldown_active: bool = False
    persistence_confirmed: bool = True
    insufficient_sample: bool = False


class DriftReport(BaseModel):
    window_metadata: WindowMetadata
    trigger_evaluation: TriggerEvaluationResult
    feature_drift: FeatureDriftSummary
    prediction_drift: PredictionDriftResult
    target_drift: Optional[TargetDriftResult] = None
    uncertainty_drift: Optional[UncertaintyDriftResult] = None

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()
