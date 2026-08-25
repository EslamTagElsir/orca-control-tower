"""
Adaptive Conformal Recalibration Engine (E7).
Implements the core mathematical algorithms and execution engines for:
- Conformalized Quantile Regression (CQR) calibration with finite-sample correction.
- Strategy A: Static CQR (Frozen Baseline Control).
- Strategy B: Rolling CQR (Periodic / Scheduled Sliding Window Recalibration).
- Strategy C: Drift-Triggered CQR (Dynamic Adaptive Recalibration via DriftTriggerPolicy).
- First-class Adaptive Efficiency and Performance Metrics calculation.
"""

import time
import os
import yaml
from typing import Dict, List, Optional, Tuple, Any, Union
import numpy as np
import pandas as pd

from delay_intelligence.adaptive_conformal.schemas import (
    RecalibrationStrategy,
    RecalibrationEvent,
    PredictionInterval,
    StrategyEvaluationMetrics,
)
from delay_intelligence.drift.detector import ChronologicalDriftDetector
from delay_intelligence.drift.policy import DriftTriggerPolicy
from delay_intelligence.drift.schemas import DriftStatus, DriftReport


class AdaptiveCQRCalibrator:
    """
    Mathematical core for Conformalized Quantile Regression (CQR).
    Computes exact finite-sample nonconformity adjustment factor Q.
    """

    def __init__(self, alpha: float = 0.10, quantile_method: str = "higher"):
        """
        Args:
            alpha: Miscoverage rate (e.g., 0.10 for 90% nominal coverage).
            quantile_method: Quantile interpolation method ('higher' for conservative coverage guarantee).
        """
        self.alpha = alpha
        self.quantile_method = quantile_method
        self.q_adjustment_: Optional[float] = None
        self.last_scores_: Optional[np.ndarray] = None

    def calculate_scores(
        self,
        q_low: np.ndarray,
        q_high: np.ndarray,
        y: np.ndarray,
    ) -> np.ndarray:
        """
        Computes signed nonconformity scores:
        S_i = max(q_low(X_i) - Y_i, Y_i - q_high(X_i))
        """
        q_low_arr = np.asarray(q_low, dtype=float)
        q_high_arr = np.asarray(q_high, dtype=float)
        y_arr = np.asarray(y, dtype=float)
        
        scores = np.maximum(q_low_arr - y_arr, y_arr - q_high_arr)
        return scores

    def fit(
        self,
        q_low_calib: np.ndarray,
        q_high_calib: np.ndarray,
        y_calib: np.ndarray,
    ) -> "AdaptiveCQRCalibrator":
        """
        Fits empirical adjustment factor Q from calibration data with finite-sample correction.
        """
        scores = self.calculate_scores(q_low_calib, q_high_calib, y_calib)
        self.last_scores_ = scores
        n = len(scores)
        
        if n == 0:
            raise ValueError("Cannot calibrate CQR on empty calibration set.")
            
        # Finite sample adjusted quantile level
        q_level = min(1.0, (1.0 - self.alpha) * (1.0 + 1.0 / n))
        self.q_adjustment_ = float(np.quantile(scores, q_level, method=self.quantile_method))
        return self

    def predict(
        self,
        q_low_test: np.ndarray,
        q_high_test: np.ndarray,
        q_adjustment: Optional[float] = None,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Applies conformal quantile adjustment to prediction bounds.
        """
        adj = q_adjustment if q_adjustment is not None else self.q_adjustment_
        if adj is None:
            raise ValueError("Calibrator is not fitted and no q_adjustment provided.")
            
        q_low_arr = np.asarray(q_low_test, dtype=float)
        q_high_arr = np.asarray(q_high_test, dtype=float)
        
        return q_low_arr - adj, q_high_arr + adj


class BaseRecalibrationEngine:
    """Abstract base class for Conformal Recalibration Engines."""
    
    def __init__(self, strategy: RecalibrationStrategy, alpha: float = 0.10):
        self.strategy = strategy
        self.alpha = alpha
        self.calibrator = AdaptiveCQRCalibrator(alpha=alpha)
        self.current_q: float = 0.0
        self.recalibration_events: List[RecalibrationEvent] = []
        self.event_counter: int = 0
        self.total_latency_ms: float = 0.0


class StaticCQREngine(BaseRecalibrationEngine):
    """
    Strategy A: Static CQR (Frozen Baseline Control).
    Fixed Q from initial development calibration; never recalibrates.
    """

    def __init__(self, initial_q: float, alpha: float = 0.10):
        super().__init__(strategy=RecalibrationStrategy.STATIC, alpha=alpha)
        self.current_q = float(initial_q)
        self.calibrator.q_adjustment_ = self.current_q

    def get_q(self, timestamp: Any) -> float:
        return self.current_q


class RollingCQREngine(BaseRecalibrationEngine):
    """
    Strategy B: Rolling CQR (Periodic / Scheduled Sliding Window Recalibration).
    Re-estimates Q periodically every fixed cadence (e.g., 90 days) using matured calibration window.
    """

    def __init__(
        self,
        initial_q: float,
        alpha: float = 0.10,
        cadence_days: int = 90,
        calib_window_days: int = 180,
        embargo_days: int = 90,
        min_samples: int = 50,
    ):
        super().__init__(strategy=RecalibrationStrategy.ROLLING, alpha=alpha)
        self.current_q = float(initial_q)
        self.calibrator.q_adjustment_ = self.current_q
        self.cadence_days = cadence_days
        self.calib_window_days = calib_window_days
        self.embargo_days = embargo_days
        self.min_samples = min_samples
        self.last_recalibration_date: Optional[pd.Timestamp] = None

    def maybe_recalibrate(
        self,
        current_date: pd.Timestamp,
        df_historical_pool: pd.DataFrame,
        t_pred_col: str = "T_pred",
    ) -> Optional[RecalibrationEvent]:
        """
        Checks if scheduled cadence has elapsed and recalibrates if due.
        """
        if self.last_recalibration_date is None:
            self.last_recalibration_date = current_date
            return None

        days_since = (current_date - self.last_recalibration_date).days
        if days_since < self.cadence_days:
            return None

        # Admissible matured calibration interval: [current_date - calib_window - embargo, current_date - embargo]
        embargo_cutoff = current_date - pd.Timedelta(days=self.embargo_days)
        window_start = embargo_cutoff - pd.Timedelta(days=self.calib_window_days)

        calib_mask = (df_historical_pool[t_pred_col] >= window_start) & (df_historical_pool[t_pred_col] < embargo_cutoff)
        df_calib = df_historical_pool[calib_mask]

        if len(df_calib) < self.min_samples:
            # Expand window backwards if sparse
            window_start = embargo_cutoff - pd.Timedelta(days=self.calib_window_days * 2)
            calib_mask = (df_historical_pool[t_pred_col] >= window_start) & (df_historical_pool[t_pred_col] < embargo_cutoff)
            df_calib = df_historical_pool[calib_mask]

        if len(df_calib) < self.min_samples:
            return None

        t0 = time.perf_counter()
        q_low_c = df_calib["q_low"].values
        q_high_c = df_calib["q_high"].values
        y_c = df_calib["Delay_Days"].values

        old_q = self.current_q
        self.calibrator.fit(q_low_c, q_high_c, y_c)
        new_q = float(self.calibrator.q_adjustment_)
        latency_ms = (time.perf_counter() - t0) * 1000.0

        self.current_q = new_q
        self.last_recalibration_date = current_date
        self.event_counter += 1
        self.total_latency_ms += latency_ms

        event = RecalibrationEvent(
            event_id=self.event_counter,
            timestamp=str(current_date.date()),
            strategy=RecalibrationStrategy.ROLLING,
            trigger_reason=[f"Scheduled periodic recalibration ({days_since}d >= {self.cadence_days}d cadence)."],
            calib_window_start=str(window_start.date()),
            calib_window_end=str(embargo_cutoff.date()),
            calib_sample_count=len(df_calib),
            old_q=old_q,
            new_q=new_q,
            delta_q=new_q - old_q,
            latency_ms=latency_ms,
        )
        self.recalibration_events.append(event)
        return event


class DriftTriggeredCQREngine(BaseRecalibrationEngine):
    """
    Strategy C: Drift-Triggered CQR (Dynamic Adaptive Recalibration).
    Monitors chronological drift multi-dimensionally and recalibrates ONLY upon RED triggers,
    Tier 1 SHAP feature vetoes, coverage deficits, or stale timeouts, honoring cooldown.
    """

    def __init__(
        self,
        initial_q: float,
        alpha: float = 0.10,
        config_path: str = "configs/drift.yaml",
        monitoring_interval_days: int = 30,
        calib_window_days: int = 180,
        embargo_days: int = 90,
        min_samples: int = 50,
        t_max_stale_days: int = 180,
        v_max_stale_shipments: int = 1500,
        t_cooldown_days: int = 30,
        n_cooldown_shipments: int = 50,
    ):
        super().__init__(strategy=RecalibrationStrategy.DRIFT_TRIGGERED, alpha=alpha)
        self.current_q = float(initial_q)
        self.calibrator.q_adjustment_ = self.current_q
        self.monitoring_interval_days = monitoring_interval_days
        self.calib_window_days = calib_window_days
        self.embargo_days = embargo_days
        self.min_samples = min_samples
        self.t_max_stale_days = t_max_stale_days
        self.v_max_stale_shipments = v_max_stale_shipments
        self.t_cooldown_days = t_cooldown_days
        self.n_cooldown_shipments = n_cooldown_shipments

        # Detector and Policy
        self.detector = ChronologicalDriftDetector(config_path=config_path)
        self.policy: DriftTriggerPolicy = self.detector.policy

        # State tracking
        self.last_monitoring_date: Optional[pd.Timestamp] = None
        self.last_recalibration_date: Optional[pd.Timestamp] = None
        self.shipments_since_last_recalib: int = 0
        self.consecutive_yellow_count: int = 0
        self.consecutive_red_count: int = 0

    def evaluate_and_maybe_recalibrate(
        self,
        current_date: pd.Timestamp,
        df_detection_window: pd.DataFrame,
        df_reference_window: pd.DataFrame,
        df_historical_pool: pd.DataFrame,
        ref_prob: np.ndarray,
        det_prob: np.ndarray,
        t_pred_col: str = "T_pred",
    ) -> Tuple[Optional[RecalibrationEvent], Optional[DriftReport]]:
        """
        Executes drift evaluation and conditional dynamic recalibration.
        """
        if self.last_recalibration_date is None:
            self.last_recalibration_date = current_date

        days_since_recalib = (current_date - self.last_recalibration_date).days
        self.shipments_since_last_recalib += len(df_detection_window)

        # 1. Evaluate multi-dimensional drift
        q_low_c = df_reference_window["q_low"].values if "q_low" in df_reference_window.columns else np.zeros(len(df_reference_window))
        q_high_c = df_reference_window["q_high"].values if "q_high" in df_reference_window.columns else np.zeros(len(df_reference_window))
        y_c = df_reference_window["Delay_Days"].values if "Delay_Days" in df_reference_window.columns else np.zeros(len(df_reference_window))

        q_low_d = df_detection_window["q_low"].values if "q_low" in df_detection_window.columns else np.zeros(len(df_detection_window))
        q_high_d = df_detection_window["q_high"].values if "q_high" in df_detection_window.columns else np.zeros(len(df_detection_window))
        y_d = df_detection_window["Delay_Days"].values if "Delay_Days" in df_detection_window.columns else np.zeros(len(df_detection_window))

        report = self.detector.evaluate_window(
            df_ref=df_reference_window,
            df_det=df_detection_window,
            ref_prob=ref_prob,
            det_prob=det_prob,
            q_low_calib=q_low_c,
            q_high_calib=q_high_c,
            y_calib=y_c,
            q_low_det=q_low_d,
            q_high_det=q_high_d,
            y_det=y_d,
            days_since_calibration=days_since_recalib,
            shipments_since_calibration=self.shipments_since_last_recalib,
            days_since_last_recalibration=days_since_recalib,
            shipments_since_last_recalibration=self.shipments_since_last_recalib,
            consecutive_yellow_count=self.consecutive_yellow_count,
            consecutive_red_count=self.consecutive_red_count,
        )

        # Update persistence state
        trigger_res = report.trigger_evaluation
        if trigger_res.overall_status == DriftStatus.RED:
            self.consecutive_red_count += 1
            self.consecutive_yellow_count = 0
        elif trigger_res.overall_status == DriftStatus.YELLOW:
            self.consecutive_yellow_count += 1
            self.consecutive_red_count = 0
        else:
            self.consecutive_yellow_count = 0
            self.consecutive_red_count = 0

        # Check if recalibration should execute
        if not trigger_res.trigger_recalibration:
            return None, report

        # Extract strictly matured calibration window: [current_date - calib_window - embargo, current_date - embargo]
        embargo_cutoff = current_date - pd.Timedelta(days=self.embargo_days)
        window_start = embargo_cutoff - pd.Timedelta(days=self.calib_window_days)

        calib_mask = (df_historical_pool[t_pred_col] >= window_start) & (df_historical_pool[t_pred_col] < embargo_cutoff)
        df_calib = df_historical_pool[calib_mask]

        if len(df_calib) < self.min_samples:
            # Fallback to expanding matured pool if window sparse
            window_start = embargo_cutoff - pd.Timedelta(days=self.calib_window_days * 2)
            calib_mask = (df_historical_pool[t_pred_col] >= window_start) & (df_historical_pool[t_pred_col] < embargo_cutoff)
            df_calib = df_historical_pool[calib_mask]

        if len(df_calib) < self.min_samples:
            return None, report

        t0 = time.perf_counter()
        q_low_pool = df_calib["q_low"].values
        q_high_pool = df_calib["q_high"].values
        y_pool = df_calib["Delay_Days"].values

        old_q = self.current_q
        self.calibrator.fit(q_low_pool, q_high_pool, y_pool)
        new_q = float(self.calibrator.q_adjustment_)
        latency_ms = (time.perf_counter() - t0) * 1000.0

        self.current_q = new_q
        self.last_recalibration_date = current_date
        self.shipments_since_last_recalib = 0
        self.consecutive_red_count = 0
        self.event_counter += 1
        self.total_latency_ms += latency_ms

        event = RecalibrationEvent(
            event_id=self.event_counter,
            timestamp=str(current_date.date()),
            strategy=RecalibrationStrategy.DRIFT_TRIGGERED,
            trigger_reason=trigger_res.trigger_reasons,
            calib_window_start=str(window_start.date()),
            calib_window_end=str(embargo_cutoff.date()),
            calib_sample_count=len(df_calib),
            old_q=old_q,
            new_q=new_q,
            delta_q=new_q - old_q,
            latency_ms=latency_ms,
        )
        self.recalibration_events.append(event)
        return event, report


def calculate_strategy_metrics(
    lower_bounds: np.ndarray,
    upper_bounds: np.ndarray,
    y_true: np.ndarray,
    recalibration_events: List[RecalibrationEvent],
    strategy_name: str,
    duration_days: int,
    nominal_coverage: float = 0.90,
) -> StrategyEvaluationMetrics:
    """
    Computes all standard statistical coverage and first-class adaptive efficiency metrics.
    """
    lower = np.asarray(lower_bounds, dtype=float)
    upper = np.asarray(upper_bounds, dtype=float)
    y = np.asarray(y_true, dtype=float)
    n = len(y)

    covered = (y >= lower) & (y <= upper)
    empirical_cov = float(np.mean(covered)) if n > 0 else 0.0
    cov_error = float(nominal_coverage - empirical_cov)

    widths = upper - lower
    mean_w = float(np.mean(widths)) if n > 0 else 0.0
    median_w = float(np.median(widths)) if n > 0 else 0.0
    std_w = float(np.std(widths)) if n > 0 else 0.0

    lower_viols = float(np.mean(y < lower)) if n > 0 else 0.0
    upper_viols = float(np.mean(y > upper)) if n > 0 else 0.0

    # Efficiency Metrics
    recalib_count = len(recalibration_events)
    recalib_freq_yr = float(recalib_count * (365.0 / max(1, duration_days)))
    mean_mtbr = float(duration_days / max(1, recalib_count)) if recalib_count > 0 else float(duration_days)
    total_lat = sum(e.latency_ms for e in recalibration_events)
    mean_lat = float(total_lat / max(1, recalib_count)) if recalib_count > 0 else 0.0

    return StrategyEvaluationMetrics(
        strategy=strategy_name,
        sample_count=n,
        nominal_coverage=nominal_coverage,
        empirical_coverage=empirical_cov,
        coverage_error=cov_error,
        mean_interval_width=mean_w,
        median_interval_width=median_w,
        interval_width_std=std_w,
        lower_violation_rate=lower_viols,
        upper_violation_rate=upper_viols,
        recalibration_count=recalib_count,
        recalibration_frequency_per_year=recalib_freq_yr,
        mean_days_between_recalibrations=mean_mtbr,
        total_recalibration_latency_ms=total_lat,
        mean_latency_per_event_ms=mean_lat,
        status="PASS",
    )
