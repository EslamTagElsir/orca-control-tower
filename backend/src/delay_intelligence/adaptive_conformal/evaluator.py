"""
Adaptive Conformal Evaluation Engine.
Executes chronological multi-strategy evaluation across:
1. Development CV Folds 0–4 (2006-04-19 to 2014-08-24)
2. 365-Day Final Holdout (2014-08-24 to 2015-08-24, 1,013 rows) in single-pass forward order.

Outputs structured JSON and CSV artifacts to artifacts/adaptive_conformal/.
"""

import os
import json
import time
from typing import Dict, List, Optional, Tuple, Any, Union
import numpy as np
import pandas as pd
import yaml

from delay_intelligence.evaluation.splitter import RollingOriginSplitter
from delay_intelligence.serving.model_loader import ModelLoader
from delay_intelligence.adaptive_conformal.schemas import (
    RecalibrationStrategy,
    RecalibrationEvent,
    StrategyEvaluationMetrics,
    FoldAdaptiveReport,
    AdaptiveComparisonSummary,
)
from delay_intelligence.adaptive_conformal.adaptive_cqr import (
    AdaptiveCQRCalibrator,
    StaticCQREngine,
    RollingCQREngine,
    DriftTriggeredCQREngine,
    calculate_strategy_metrics,
)


class AdaptiveConformalEvaluator:
    """
    Orchestrates empirical evaluation and benchmark comparison across Static,
    Rolling, and Drift-Triggered Conformal Recalibration strategies.
    """

    def __init__(
        self,
        features_path: str = "artifacts/data/scms_modeling_features.parquet",
        config_path: str = "configs/adaptive_conformal.yaml",
        drift_config_path: str = "configs/drift.yaml",
        output_dir: str = "artifacts/adaptive_conformal",
    ):
        self.features_path = features_path
        self.config_path = config_path
        self.drift_config_path = drift_config_path
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

        self.config: Dict[str, Any] = {}
        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                self.config = yaml.safe_load(f) or {}

        self.model_loader = ModelLoader.get_instance()
        self.alpha = self.config.get("conformal", {}).get("alpha", 0.10)
        self.embargo_days = self.config.get("temporal_governance", {}).get("embargo_days", 90)
        self.calib_window_days = self.config.get("temporal_governance", {}).get("calibration_window_days", 180)
        self.min_samples = self.config.get("temporal_governance", {}).get("min_calibration_samples", 50)

    def prepare_dataset_predictions(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Appends model predictions and uncalibrated base quantile estimates.
        """
        df = df.copy()
        df["T_pred"] = pd.to_datetime(df["T_pred"])
        df = df.sort_values("T_pred").reset_index(drop=True)

        all_model_features = self.model_loader.feature_schema.get("all_features", [])
        num_cols = self.model_loader.feature_schema.get("num_cols", [])
        cat_cols = self.model_loader.feature_schema.get("cat_cols", [])

        X = df[all_model_features].copy()
        for c in num_cols:
            X[c] = pd.to_numeric(X[c], errors="coerce").fillna(0.0).astype(float)
        for c in cat_cols:
            X[c] = X[c].fillna("missing").astype(str).replace(
                {"nan": "missing", "<NA>": "missing", "None": "missing", "NaT": "missing"}
            )

        # 1. Model predicted probabilities
        prob = self.model_loader.model.predict_proba(X)[:, 1]
        df["prob_late"] = prob

        # 2. Base uncalibrated quantile estimates from frozen baseline contract
        # Base severity: prob * 15.0
        # q_low: 0.10 * base_sev - 1.5
        # q_high: 0.90 * base_sev + 2.5
        cqr_params = self.model_loader.cqr_params
        q_low_factor = cqr_params.get("q_low", 0.10)
        q_high_factor = cqr_params.get("q_high", 0.90)
        adj_low = cqr_params.get("adjustment_low", -1.5)
        adj_high = cqr_params.get("adjustment_high", 2.5)

        base_sev = prob * 15.0
        df["severity_p50"] = base_sev
        df["q_low"] = np.maximum(0.0, q_low_factor * base_sev + adj_low)
        df["q_high"] = np.maximum(df["q_low"], q_high_factor * base_sev + adj_high)

        return df

    def evaluate_horizon_stream(
        self,
        df_eval: pd.DataFrame,
        df_historical_pool: pd.DataFrame,
        initial_q: float,
        horizon_name: str = "eval",
        monitoring_step_days: int = 30,
        rolling_step_days: int = 90,
    ) -> Tuple[
        StrategyEvaluationMetrics,
        StrategyEvaluationMetrics,
        StrategyEvaluationMetrics,
        List[RecalibrationEvent],
    ]:
        """
        Executes chronological forward simulation comparing Static, Rolling, and Drift-Triggered CQR.
        Strictly enforces past -> future ordering and 90-day embargo.
        """
        df_eval = df_eval.sort_values("T_pred").reset_index(drop=True)
        eval_start = pd.to_datetime(df_eval["T_pred"].min())
        eval_end = pd.to_datetime(df_eval["T_pred"].max())
        duration_days = max(1, (eval_end - eval_start).days)

        # Initialize engines
        static_engine = StaticCQREngine(initial_q=initial_q, alpha=self.alpha)
        rolling_engine = RollingCQREngine(
            initial_q=initial_q,
            alpha=self.alpha,
            cadence_days=rolling_step_days,
            calib_window_days=self.calib_window_days,
            embargo_days=self.embargo_days,
            min_samples=self.min_samples,
        )
        drift_engine = DriftTriggeredCQREngine(
            initial_q=initial_q,
            alpha=self.alpha,
            config_path=self.drift_config_path,
            monitoring_interval_days=monitoring_step_days,
            calib_window_days=self.calib_window_days,
            embargo_days=self.embargo_days,
            min_samples=self.min_samples,
        )

        n_samples = len(df_eval)
        static_low = np.zeros(n_samples)
        static_high = np.zeros(n_samples)
        rolling_low = np.zeros(n_samples)
        rolling_high = np.zeros(n_samples)
        drift_low = np.zeros(n_samples)
        drift_high = np.zeros(n_samples)
        y_true = df_eval["Delay_Days"].values

        # Full historical pool available as time advances
        combined_pool = pd.concat([df_historical_pool, df_eval], ignore_index=True).sort_values("T_pred").reset_index(drop=True)

        # Chunk evaluation into chronological forward time steps (e.g. 15-day / 30-day monitoring intervals)
        step_days = monitoring_step_days
        current_step_start = eval_start
        all_events: List[RecalibrationEvent] = []

        while current_step_start <= eval_end:
            current_step_end = current_step_start + pd.Timedelta(days=step_days)
            step_mask = (df_eval["T_pred"] >= current_step_start) & (df_eval["T_pred"] < current_step_end)
            step_indices = df_eval[step_mask].index.values

            if len(step_indices) > 0:
                step_df = df_eval.loc[step_indices]
                current_time = pd.to_datetime(step_df["T_pred"].max())

                # 1. Rolling Engine Check & Recalibration
                r_event = rolling_engine.maybe_recalibrate(
                    current_date=current_time,
                    df_historical_pool=combined_pool,
                    t_pred_col="T_pred",
                )
                if r_event:
                    all_events.append(r_event)

                # 2. Drift Engine Check & Recalibration
                # Reference window: previous matured baseline block
                ref_cutoff = current_time - pd.Timedelta(days=self.embargo_days)
                ref_start = ref_cutoff - pd.Timedelta(days=self.calib_window_days)
                ref_mask = (combined_pool["T_pred"] >= ref_start) & (combined_pool["T_pred"] < ref_cutoff)
                df_ref = combined_pool[ref_mask]

                if len(df_ref) < self.min_samples:
                    df_ref = df_historical_pool.tail(300)

                ref_p = df_ref["prob_late"].values if "prob_late" in df_ref.columns else np.full(len(df_ref), 0.1)
                det_p = step_df["prob_late"].values

                d_event, _ = drift_engine.evaluate_and_maybe_recalibrate(
                    current_date=current_time,
                    df_detection_window=step_df,
                    df_reference_window=df_ref,
                    df_historical_pool=combined_pool,
                    ref_prob=ref_p,
                    det_prob=det_p,
                    t_pred_col="T_pred",
                )
                if d_event:
                    all_events.append(d_event)

                # 3. Apply Conformal Bounds to current step samples
                q_l = step_df["q_low"].values
                q_h = step_df["q_high"].values

                # Strategy A
                s_l, s_h = static_engine.calibrator.predict(q_l, q_h, q_adjustment=static_engine.current_q)
                static_low[step_indices] = s_l
                static_high[step_indices] = s_h

                # Strategy B
                r_l, r_h = rolling_engine.calibrator.predict(q_l, q_h, q_adjustment=rolling_engine.current_q)
                rolling_low[step_indices] = r_l
                rolling_high[step_indices] = r_h

                # Strategy C
                d_l, d_h = drift_engine.calibrator.predict(q_l, q_h, q_adjustment=drift_engine.current_q)
                drift_low[step_indices] = d_l
                drift_high[step_indices] = d_h

            current_step_start = current_step_end

        # Compute strategy metrics
        static_metrics = calculate_strategy_metrics(
            lower_bounds=static_low,
            upper_bounds=static_high,
            y_true=y_true,
            recalibration_events=static_engine.recalibration_events,
            strategy_name=RecalibrationStrategy.STATIC.value,
            duration_days=duration_days,
            nominal_coverage=1.0 - self.alpha,
        )

        rolling_metrics = calculate_strategy_metrics(
            lower_bounds=rolling_low,
            upper_bounds=rolling_high,
            y_true=y_true,
            recalibration_events=rolling_engine.recalibration_events,
            strategy_name=RecalibrationStrategy.ROLLING.value,
            duration_days=duration_days,
            nominal_coverage=1.0 - self.alpha,
        )

        drift_metrics = calculate_strategy_metrics(
            lower_bounds=drift_low,
            upper_bounds=drift_high,
            y_true=y_true,
            recalibration_events=drift_engine.recalibration_events,
            strategy_name=RecalibrationStrategy.DRIFT_TRIGGERED.value,
            duration_days=duration_days,
            nominal_coverage=1.0 - self.alpha,
        )

        return static_metrics, rolling_metrics, drift_metrics, all_events

    def run_cv_evaluation(self) -> Tuple[List[FoldAdaptiveReport], pd.DataFrame, Dict[str, Any]]:
        """
        Runs comprehensive comparative evaluation across all 5 chronological Development CV folds.
        Strictly excludes the Final Holdout.
        """
        print("Executing Development CV Adaptive Conformal Evaluation (Folds 0–4)...")
        raw_df = pd.read_parquet(self.features_path)
        df = self.prepare_dataset_predictions(raw_df)

        splitter = RollingOriginSplitter()
        folds, holdout_idx, _ = splitter.split(df)

        fold_reports: List[FoldAdaptiveReport] = []
        cv_metric_rows: List[Dict[str, Any]] = []

        all_static_metrics: List[StrategyEvaluationMetrics] = []
        all_rolling_metrics: List[StrategyEvaluationMetrics] = []
        all_drift_metrics: List[StrategyEvaluationMetrics] = []

        for fold in folds:
            fold_id = fold["fold_id"]
            train_idx = fold["train"]
            val_idx = fold["val"]

            df_train = df.loc[train_idx].copy()
            df_val = df.loc[val_idx].copy()

            # Baseline initial Q from training fold
            # Fit CQR on training fold
            init_calibrator = AdaptiveCQRCalibrator(alpha=self.alpha)
            init_calibrator.fit(df_train["q_low"].values, df_train["q_high"].values, df_train["Delay_Days"].values)
            initial_q = float(init_calibrator.q_adjustment_)

            static_m, rolling_m, drift_m, events = self.evaluate_horizon_stream(
                df_eval=df_val,
                df_historical_pool=df_train,
                initial_q=initial_q,
                horizon_name=f"CV_Fold_{fold_id}",
            )

            all_static_metrics.append(static_m)
            all_rolling_metrics.append(rolling_m)
            all_drift_metrics.append(drift_m)

            rep = FoldAdaptiveReport(
                fold_id=fold_id,
                fold_name=f"Fold_{fold_id}",
                eval_start=str(df_val["T_pred"].min().date()),
                eval_end=str(df_val["T_pred"].max().date()),
                sample_count=len(df_val),
                static_metrics=static_m,
                rolling_metrics=rolling_m,
                drift_triggered_metrics=drift_m,
                recalibration_events=events,
            )
            fold_reports.append(rep)

            for m in [static_m, rolling_m, drift_m]:
                cv_metric_rows.append({
                    "fold_id": fold_id,
                    "strategy": m.strategy,
                    "eval_start": rep.eval_start,
                    "eval_end": rep.eval_end,
                    "samples": m.sample_count,
                    "nominal_coverage": m.nominal_coverage,
                    "empirical_coverage": m.empirical_coverage,
                    "coverage_error": m.coverage_error,
                    "mean_interval_width": m.mean_interval_width,
                    "median_interval_width": m.median_interval_width,
                    "recalibration_count": m.recalibration_count,
                    "recalibration_freq_per_year": m.recalibration_frequency_per_year,
                    "mean_days_between_recalib": m.mean_days_between_recalibrations,
                    "total_latency_ms": m.total_recalibration_latency_ms,
                })

        cv_metrics_df = pd.DataFrame(cv_metric_rows)
        cv_metrics_df.to_csv(os.path.join(self.output_dir, "cv_adaptive_metrics.csv"), index=False)

        cv_summary_json = [r.model_dump() for r in fold_reports]
        with open(os.path.join(self.output_dir, "cv_adaptive_comparison.json"), "w", encoding="utf-8") as f:
            json.dump(cv_summary_json, f, indent=2)

        return fold_reports, cv_metrics_df, {"folds_evaluated": len(folds)}

    def run_holdout_evaluation(self) -> Tuple[FoldAdaptiveReport, Dict[str, Any]]:
        """
        Executes strict single-pass chronological forward evaluation on the 365-day Final Holdout.
        NO RETUNING.
        """
        print("Executing Single-Pass Final Holdout Adaptive Conformal Evaluation (2014-08-24 to 2015-08-24)...")
        raw_df = pd.read_parquet(self.features_path)
        df = self.prepare_dataset_predictions(raw_df)

        splitter = RollingOriginSplitter()
        folds, holdout_idx, _ = splitter.split(df)

        # Development historical pool: all records strictly prior to holdout start (7,306 rows)
        holdout_start_date = pd.to_datetime("2014-08-24")
        df_dev = df[df["T_pred"] < holdout_start_date].copy()
        df_holdout = df.loc[holdout_idx].copy()

        # Frozen initial Q from baseline development pool
        # Fit CQR on the development baseline
        init_calibrator = AdaptiveCQRCalibrator(alpha=self.alpha)
        init_calibrator.fit(df_dev["q_low"].values, df_dev["q_high"].values, df_dev["Delay_Days"].values)
        initial_q = float(init_calibrator.q_adjustment_)

        # Note: In Stage 12, the static baseline Q was 0.0 (uncalibrated bounds with cqr_params)
        # We also evaluate static with Q=0.0 to exactly replicate Stage 12 metrics for comparison
        static_m, rolling_m, drift_m, holdout_events = self.evaluate_horizon_stream(
            df_eval=df_holdout,
            df_historical_pool=df_dev,
            initial_q=0.0, # Exact Stage 12 static baseline reference
            horizon_name="Final_Holdout_365D",
        )

        holdout_report = FoldAdaptiveReport(
            fold_id="holdout",
            fold_name="Final_Holdout_365D",
            eval_start=str(df_holdout["T_pred"].min().date()),
            eval_end=str(df_holdout["T_pred"].max().date()),
            sample_count=len(df_holdout),
            static_metrics=static_m,
            rolling_metrics=rolling_m,
            drift_triggered_metrics=drift_m,
            recalibration_events=holdout_events,
        )

        # Save Holdout artifacts
        with open(os.path.join(self.output_dir, "holdout_adaptive_comparison.json"), "w", encoding="utf-8") as f:
            json.dump(holdout_report.model_dump(), f, indent=2)

        events_json = [e.model_dump() for e in holdout_events]
        with open(os.path.join(self.output_dir, "holdout_recalibration_events.json"), "w", encoding="utf-8") as f:
            json.dump(events_json, f, indent=2)

        # Generate Adaptive Efficiency Summary CSV
        summary_rows = [
            {
                "evaluation_split": "Final_Holdout_365D",
                "strategy": static_m.strategy,
                "samples": static_m.sample_count,
                "empirical_coverage": static_m.empirical_coverage,
                "coverage_error": static_m.coverage_error,
                "mean_interval_width": static_m.mean_interval_width,
                "median_interval_width": static_m.median_interval_width,
                "recalibration_events": static_m.recalibration_count,
                "recalibration_frequency_per_year": static_m.recalibration_frequency_per_year,
                "mean_days_between_recalibrations": static_m.mean_days_between_recalibrations,
                "total_overhead_latency_ms": static_m.total_recalibration_latency_ms,
                "mean_latency_per_event_ms": static_m.mean_latency_per_event_ms,
            },
            {
                "evaluation_split": "Final_Holdout_365D",
                "strategy": rolling_m.strategy,
                "samples": rolling_m.sample_count,
                "empirical_coverage": rolling_m.empirical_coverage,
                "coverage_error": rolling_m.coverage_error,
                "mean_interval_width": rolling_m.mean_interval_width,
                "median_interval_width": rolling_m.median_interval_width,
                "recalibration_events": rolling_m.recalibration_count,
                "recalibration_frequency_per_year": rolling_m.recalibration_frequency_per_year,
                "mean_days_between_recalibrations": rolling_m.mean_days_between_recalibrations,
                "total_overhead_latency_ms": rolling_m.total_recalibration_latency_ms,
                "mean_latency_per_event_ms": rolling_m.mean_latency_per_event_ms,
            },
            {
                "evaluation_split": "Final_Holdout_365D",
                "strategy": drift_m.strategy,
                "samples": drift_m.sample_count,
                "empirical_coverage": drift_m.empirical_coverage,
                "coverage_error": drift_m.coverage_error,
                "mean_interval_width": drift_m.mean_interval_width,
                "median_interval_width": drift_m.median_interval_width,
                "recalibration_events": drift_m.recalibration_count,
                "recalibration_frequency_per_year": drift_m.recalibration_frequency_per_year,
                "mean_days_between_recalibrations": drift_m.mean_days_between_recalibrations,
                "total_overhead_latency_ms": drift_m.total_recalibration_latency_ms,
                "mean_latency_per_event_ms": drift_m.mean_latency_per_event_ms,
            },
        ]
        summary_df = pd.DataFrame(summary_rows)
        summary_df.to_csv(os.path.join(self.output_dir, "adaptive_efficiency_summary.csv"), index=False)

        return holdout_report, {"holdout_samples": len(df_holdout), "summary_df": summary_df}

    def run_all(self) -> Dict[str, Any]:
        """Runs both Development CV and Final Holdout evaluations."""
        cv_reports, cv_df, _ = self.run_cv_evaluation()
        holdout_report, holdout_info = self.run_holdout_evaluation()
        return {
            "cv_reports": cv_reports,
            "cv_df": cv_df,
            "holdout_report": holdout_report,
            "holdout_info": holdout_info,
        }


if __name__ == "__main__":
    evaluator = AdaptiveConformalEvaluator()
    evaluator.run_all()
