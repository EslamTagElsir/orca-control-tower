"""
Adaptive Conformal Recalibration Package (E7).
Provides:
- Conformalized Quantile Regression (CQR) calibration with finite-sample correction.
- Strategy A: Static CQR (Frozen Baseline Control).
- Strategy B: Rolling CQR (Periodic / Scheduled Sliding Window Recalibration).
- Strategy C: Drift-Triggered CQR (Dynamic Adaptive Recalibration via DriftTriggerPolicy).
- Chronological evaluation harnesses and efficiency metric calculations.
"""

from delay_intelligence.adaptive_conformal.schemas import (
    RecalibrationStrategy,
    RecalibrationEvent,
    PredictionInterval,
    StrategyEvaluationMetrics,
    FoldAdaptiveReport,
    AdaptiveComparisonSummary,
)
from delay_intelligence.adaptive_conformal.adaptive_cqr import (
    AdaptiveCQRCalibrator,
    BaseRecalibrationEngine,
    StaticCQREngine,
    RollingCQREngine,
    DriftTriggeredCQREngine,
    calculate_strategy_metrics,
)
from delay_intelligence.adaptive_conformal.evaluator import (
    AdaptiveConformalEvaluator,
)

__all__ = [
    "RecalibrationStrategy",
    "RecalibrationEvent",
    "PredictionInterval",
    "StrategyEvaluationMetrics",
    "FoldAdaptiveReport",
    "AdaptiveComparisonSummary",
    "AdaptiveCQRCalibrator",
    "BaseRecalibrationEngine",
    "StaticCQREngine",
    "RollingCQREngine",
    "DriftTriggeredCQREngine",
    "calculate_strategy_metrics",
    "AdaptiveConformalEvaluator",
]
