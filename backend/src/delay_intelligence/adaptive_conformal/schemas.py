"""
Pydantic Data Models and Schemas for Adaptive Conformal Recalibration (E7).
Defines schemas for:
- Recalibration Strategies (Static, Rolling, Drift-Triggered)
- Recalibration Events & Audit Log Entries
- Prediction Intervals
- Strategy Evaluation Metrics (Coverage, Interval Width, Efficiency)
- Fold-level and Holdout Comparison Reports
"""

from enum import Enum
from typing import Dict, List, Optional, Any, Union
from pydantic import BaseModel, Field


class RecalibrationStrategy(str, Enum):
    STATIC = "STATIC"
    ROLLING = "ROLLING"
    DRIFT_TRIGGERED = "DRIFT_TRIGGERED"


class RecalibrationEvent(BaseModel):
    """Structured record of an individual recalibration event."""
    event_id: int
    timestamp: str
    strategy: RecalibrationStrategy
    trigger_reason: List[str]
    calib_window_start: str
    calib_window_end: str
    calib_sample_count: int
    old_q: float
    new_q: float
    delta_q: float
    latency_ms: float


class PredictionInterval(BaseModel):
    """Individual shipment conformal prediction interval output."""
    lower_bound: float
    upper_bound: float
    interval_width: float
    point_prediction: float
    q_adjustment_used: float
    covered: Optional[bool] = None


class StrategyEvaluationMetrics(BaseModel):
    """Comprehensive performance and efficiency metrics for a recalibration strategy."""
    strategy: str
    sample_count: int
    nominal_coverage: float = 0.90
    empirical_coverage: float
    coverage_error: float
    mean_interval_width: float
    median_interval_width: float
    interval_width_std: float
    lower_violation_rate: float
    upper_violation_rate: float
    recalibration_count: int
    recalibration_frequency_per_year: float
    mean_days_between_recalibrations: float
    total_recalibration_latency_ms: float
    mean_latency_per_event_ms: float
    status: str = "PASS"


class FoldAdaptiveReport(BaseModel):
    """Evaluation report for a single CV fold or evaluation horizon."""
    fold_id: Union[int, str]
    fold_name: str
    eval_start: str
    eval_end: str
    sample_count: int
    static_metrics: StrategyEvaluationMetrics
    rolling_metrics: StrategyEvaluationMetrics
    drift_triggered_metrics: StrategyEvaluationMetrics
    recalibration_events: List[RecalibrationEvent] = Field(default_factory=list)


class AdaptiveComparisonSummary(BaseModel):
    """End-to-end multi-fold or holdout comparative evaluation summary."""
    environment: str
    total_eval_samples: int
    evaluation_duration_days: int
    fold_reports: List[FoldAdaptiveReport]
    overall_static: StrategyEvaluationMetrics
    overall_rolling: StrategyEvaluationMetrics
    overall_drift_triggered: StrategyEvaluationMetrics
    total_recalibration_events: int
    timestamp: str
