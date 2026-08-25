"""
Drift Evaluation Runner.
Executes chronological drift detection across historical development CV folds
(2006-04-19 to 2014-08-24) and writes development drift evaluation artifacts
to artifacts/drift/.

Ensures strict quarantine of the 365-day Final Holdout (2014-08-24 to 2015-08-24).
"""

import os
import json
from typing import Dict, List, Optional, Any
import numpy as np
import pandas as pd

from delay_intelligence.evaluation.splitter import RollingOriginSplitter
from delay_intelligence.serving.model_loader import ModelLoader
from delay_intelligence.drift.detector import ChronologicalDriftDetector
from delay_intelligence.drift.policy import DriftTriggerPolicy
from delay_intelligence.drift.schemas import DriftReport


class DriftRunner:
    """
    Orchestrates historical development drift evaluation and outputs standardized artifacts.
    """

    def __init__(
        self,
        features_path: str = "artifacts/data/scms_modeling_features.parquet",
        config_path: str = "configs/drift.yaml",
        output_dir: str = "artifacts/drift",
    ):
        self.features_path = features_path
        self.config_path = config_path
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)
        
        self.detector = ChronologicalDriftDetector(config_path=config_path)
        self.model_loader = ModelLoader.get_instance()

    def run_cv_drift_evaluation(self) -> Dict[str, Any]:
        """
        Runs drift detection across all 5 chronological Development CV folds.
        Strictly excludes the final 365-day holdout from threshold calibration.
        """
        print(f"Loading modeling dataset from {self.features_path}...")
        df = pd.read_parquet(self.features_path)
        df['T_pred'] = pd.to_datetime(df['T_pred'])
        
        splitter = RollingOriginSplitter()
        folds, holdout_idx, manifest_df = splitter.split(df)
        
        print(f"Loaded {len(folds)} Development CV folds.")
        
        all_reports: List[Dict[str, Any]] = []
        feature_rows: List[Dict[str, Any]] = []
        metrics_rows: List[Dict[str, Any]] = []
        triggers_list: List[Dict[str, Any]] = []

        all_model_features = self.model_loader.feature_schema.get("all_features", [])

        last_recalib_fold = None
        consecutive_yellow = 0
        consecutive_red = 0

        for fold in folds:
            fold_id = fold['fold_id']
            train_idx = fold['train']
            val_idx = fold['val']
            
            df_train = df.loc[train_idx].copy()
            df_val = df.loc[val_idx].copy()
            
            # Ensure features are present and properly formatted for model
            num_cols = self.model_loader.feature_schema.get("num_cols", [])
            cat_cols = self.model_loader.feature_schema.get("cat_cols", [])
            
            X_train = df_train[all_model_features].copy()
            X_val = df_val[all_model_features].copy()
            
            for c in num_cols:
                X_train[c] = pd.to_numeric(X_train[c], errors='coerce').fillna(0.0).astype(float)
                X_val[c] = pd.to_numeric(X_val[c], errors='coerce').fillna(0.0).astype(float)
            for c in cat_cols:
                X_train[c] = X_train[c].fillna('missing').astype(str).replace({'nan': 'missing', '<NA>': 'missing', 'None': 'missing', 'NaT': 'missing'})
                X_val[c] = X_val[c].fillna('missing').astype(str).replace({'nan': 'missing', '<NA>': 'missing', 'None': 'missing', 'NaT': 'missing'})
            
            # 1. Predictions from CatBoost Champion
            train_prob = self.model_loader.model.predict_proba(X_train)[:, 1]
            val_prob = self.model_loader.model.predict_proba(X_val)[:, 1]
            
            # 2. CQR Quantile Simulation & Nonconformity
            # Baseline uses q_low = 0.1, q_high = 0.9 with cqr_params
            cqr_params = self.model_loader.cqr_params
            adj_low = cqr_params.get("adjustment_low", -1.5)
            adj_high = cqr_params.get("adjustment_high", 2.5)
            
            # Simulated quantile bounds from point predictions + residuals
            train_days = df_train['Delay_Days'].values
            val_days = df_val['Delay_Days'].values
            
            # Synthetic quantile bounds based on empirical training distribution
            q_low_train = np.full_like(train_days, fill_value=np.percentile(train_days, 10))
            q_high_train = np.full_like(train_days, fill_value=np.percentile(train_days, 90))
            
            q_low_val = np.full_like(val_days, fill_value=np.percentile(train_days, 10))
            q_high_val = np.full_like(val_days, fill_value=np.percentile(train_days, 90))

            # Temporal tracking for policy
            train_end_date = pd.to_datetime(df_train['T_pred'].max())
            val_start_date = pd.to_datetime(df_val['T_pred'].min())
            days_elapsed = (val_start_date - train_end_date).days
            
            # Run Detector
            report: DriftReport = self.detector.evaluate_window(
                df_ref=df_train,
                df_det=df_val,
                ref_prob=train_prob,
                det_prob=val_prob,
                q_low_calib=q_low_train,
                q_high_calib=q_high_train,
                y_calib=train_days,
                q_low_det=q_low_val,
                q_high_det=q_high_val,
                y_det=val_days,
                days_since_calibration=days_elapsed,
                shipments_since_calibration=len(df_val),
                consecutive_yellow_count=consecutive_yellow,
                consecutive_red_count=consecutive_red,
            )
            
            rep_dict = report.to_dict()
            rep_dict['fold_id'] = fold_id
            all_reports.append(rep_dict)
            
            # Update state counters
            if report.trigger_evaluation.overall_status.value == "RED":
                consecutive_red += 1
                consecutive_yellow = 0
            elif report.trigger_evaluation.overall_status.value == "YELLOW":
                consecutive_yellow += 1
                consecutive_red = 0
            else:
                consecutive_yellow = 0
                consecutive_red = 0

            # Record Feature Rows
            for feat_name, feat_res in report.feature_drift.feature_metrics.items():
                feature_rows.append({
                    "fold_id": fold_id,
                    "feature_name": feat_name,
                    "feature_type": feat_res.feature_type,
                    "tier": feat_res.tier.value,
                    "psi": feat_res.psi,
                    "normalized_wasserstein": feat_res.normalized_wasserstein,
                    "ks_pvalue": feat_res.ks_pvalue,
                    "ks_fdr_rejected": feat_res.ks_fdr_rejected,
                    "js_distance": feat_res.js_distance,
                    "chi2_pvalue": feat_res.chi2_pvalue,
                    "status": feat_res.status.value,
                })

            # Record Dimension Metrics Row
            metrics_rows.append({
                "fold_id": fold_id,
                "ref_start": report.window_metadata.reference_start,
                "ref_end": report.window_metadata.reference_end,
                "det_start": report.window_metadata.detection_start,
                "det_end": report.window_metadata.detection_end,
                "ref_count": report.window_metadata.ref_sample_count,
                "det_count": report.window_metadata.det_sample_count,
                "feature_drift_status": report.feature_drift.status.value,
                "feature_weighted_score": report.feature_drift.weighted_feature_score,
                "feature_max_psi": report.feature_drift.max_psi,
                "feature_max_psi_name": report.feature_drift.max_psi_feature,
                "prediction_status": report.prediction_drift.status.value,
                "prob_psi": report.prediction_drift.prob_psi,
                "prob_wasserstein": report.prediction_drift.prob_wasserstein,
                "prob_mean_delta": report.prediction_drift.prob_mean_delta,
                "target_status": report.target_drift.status.value if report.target_drift else "N/A",
                "delta_prevalence": report.target_drift.delta_prevalence if report.target_drift else 0.0,
                "z_pvalue": report.target_drift.z_pvalue if report.target_drift else 1.0,
                "uncertainty_status": report.uncertainty_drift.status.value if report.uncertainty_drift else "N/A",
                "empirical_coverage": report.uncertainty_drift.empirical_coverage if report.uncertainty_drift else 0.0,
                "coverage_error": report.uncertainty_drift.coverage_error if report.uncertainty_drift else 0.0,
                "binomial_pvalue": report.uncertainty_drift.binomial_pvalue if report.uncertainty_drift else 1.0,
                "nonconformity_wasserstein": report.uncertainty_drift.nonconformity_wasserstein if report.uncertainty_drift else 0.0,
                "overall_status": report.trigger_evaluation.overall_status.value,
                "trigger_recalibration": report.trigger_evaluation.trigger_recalibration,
            })

            # Record Trigger Decision
            triggers_list.append({
                "fold_id": fold_id,
                "detection_window": f"{report.window_metadata.detection_start} to {report.window_metadata.detection_end}",
                "overall_status": report.trigger_evaluation.overall_status.value,
                "trigger_recalibration": report.trigger_evaluation.trigger_recalibration,
                "reasons": report.trigger_evaluation.trigger_reasons,
                "veto_triggered": report.trigger_evaluation.veto_triggered,
                "stale_calibration_triggered": report.trigger_evaluation.stale_calibration_triggered,
            })

        # Save artifacts to artifacts/drift/
        metrics_df = pd.DataFrame(metrics_rows)
        metrics_df.to_csv(os.path.join(self.output_dir, "drift_metrics.csv"), index=False)
        
        feature_df = pd.DataFrame(feature_rows)
        feature_df.to_csv(os.path.join(self.output_dir, "feature_drift_summary.csv"), index=False)
        
        with open(os.path.join(self.output_dir, "drift_triggers.json"), "w", encoding="utf-8") as f:
            json.dump(triggers_list, f, indent=2)
            
        with open(os.path.join(self.output_dir, "cv_drift_summary.json"), "w", encoding="utf-8") as f:
            json.dump(all_reports, f, indent=2)

        print(f"Successfully generated drift artifacts in {self.output_dir}:")
        print(f" - {os.path.join(self.output_dir, 'drift_metrics.csv')}")
        print(f" - {os.path.join(self.output_dir, 'feature_drift_summary.csv')}")
        print(f" - {os.path.join(self.output_dir, 'drift_triggers.json')}")
        print(f" - {os.path.join(self.output_dir, 'cv_drift_summary.json')}")

        return {
            "folds_evaluated": len(folds),
            "total_triggers": sum(1 for t in triggers_list if t["trigger_recalibration"]),
            "metrics_df": metrics_df,
            "feature_df": feature_df,
            "triggers_list": triggers_list,
        }


if __name__ == "__main__":
    runner = DriftRunner()
    runner.run_cv_drift_evaluation()
