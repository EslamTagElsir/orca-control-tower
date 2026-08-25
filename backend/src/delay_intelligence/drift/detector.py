"""
Chronological Drift Detector.
Orchestrates multi-dimensional drift detection across 4 dimensions:
1. Feature Drift (P(X)) - Continuous and Categorical features with FDR correction.
2. Prediction Drift (P(Y_hat | X)) - Classifier probabilities, regressor point predictions, quantiles.
3. Target / Prevalence Drift (P(Y)) - Delay rate shift, continuous delay days shift, extreme delay shift.
4. Uncertainty Drift (P(S), P(W)) - CQR nonconformity score shift, empirical coverage error, binomial test, interval widths.
"""

from typing import Dict, List, Optional, Tuple, Any, Union
import os
import yaml
import numpy as np
import pandas as pd

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
from delay_intelligence.drift.policy import DriftTriggerPolicy


class ChronologicalDriftDetector:
    """
    Core engine for chronological drift detection in supply chain delay intelligence.
    """

    def __init__(
        self,
        config_path: Optional[str] = "configs/drift.yaml",
        policy: Optional[DriftTriggerPolicy] = None,
        num_cols: Optional[List[str]] = None,
        cat_cols: Optional[List[str]] = None,
    ):
        self.config: Dict[str, Any] = {}
        if config_path and os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                self.config = yaml.safe_load(f) or {}

        # Feature groupings from config, schema, or defaults
        self.num_cols: List[str] = num_cols or self.config.get("features", {}).get("numerical", [])
        self.cat_cols: List[str] = cat_cols or self.config.get("features", {}).get("categorical", [])
        
        # Load from feature_schema.json if not provided
        if not self.num_cols or not self.cat_cols:
            schema_path = "artifacts/model_registry/v1/feature_schema.json"
            if os.path.exists(schema_path):
                import json
                with open(schema_path, "r", encoding="utf-8") as f:
                    schema = json.load(f)
                    if not self.num_cols:
                        self.num_cols = schema.get("num_cols", [])
                    if not self.cat_cols:
                        self.cat_cols = schema.get("cat_cols", [])

        # Policy initialization
        if policy is not None:
            self.policy = policy
        else:
            pol_cfg = self.config.get("policy", {})
            tier1 = set(self.config.get("tiers", {}).get("tier_1", [])) or None
            tier2 = set(self.config.get("tiers", {}).get("tier_2", [])) or None
            self.policy = DriftTriggerPolicy(
                tier_1_features=tier1,
                tier_2_features=tier2,
                n_min=pol_cfg.get("n_min", 50),
                t_max_days=pol_cfg.get("t_max_days", 180),
                v_max_shipments=pol_cfg.get("v_max_shipments", 1500),
                t_cooldown_days=pol_cfg.get("t_cooldown_days", 30),
                n_cooldown_shipments=pol_cfg.get("n_cooldown_shipments", 50),
                k_persistence=pol_cfg.get("k_persistence", 2),
                psi_warning=pol_cfg.get("psi_warning", 0.10),
                psi_critical=pol_cfg.get("psi_critical", 0.25),
                weighted_score_yellow=pol_cfg.get("weighted_score_yellow", 0.60),
                weighted_score_red=pol_cfg.get("weighted_score_red", 1.20),
            )

    def detect_feature_drift(
        self,
        df_ref: pd.DataFrame,
        df_det: pd.DataFrame,
    ) -> FeatureDriftSummary:
        """
        Computes feature drift across all registered numerical and categorical features.
        Applies Benjamini-Hochberg FDR control across numerical KS tests.
        """
        feature_metrics: Dict[str, FeatureDriftResult] = {}
        ks_pvalues: Dict[str, float] = {}
        feature_psi_map: Dict[str, float] = {}
        
        # 1. Numerical Features
        for col in self.num_cols:
            if col not in df_ref.columns or col not in df_det.columns:
                continue
                
            tier = self.policy.get_feature_tier(col)
            ref_vals = df_ref[col].dropna().values
            det_vals = df_det[col].dropna().values
            
            psi = calculate_psi(ref_vals, det_vals)
            w1 = calculate_normalized_wasserstein(ref_vals, det_vals)
            raw_w1 = float(np.abs(np.mean(det_vals) - np.mean(ref_vals))) if len(ref_vals) > 0 and len(det_vals) > 0 else 0.0
            ks_stat, ks_pval = calculate_ks_test(ref_vals, det_vals)
            
            ks_pvalues[col] = ks_pval
            feature_psi_map[col] = psi
            
            # Determine individual status
            if psi >= self.policy.psi_critical or w1 >= 0.30:
                feat_status = DriftStatus.RED
            elif psi >= self.policy.psi_warning or w1 >= 0.15:
                feat_status = DriftStatus.YELLOW
            else:
                feat_status = DriftStatus.GREEN
                
            feature_metrics[col] = FeatureDriftResult(
                feature_name=col,
                feature_type="numerical",
                tier=tier,
                psi=psi,
                wasserstein=raw_w1,
                normalized_wasserstein=w1,
                ks_stat=ks_stat,
                ks_pvalue=ks_pval,
                status=feat_status,
            )
            
        # FDR multiple testing correction on KS p-values
        fdr_rejections = calculate_benjamini_hochberg_fdr(ks_pvalues, alpha=0.05)
        for col, is_rejected in fdr_rejections.items():
            if col in feature_metrics:
                feature_metrics[col].ks_fdr_rejected = is_rejected

        # 2. Categorical Features
        for col in self.cat_cols:
            if col not in df_ref.columns or col not in df_det.columns:
                continue
                
            tier = self.policy.get_feature_tier(col)
            ref_vals = df_ref[col].dropna()
            det_vals = df_det[col].dropna()
            
            psi = calculate_categorical_psi(ref_vals, det_vals)
            jsd, js_dist = calculate_categorical_jsd(ref_vals, det_vals)
            chi2_stat, chi2_pval = calculate_chi_square_test(ref_vals, det_vals)
            
            feature_psi_map[col] = psi
            
            if psi >= self.policy.psi_critical or js_dist >= 0.20 or chi2_pval < 0.001:
                feat_status = DriftStatus.RED
            elif psi >= self.policy.psi_warning or js_dist >= 0.10 or chi2_pval < 0.05:
                feat_status = DriftStatus.YELLOW
            else:
                feat_status = DriftStatus.GREEN
                
            feature_metrics[col] = FeatureDriftResult(
                feature_name=col,
                feature_type="categorical",
                tier=tier,
                psi=psi,
                jsd=jsd,
                js_distance=js_dist,
                chi2_stat=chi2_stat,
                chi2_pvalue=chi2_pval,
                status=feat_status,
            )

        # 3. Summary Aggregations
        total_feats = len(feature_metrics)
        drifted_count = sum(1 for r in feature_metrics.values() if r.status in (DriftStatus.YELLOW, DriftStatus.RED))
        tier1_red = sum(1 for r in feature_metrics.values() if r.tier == FeatureTier.TIER_1 and r.status == DriftStatus.RED)
        tier1_yellow = sum(1 for r in feature_metrics.values() if r.tier == FeatureTier.TIER_1 and r.status == DriftStatus.YELLOW)
        tier2_red = sum(1 for r in feature_metrics.values() if r.tier == FeatureTier.TIER_2 and r.status == DriftStatus.RED)
        tier2_yellow = sum(1 for r in feature_metrics.values() if r.tier == FeatureTier.TIER_2 and r.status == DriftStatus.YELLOW)
        
        max_psi_feat = max(feature_psi_map.items(), key=lambda x: x[1]) if feature_psi_map else ("None", 0.0)
        weighted_score = self.policy.calculate_weighted_feature_score(feature_psi_map)
        
        # Dimension status
        if tier1_red > 0 or tier1_yellow >= 2 or weighted_score >= self.policy.weighted_score_red:
            summary_status = DriftStatus.RED
        elif tier1_yellow > 0 or tier2_yellow >= 3 or weighted_score >= self.policy.weighted_score_yellow:
            summary_status = DriftStatus.YELLOW
        else:
            summary_status = DriftStatus.GREEN

        return FeatureDriftSummary(
            total_features=total_feats,
            drifted_features_count=drifted_count,
            tier1_red_count=tier1_red,
            tier1_yellow_count=tier1_yellow,
            tier2_red_count=tier2_red,
            tier2_yellow_count=tier2_yellow,
            max_psi=float(max_psi_feat[1]),
            max_psi_feature=str(max_psi_feat[0]),
            weighted_feature_score=weighted_score,
            status=summary_status,
            feature_metrics=feature_metrics,
        )

    def detect_prediction_drift(
        self,
        ref_prob: np.ndarray,
        det_prob: np.ndarray,
        ref_reg: Optional[np.ndarray] = None,
        det_reg: Optional[np.ndarray] = None,
        ref_quantiles: Optional[Dict[str, np.ndarray]] = None,
        det_quantiles: Optional[Dict[str, np.ndarray]] = None,
    ) -> PredictionDriftResult:
        """Computes model output and prediction drift."""
        return calculate_prediction_drift(
            ref_prob=ref_prob,
            det_prob=det_prob,
            ref_reg=ref_reg,
            det_reg=det_reg,
            ref_quantiles=ref_quantiles,
            det_quantiles=det_quantiles,
        )

    def detect_target_drift(
        self,
        df_ref: pd.DataFrame,
        df_det: pd.DataFrame,
        target_flag_col: str = "Delay_Flag",
        target_days_col: str = "Delay_Days",
    ) -> TargetDriftResult:
        """Computes target prevalence and outcome drift."""
        ref_y = df_ref[target_flag_col].dropna().values
        det_y = df_det[target_flag_col].dropna().values
        
        ref_days = df_ref[target_days_col].dropna().values if target_days_col in df_ref.columns else None
        det_days = df_det[target_days_col].dropna().values if target_days_col in df_det.columns else None
        
        return calculate_target_drift(
            ref_y=ref_y,
            det_y=det_y,
            ref_days=ref_days,
            det_days=det_days,
        )

    def detect_uncertainty_drift(
        self,
        q_low_calib: np.ndarray,
        q_high_calib: np.ndarray,
        y_calib: np.ndarray,
        q_low_det: np.ndarray,
        q_high_det: np.ndarray,
        y_det: np.ndarray,
        alpha: float = 0.10,
        q_adjustment: Optional[float] = None,
    ) -> UncertaintyDriftResult:
        """Computes uncertainty and CQR nonconformity drift."""
        return calculate_uncertainty_drift(
            q_low_calib=q_low_calib,
            q_high_calib=q_high_calib,
            y_calib=y_calib,
            q_low_det=q_low_det,
            q_high_det=q_high_det,
            y_det=y_det,
            alpha=alpha,
            q_adjustment=q_adjustment,
        )

    def evaluate_window(
        self,
        df_ref: pd.DataFrame,
        df_det: pd.DataFrame,
        ref_prob: np.ndarray,
        det_prob: np.ndarray,
        q_low_calib: Optional[np.ndarray] = None,
        q_high_calib: Optional[np.ndarray] = None,
        y_calib: Optional[np.ndarray] = None,
        q_low_det: Optional[np.ndarray] = None,
        q_high_det: Optional[np.ndarray] = None,
        y_det: Optional[np.ndarray] = None,
        ref_reg: Optional[np.ndarray] = None,
        det_reg: Optional[np.ndarray] = None,
        ref_quantiles: Optional[Dict[str, np.ndarray]] = None,
        det_quantiles: Optional[Dict[str, np.ndarray]] = None,
        target_flag_col: str = "Delay_Flag",
        target_days_col: str = "Delay_Days",
        t_pred_col: str = "T_pred",
        days_since_calibration: Optional[int] = None,
        shipments_since_calibration: Optional[int] = None,
        days_since_last_recalibration: Optional[int] = None,
        shipments_since_last_recalibration: Optional[int] = None,
        consecutive_yellow_count: int = 0,
        consecutive_red_count: int = 0,
    ) -> DriftReport:
        """
        Executes end-to-end drift evaluation across all 4 dimensions for a chronological window pair.
        """
        # Window metadata
        ref_t_min = str(df_ref[t_pred_col].min().date()) if t_pred_col in df_ref.columns and len(df_ref) > 0 else "-"
        ref_t_max = str(df_ref[t_pred_col].max().date()) if t_pred_col in df_ref.columns and len(df_ref) > 0 else "-"
        det_t_min = str(df_det[t_pred_col].min().date()) if t_pred_col in df_det.columns and len(df_det) > 0 else "-"
        det_t_max = str(df_det[t_pred_col].max().date()) if t_pred_col in df_det.columns and len(df_det) > 0 else "-"
        
        try:
            window_days = (pd.to_datetime(det_t_max) - pd.to_datetime(det_t_min)).days if det_t_min != "-" and det_t_max != "-" else 0
        except Exception:
            window_days = 0
            
        metadata = WindowMetadata(
            reference_start=ref_t_min,
            reference_end=ref_t_max,
            detection_start=det_t_min,
            detection_end=det_t_max,
            ref_sample_count=len(df_ref),
            det_sample_count=len(df_det),
            window_duration_days=window_days,
        )

        # 1. Feature Drift
        feat_drift = self.detect_feature_drift(df_ref, df_det)
        
        # 2. Prediction Drift
        pred_drift = self.detect_prediction_drift(
            ref_prob=ref_prob,
            det_prob=det_prob,
            ref_reg=ref_reg,
            det_reg=det_reg,
            ref_quantiles=ref_quantiles,
            det_quantiles=det_quantiles,
        )
        
        # 3. Target Drift (if labels present)
        targ_drift = None
        if target_flag_col in df_ref.columns and target_flag_col in df_det.columns:
            targ_drift = self.detect_target_drift(
                df_ref=df_ref,
                df_det=df_det,
                target_flag_col=target_flag_col,
                target_days_col=target_days_col,
            )
            
        # 4. Uncertainty Drift (if conformal quantile arrays present)
        unc_drift = None
        if (
            q_low_calib is not None
            and q_high_calib is not None
            and y_calib is not None
            and q_low_det is not None
            and q_high_det is not None
            and y_det is not None
        ):
            unc_drift = self.detect_uncertainty_drift(
                q_low_calib=q_low_calib,
                q_high_calib=q_high_calib,
                y_calib=y_calib,
                q_low_det=q_low_det,
                q_high_det=q_high_det,
                y_det=y_det,
            )

        # 5. Composite Trigger Policy Evaluation
        trigger_eval = self.policy.evaluate(
            sample_count=len(df_det),
            feature_drift=feat_drift,
            prediction_drift=pred_drift,
            target_drift=targ_drift,
            uncertainty_drift=unc_drift,
            days_since_calibration=days_since_calibration,
            shipments_since_calibration=shipments_since_calibration,
            days_since_last_recalibration=days_since_last_recalibration,
            shipments_since_last_recalibration=shipments_since_last_recalibration,
            consecutive_yellow_count=consecutive_yellow_count,
            consecutive_red_count=consecutive_red_count,
        )

        return DriftReport(
            window_metadata=metadata,
            trigger_evaluation=trigger_eval,
            feature_drift=feat_drift,
            prediction_drift=pred_drift,
            target_drift=targ_drift,
            uncertainty_drift=unc_drift,
        )
