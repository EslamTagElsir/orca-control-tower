"""
Expanding-Window Rolling-Origin Backtester for Cost-Sensitive Learning (Phase 2 — Experiment E8).

Executes rigorous temporal evaluation across the 5 development folds respecting the 90-day embargo gap.
Evaluates:
- E8-A: Standard CatBoost + probability calibration + governed threshold (tau=0.50 and validation F1-optimal)
- E8-B: Cost-Sensitive CatBoost with instance-dependent sample weights
- E8-C: Standard CatBoost + probability calibration + instance Bayes optimal thresholding (and tuned gamma)

Computes:
- Realized Business Cost, Baseline Do-Nothing Cost, Net Savings ($), Cost Reduction (%)
- Statistical Performance: PR-AUC, ROC-AUC, F1, Precision, Recall, Balanced Accuracy, Brier Score, ECE
- Operational Capacity: Review Coverage (%), Review Count, Delay-Days Captured, Cost per Reviewed Shipment,
  and Commodity Value Captured ($) across Low, Base, and High impact scenarios.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np
import pandas as pd
import yaml
from sklearn.metrics import (
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

from delay_intelligence.cost_sensitive.cost_engine import (
    CostBreakdown,
    CostEngine,
    CostScenario,
    CostScenarioModel,
    FORBIDDEN_COLUMNS,
    LeakageViolationError,
)
from delay_intelligence.cost_sensitive.models import (
    BaseE8Strategy,
    CostThresholdCatBoostStrategy,
    CostWeightedCatBoostStrategy,
    StandardCatBoostStrategy,
    load_default_feature_schema,
    preprocess_features,
    sanitize_cost_inputs,
)
from delay_intelligence.evaluation.splitter import RollingOriginSplitter

logger = logging.getLogger(__name__)


def compute_expected_calibration_error(
    y_true: Union[np.ndarray, Sequence[int]],
    y_prob: Union[np.ndarray, Sequence[float]],
    n_bins: int = 10,
) -> float:
    """
    Computes standard Expected Calibration Error (ECE) with equal-width probability bins.

    Args:
        y_true: True binary targets (0 or 1).
        y_prob: Predicted probability vector in [0, 1].
        n_bins: Number of probability discretization bins.

    Returns:
        Scalar ECE in [0, 1].
    """
    y = np.asarray(y_true, dtype=float)
    p = np.asarray(y_prob, dtype=float)
    n = len(y)
    if n == 0:
        return 0.0

    bins = np.linspace(0.0, 1.0, n_bins + 1)
    bin_indices = np.digitize(p, bins) - 1
    bin_indices = np.clip(bin_indices, 0, n_bins - 1)

    ece = 0.0
    for b in range(n_bins):
        mask = bin_indices == b
        bin_count = np.sum(mask)
        if bin_count > 0:
            bin_acc = np.mean(y[mask])
            bin_conf = np.mean(p[mask])
            ece += (bin_count / n) * np.abs(bin_acc - bin_conf)

    return float(ece)


def calculate_e8_metrics(
    y_true: Union[np.ndarray, Sequence[int]],
    y_pred: Union[np.ndarray, Sequence[int]],
    y_prob: Union[np.ndarray, Sequence[float]],
    thresholds: Union[np.ndarray, Sequence[float]],
    costs_df: pd.DataFrame,
    delay_days: Optional[Union[np.ndarray, Sequence[float]]] = None,
    days_saved_efficacy: float = 5.0,
    values: Optional[Union[np.ndarray, Sequence[float]]] = None,
) -> Dict[str, Any]:
    """
    Calculates comprehensive economic and statistical metrics for an evaluation horizon.

    Args:
        y_true: Ground-truth binary labels (0 = on-time/early, 1 = late).
        y_pred: Binary decision vector (1 = review/intervene, 0 = no action).
        y_prob: Predicted probability vector in [0, 1].
        thresholds: Applied decision thresholds (scalar or vector).
        costs_df: DataFrame containing instance costs (fn_cost, fp_cost, intervention_cost, residual_delay_cost).
        delay_days: Actual recorded delay duration in days (optional).
        days_saved_efficacy: Expected delay reduction from proactive mitigation.
        values: Un-logged commodity line item values V_i in USD (optional).

    Returns:
        Dictionary of computed metrics.
    """
    y = np.asarray(y_true, dtype=int)
    d = np.asarray(y_pred, dtype=int)
    p = np.asarray(y_prob, dtype=float)
    t = np.asarray(thresholds, dtype=float)
    n = len(y)

    if n == 0:
        return {}

    # 1. Confusion Matrix
    tp = int(np.sum((d == 1) & (y == 1)))
    fp = int(np.sum((d == 1) & (y == 0)))
    tn = int(np.sum((d == 0) & (y == 0)))
    fn = int(np.sum((d == 0) & (y == 1)))

    # 2. Economic Cost Metrics
    realized_cost = CostScenarioModel.compute_expected_cost(y, d, costs_df)
    do_nothing_cost = CostScenarioModel.compute_expected_cost(y, np.zeros_like(y), costs_df)
    all_action_cost = CostScenarioModel.compute_expected_cost(y, np.ones_like(y), costs_df)
    net_savings = float(do_nothing_cost - realized_cost)
    cost_reduction_pct = float((net_savings / do_nothing_cost * 100.0) if do_nothing_cost > 0 else 0.0)

    # 3. Statistical ML Metrics
    if len(np.unique(y)) > 1:
        pr_auc = float(average_precision_score(y, p))
        roc_auc = float(roc_auc_score(y, p))
    else:
        pr_auc = float("nan")
        roc_auc = float("nan")

    f1 = float(f1_score(y, d, zero_division=0))
    precision = float(precision_score(y, d, zero_division=0))
    recall = float(recall_score(y, d, zero_division=0))
    balanced_acc = float(balanced_accuracy_score(y, d))
    brier = float(brier_score_loss(y, p))
    ece = compute_expected_calibration_error(y, p)

    # 4. Operational Capacity & Review Metrics
    review_count = int(np.sum(d))
    review_coverage = float(review_count / n if n > 0 else 0.0)

    # Delay-days captured
    if delay_days is not None:
        dd = np.asarray(delay_days, dtype=float)
        captured_delay_days = float(np.sum(np.where((d == 1) & (y == 1), np.minimum(dd, days_saved_efficacy), 0.0)))
    else:
        captured_delay_days = float(tp * days_saved_efficacy)

    # Cost per reviewed shipment
    if review_count > 0:
        interv_costs = costs_df["intervention_cost"].to_numpy(dtype=float)
        resid_costs = costs_df["residual_delay_cost"].to_numpy(dtype=float)
        fp_costs = costs_df["fp_cost"].to_numpy(dtype=float)
        review_cost_vector = np.where(y == 1, interv_costs + resid_costs, fp_costs)
        total_review_cost = float(np.sum(review_cost_vector[d == 1]))
        cost_per_reviewed_shipment = float(total_review_cost / review_count)
    else:
        cost_per_reviewed_shipment = 0.0

    # Commodity value metrics
    if values is not None:
        v_arr = np.asarray(values, dtype=float)
        total_reviewed_value = float(np.sum(v_arr[d == 1]))
        total_delayed_value_captured = float(np.sum(v_arr[(d == 1) & (y == 1)]))
        total_cohort_value = float(np.sum(v_arr))
    else:
        total_reviewed_value = 0.0
        total_delayed_value_captured = 0.0
        total_cohort_value = 0.0

    return {
        "sample_count": n,
        "positives_count": int(np.sum(y)),
        "delay_rate": float(np.mean(y)),
        "reviews_count": review_count,
        "review_coverage": review_coverage,
        "realized_cost": realized_cost,
        "do_nothing_cost": do_nothing_cost,
        "all_action_cost": all_action_cost,
        "net_savings": net_savings,
        "cost_reduction_pct": cost_reduction_pct,
        "pr_auc": pr_auc,
        "roc_auc": roc_auc,
        "f1": f1,
        "precision": precision,
        "recall": recall,
        "balanced_accuracy": balanced_acc,
        "brier_score": brier,
        "ece": ece,
        "delay_days_captured": captured_delay_days,
        "cost_per_reviewed_shipment": cost_per_reviewed_shipment,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "total_cohort_value_usd": total_cohort_value,
        "total_reviewed_value_usd": total_reviewed_value,
        "total_delayed_value_captured_usd": total_delayed_value_captured,
        "threshold_mean": float(np.mean(t)),
        "threshold_median": float(np.median(t)),
        "threshold_min": float(np.min(t)),
        "threshold_max": float(np.max(t)),
    }


class ExpandingWindowBacktester:
    """
    Rolling-Origin Expanding-Window Backtester for Experiment E8.
    Evaluates model strategies over the 5 development temporal folds with a 90-day embargo gap.
    """

    def __init__(
        self,
        config_path: Union[str, Path] = "configs/e8_experiments.yaml",
        cost_config_path: Union[str, Path] = "configs/cost_scenarios.yaml",
        features_path: Union[str, Path] = "artifacts/data/scms_modeling_features.parquet",
        output_dir: Union[str, Path] = "artifacts/results",
    ):
        """
        Initializes the expanding-window backtester.

        Args:
            config_path: Path to E8 experiment configuration YAML.
            cost_config_path: Path to cost scenarios configuration YAML.
            features_path: Path to Silver modeling features parquet file.
            output_dir: Directory to store output evaluation artifacts.
        """
        self.config_path = Path(config_path)
        self.cost_config_path = Path(cost_config_path)
        self.features_path = Path(features_path)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.config: Dict[str, Any] = {}
        if self.config_path.exists():
            with open(self.config_path, "r", encoding="utf-8") as f:
                self.config = yaml.safe_load(f) or {}

        self.cost_engine = CostScenarioModel(config_path=self.cost_config_path)
        self.feature_cols, self.num_cols, self.cat_cols = load_default_feature_schema()

        # Config parameters
        self.n_folds = self.config.get("temporal", {}).get("n_folds", 5)
        self.gap_days = self.config.get("temporal", {}).get("gap_days", 90)
        self.inner_val_ratio = self.config.get("temporal", {}).get("inner_val_ratio", 0.20)
        self.inner_gap_days = self.config.get("temporal", {}).get("inner_gap_days", 30)
        self.catboost_params = self.config.get("catboost", {
            "iterations": 300,
            "learning_rate": 0.05,
            "depth": 6,
            "random_seed": 42,
            "verbose": 0,
        })
        self.scenarios = self.config.get("scenarios", ["low", "base", "high"])

    def load_dataset(self) -> pd.DataFrame:
        """Loads and pre-sorts the modeling feature dataset chronologically by T_pred."""
        if not self.features_path.exists():
            raise FileNotFoundError(f"Features parquet not found: {self.features_path}")

        df = pd.read_parquet(self.features_path)
        df["T_pred"] = pd.to_datetime(df["T_pred"])
        df = df.sort_values("T_pred").reset_index(drop=True)
        return df

    def get_development_folds(self, df: pd.DataFrame) -> Tuple[List[Dict[str, Any]], pd.DataFrame]:
        """
        Extracts the 5 development folds using the standard RollingOriginSplitter.
        Strictly excludes the 365-day final holdout.
        """
        splitter = RollingOriginSplitter()
        folds, holdout_idx, manifest_df = splitter.split(df)
        # Development folds are strictly folds 0 to 4
        dev_folds = [f for f in folds if isinstance(f.get("fold_id"), int) and f.get("fold_id") < 5]
        return dev_folds, manifest_df

    def split_inner_train_val(
        self,
        df_train: pd.DataFrame,
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Splits a fold's training dataset into chronological inner-train (80%) and inner-val (20%)
        separated by an inner embargo gap (30 days).
        """
        df_sorted = df_train.sort_values("T_pred").reset_index(drop=True)
        n = len(df_sorted)

        t_start = df_sorted["T_pred"].min()
        t_end = df_sorted["T_pred"].max()
        duration_days = max(1, (t_end - t_start).days)

        val_days = int(duration_days * self.inner_val_ratio)
        val_start = t_end - pd.Timedelta(days=val_days)
        train_end = val_start - pd.Timedelta(days=self.inner_gap_days)

        inner_train = df_sorted[(df_sorted["T_pred"] >= t_start) & (df_sorted["T_pred"] < train_end)].copy()
        inner_val = df_sorted[df_sorted["T_pred"] >= val_start].copy()

        # Fallback if date-based split produces degenerate sets
        if len(inner_train) < 100 or len(inner_val) < 50:
            split_idx = int(n * (1.0 - self.inner_val_ratio))
            inner_train = df_sorted.iloc[:split_idx].copy()
            inner_val = df_sorted.iloc[split_idx:].copy()

        return inner_train, inner_val

    def instantiate_strategy(
        self,
        strategy_key: str,
        scenario_name: str,
    ) -> BaseE8Strategy:
        """
        Instantiates a configured strategy for a specific scenario.

        Args:
            strategy_key: Key matching strategy configuration (e.g. 'E8-A_tau0.5', 'E8-A_f1', 'E8-B_cost_weighted', 'E8-C_bayes_threshold', 'E8-C_tuned_gamma').
            scenario_name: Name of cost scenario ('low', 'base', 'high').

        Returns:
            Configured BaseE8Strategy instance.
        """
        strat_cfg = self.config.get("strategies", {}).get(strategy_key, {})
        class_name = strat_cfg.get("class_name", "")

        model_params = dict(self.catboost_params)

        if strategy_key == "E8-A_tau0.5" or (class_name == "StandardCatBoostStrategy" and strat_cfg.get("threshold_mode") == "fixed"):
            return StandardCatBoostStrategy(
                threshold_mode="fixed",
                fixed_threshold=strat_cfg.get("fixed_threshold", 0.50),
                cost_engine=self.cost_engine,
                scenario_name=scenario_name,
                model_params=model_params,
                cat_cols=self.cat_cols,
                num_cols=self.num_cols,
                feature_cols=self.feature_cols,
                calibrate=strat_cfg.get("calibrate", True),
            )

        if strategy_key == "E8-A_f1" or (class_name == "StandardCatBoostStrategy" and strat_cfg.get("threshold_mode") == "f1_optimal"):
            return StandardCatBoostStrategy(
                threshold_mode="f1_optimal",
                cost_engine=self.cost_engine,
                scenario_name=scenario_name,
                model_params=model_params,
                cat_cols=self.cat_cols,
                num_cols=self.num_cols,
                feature_cols=self.feature_cols,
                calibrate=strat_cfg.get("calibrate", True),
            )

        if strategy_key == "E8-B_cost_weighted" or class_name == "CostWeightedCatBoostStrategy":
            return CostWeightedCatBoostStrategy(
                threshold_mode=strat_cfg.get("threshold_mode", "cost_optimal"),
                fixed_threshold=strat_cfg.get("fixed_threshold", 0.50),
                epsilon=strat_cfg.get("epsilon", 10.0),
                normalize=strat_cfg.get("normalize", True),
                cost_engine=self.cost_engine,
                scenario_name=scenario_name,
                model_params=model_params,
                cat_cols=self.cat_cols,
                num_cols=self.num_cols,
                feature_cols=self.feature_cols,
                calibrate=strat_cfg.get("calibrate", False),
            )

        if strategy_key == "E8-C_bayes_threshold" or (class_name == "CostThresholdCatBoostStrategy" and not strat_cfg.get("use_gamma_tuning", False)):
            return CostThresholdCatBoostStrategy(
                use_gamma_tuning=False,
                gamma=strat_cfg.get("gamma", 1.0),
                cost_engine=self.cost_engine,
                scenario_name=scenario_name,
                model_params=model_params,
                cat_cols=self.cat_cols,
                num_cols=self.num_cols,
                feature_cols=self.feature_cols,
                calibrate=strat_cfg.get("calibrate", True),
            )

        if strategy_key == "E8-C_tuned_gamma" or (class_name == "CostThresholdCatBoostStrategy" and strat_cfg.get("use_gamma_tuning", True)):
            return CostThresholdCatBoostStrategy(
                use_gamma_tuning=True,
                gamma_range=(
                    self.config.get("threshold_tuning", {}).get("gamma_min", 0.20),
                    self.config.get("threshold_tuning", {}).get("gamma_max", 2.00),
                    self.config.get("threshold_tuning", {}).get("gamma_step", 0.05),
                ),
                cost_engine=self.cost_engine,
                scenario_name=scenario_name,
                model_params=model_params,
                cat_cols=self.cat_cols,
                num_cols=self.num_cols,
                feature_cols=self.feature_cols,
                calibrate=strat_cfg.get("calibrate", True),
            )

        # Generic fallback
        return StandardCatBoostStrategy(
            threshold_mode="fixed",
            fixed_threshold=0.50,
            cost_engine=self.cost_engine,
            scenario_name=scenario_name,
            model_params=model_params,
            cat_cols=self.cat_cols,
            num_cols=self.num_cols,
            feature_cols=self.feature_cols,
        )

    def run_development_backtest(
        self,
        df: Optional[pd.DataFrame] = None,
        strategy_keys: Optional[List[str]] = None,
        scenarios: Optional[List[str]] = None,
        save_artifacts: bool = True,
    ) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """
        Executes the full expanding-window development backtest across the 5 development folds.

        Args:
            df: Optional preloaded modeling features DataFrame.
            strategy_keys: Optional subset of strategy names to evaluate.
            scenarios: Optional subset of scenarios to evaluate.
            save_artifacts: Whether to write output parquet and JSON files.

        Returns:
            Tuple of (record_predictions_df, structured_metrics_summary_dict).
        """
        t_start_total = time.time()
        dataset = df if df is not None else self.load_dataset()

        dev_folds, manifest_df = self.get_development_folds(dataset)
        active_scenarios = scenarios or self.scenarios
        active_strategies = strategy_keys or list(self.config.get("strategies", {
            "E8-A_tau0.5": {},
            "E8-A_f1": {},
            "E8-B_cost_weighted": {},
            "E8-C_bayes_threshold": {},
            "E8-C_tuned_gamma": {},
        }).keys())

        logger.info(
            f"Starting E8 Expanding-Window Backtest across {len(dev_folds)} folds, "
            f"{len(active_scenarios)} scenarios, {len(active_strategies)} strategies."
        )

        all_record_rows: List[Dict[str, Any]] = []
        all_fold_metrics: List[Dict[str, Any]] = []

        # Loop over folds
        for fold in dev_folds:
            fold_id = fold["fold_id"]
            train_idx = fold["train"]
            val_idx = fold["val"]

            df_train = dataset.loc[train_idx].copy().sort_values("T_pred").reset_index(drop=True)
            df_val = dataset.loc[val_idx].copy().sort_values("T_pred").reset_index(drop=True)

            inner_train, inner_val = self.split_inner_train_val(df_train)

            y_inner_tr = inner_train["Delay_Flag"].to_numpy(dtype=int)
            y_inner_val = inner_val["Delay_Flag"].to_numpy(dtype=int)

            X_inner_tr = inner_train[self.feature_cols]
            X_inner_val = inner_val[self.feature_cols]

            y_val = df_val["Delay_Flag"].to_numpy(dtype=int)
            X_val = df_val[self.feature_cols]
            val_delay_days = df_val["Delay_Days"].to_numpy(dtype=float) if "Delay_Days" in df_val.columns else None
            
            clean_df_val = sanitize_cost_inputs(df_val)
            val_usd_values = self.cost_engine.extract_monetary_values(clean_df_val)

            # Loop over scenarios
            for sc_name in active_scenarios:
                sc_obj = self.cost_engine.get_scenario(sc_name)
                val_costs_df = self.cost_engine.compute_costs(
                    clean_df_val,
                    scenario_name=sc_name,
                    strict_leakage_check=True,
                    return_dataframe=True,
                )

                # Loop over strategies
                for strat_key in active_strategies:
                    t0 = time.time()
                    strategy = self.instantiate_strategy(strat_key, scenario_name=sc_name)

                    # Fit strategy on inner-train and inner-val
                    strategy.fit(
                        X_train=X_inner_tr,
                        y_train=y_inner_tr,
                        df_raw_train=inner_train,
                        X_val=X_inner_val,
                        y_val=y_inner_val,
                        df_raw_val=inner_val,
                    )

                    # Predict on out-of-fold validation set
                    val_probs = strategy.predict_proba(X_val)
                    val_thresholds = strategy.predict_thresholds(X_val, df_raw=clean_df_val)
                    val_decisions = (val_probs >= val_thresholds).astype(int)
                    fit_eval_time = time.time() - t0

                    # Calculate fold-level metrics
                    metrics = calculate_e8_metrics(
                        y_true=y_val,
                        y_pred=val_decisions,
                        y_prob=val_probs,
                        thresholds=val_thresholds,
                        costs_df=val_costs_df,
                        delay_days=val_delay_days,
                        days_saved_efficacy=sc_obj.days_saved_efficacy,
                        values=val_usd_values,
                    )

                    metrics.update({
                        "fold_id": fold_id,
                        "scenario": sc_name,
                        "strategy": strat_key,
                        "strategy_class": strategy.__class__.__name__,
                        "val_start": str(df_val["T_pred"].min().date()),
                        "val_end": str(df_val["T_pred"].max().date()),
                        "train_samples": len(df_train),
                        "val_samples": len(df_val),
                        "fit_eval_time_sec": float(fit_eval_time),
                        **strategy.get_metadata(),
                    })
                    all_fold_metrics.append(metrics)

                    # Collect record-level rows
                    for idx, row_val in df_val.iterrows():
                        row_cost = val_costs_df.iloc[idx]
                        y_i = int(y_val[idx])
                        d_i = int(val_decisions[idx])
                        fn_i = float(row_cost["fn_cost"])
                        fp_i = float(row_cost["fp_cost"])
                        int_i = float(row_cost["intervention_cost"])
                        res_i = float(row_cost["residual_delay_cost"])
                        net_b_i = float(row_cost["net_benefit"])

                        real_c_i = (int_i + res_i if y_i == 1 else fp_i) if d_i == 1 else (fn_i if y_i == 1 else 0.0)
                        none_c_i = fn_i if y_i == 1 else 0.0

                        all_record_rows.append({
                            "fold_id": fold_id,
                            "scenario": sc_name,
                            "strategy": strat_key,
                            "ID": row_val.get("ID", idx),
                            "T_pred": str(row_val["T_pred"]),
                            "y_true": y_i,
                            "delay_days": float(row_val.get("Delay_Days", 0.0)),
                            "line_item_value_usd": float(val_usd_values[idx]),
                            "prob_pred": float(val_probs[idx]),
                            "threshold": float(val_thresholds[idx]),
                            "decision": d_i,
                            "fn_cost": fn_i,
                            "fp_cost": fp_i,
                            "intervention_cost": int_i,
                            "residual_delay_cost": res_i,
                            "net_benefit": net_b_i,
                            "realized_cost": real_c_i,
                            "do_nothing_cost": none_c_i,
                        })

        records_df = pd.DataFrame(all_record_rows)
        fold_metrics_df = pd.DataFrame(all_fold_metrics)

        # Aggregate across folds (mean and std)
        aggregated_summary: Dict[str, Any] = {}
        for sc_name in active_scenarios:
            aggregated_summary[sc_name] = {}
            for strat_key in active_strategies:
                sub_df = fold_metrics_df[(fold_metrics_df["scenario"] == sc_name) & (fold_metrics_df["strategy"] == strat_key)]
                if len(sub_df) > 0:
                    strat_summary = {
                        "folds_count": len(sub_df),
                        "total_val_samples": int(sub_df["val_samples"].sum()),
                        "mean_realized_cost": float(sub_df["realized_cost"].mean()),
                        "std_realized_cost": float(sub_df["realized_cost"].std()),
                        "total_realized_cost": float(sub_df["realized_cost"].sum()),
                        "total_do_nothing_cost": float(sub_df["do_nothing_cost"].sum()),
                        "total_net_savings": float(sub_df["net_savings"].sum()),
                        "macro_mean_cost_reduction_pct": float(sub_df["cost_reduction_pct"].mean()),
                        "pooled_cost_reduction_pct": float(
                            ((sub_df["do_nothing_cost"].sum() - sub_df["realized_cost"].sum()) / sub_df["do_nothing_cost"].sum() * 100.0)
                            if sub_df["do_nothing_cost"].sum() > 0 else 0.0
                        ),
                        "mean_pr_auc": float(sub_df["pr_auc"].mean()),
                        "std_pr_auc": float(sub_df["pr_auc"].std()),
                        "mean_roc_auc": float(sub_df["roc_auc"].mean()),
                        "std_roc_auc": float(sub_df["roc_auc"].std()),
                        "mean_f1": float(sub_df["f1"].mean()),
                        "std_f1": float(sub_df["f1"].std()),
                        "mean_precision": float(sub_df["precision"].mean()),
                        "mean_recall": float(sub_df["recall"].mean()),
                        "mean_balanced_accuracy": float(sub_df["balanced_accuracy"].mean()),
                        "mean_brier_score": float(sub_df["brier_score"].mean()),
                        "mean_ece": float(sub_df["ece"].mean()),
                        "mean_review_coverage": float(sub_df["review_coverage"].mean()),
                        "total_reviews": int(sub_df["reviews_count"].sum()),
                        "total_delay_days_captured": float(sub_df["delay_days_captured"].sum()),
                        "mean_cost_per_reviewed_shipment": float(sub_df["cost_per_reviewed_shipment"].mean()),
                        "total_tp": int(sub_df["tp"].sum()),
                        "total_fp": int(sub_df["fp"].sum()),
                        "total_tn": int(sub_df["tn"].sum()),
                        "total_fn": int(sub_df["fn"].sum()),
                        "mean_threshold": float(sub_df["threshold_mean"].mean()),
                    }
                    aggregated_summary[sc_name][strat_key] = strat_summary

        total_exec_time = time.time() - t_start_total

        # Build output structure
        metrics_payload = {
            "metadata": {
                "generated_at_utc": datetime.now(timezone.utc).isoformat(),
                "experiment": "Phase 2 — E8 Cost-Sensitive Learning",
                "milestone": "M2 Expanding-Window Development Backtester",
                "n_development_folds": len(dev_folds),
                "scenarios": active_scenarios,
                "strategies": active_strategies,
                "total_execution_time_sec": float(total_exec_time),
            },
            "manifest": manifest_df.to_dict(orient="records"),
            "fold_metrics": all_fold_metrics,
            "aggregated_summary": aggregated_summary,
        }

        # Save artifacts
        if save_artifacts:
            parquet_path = self.output_dir / "e8_dev_backtest_results.parquet"
            json_path = self.output_dir / "e8_dev_metrics.json"

            records_df.to_parquet(parquet_path, index=False)
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(metrics_payload, f, indent=2)

            logger.info(f"Saved dev backtest records to {parquet_path}")
            logger.info(f"Saved dev metrics summary to {json_path}")

        return records_df, metrics_payload


def run_e8_dev_backtest(
    config_path: str = "configs/e8_experiments.yaml",
) -> Dict[str, Any]:
    """Convenience entrypoint for executing E8 development backtesting."""
    backtester = ExpandingWindowBacktester(config_path=config_path)
    _, summary = backtester.run_development_backtest()
    return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_e8_dev_backtest()
