"""Phase 2 Experiment: Operational Decision Utility & Prioritization Benchmark."""

import hashlib
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Tuple
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
import catboost as cb
import lightgbm as lgb

import sys
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))
from research.scripts.data_utils import get_development_data, get_feature_columns, get_temporal_folds, CANONICAL_SHA256

EXPERIMENT_ID = "EXP_05_DECISION_UTILITY"
GIT_COMMIT = "6f71396ac38466c9d18e2706bea8688d9c2ea8ac"
SEED = 42

def evaluate_ranking_at_k(
    y_true_flag: np.ndarray,
    y_true_days: np.ndarray,
    scores: np.ndarray,
    k_fracs: List[float] = [0.01, 0.05, 0.10, 0.20],
) -> List[Dict[str, float]]:
    """Evaluate Top-K retrieval metrics under a specific ranking strategy."""
    n_total = len(y_true_flag)
    total_delayed = int(np.sum(y_true_flag == 1))
    total_high_sev = int(np.sum((y_true_flag == 1) & (y_true_days > 14)))
    total_delay_days = float(np.sum(np.maximum(0.0, y_true_days)))

    order = np.argsort(-scores)
    results = []

    for k_frac in k_fracs:
        k_count = max(1, int(np.ceil(k_frac * n_total)))
        top_idx = order[:k_count]

        del_cap = int(np.sum(y_true_flag[top_idx] == 1))
        high_sev_cap = int(np.sum((y_true_flag[top_idx] == 1) & (y_true_days[top_idx] > 14)))
        days_cap = float(np.sum(np.maximum(0.0, y_true_days[top_idx])))

        recall_at_k = del_cap / max(1, total_delayed)
        high_sev_recall_at_k = high_sev_cap / max(1, total_high_sev)
        days_cap_ratio = days_cap / max(1.0, total_delay_days)

        results.append({
            "k_fraction": k_frac,
            "k_shipments": k_count,
            "delayed_captured": del_cap,
            "total_delayed": total_delayed,
            "recall_at_k": recall_at_k,
            "high_severity_captured": high_sev_cap,
            "high_severity_recall_at_k": high_sev_recall_at_k,
            "delay_days_captured": days_cap,
            "total_delay_days": total_delay_days,
            "delay_days_capture_ratio": days_cap_ratio,
        })
    return results

def run_decision_utility_experiments():
    print(f"[{datetime.now().isoformat()}] Starting Operational Decision Utility Simulation...")
    df_dev = get_development_data()
    num_cols, cat_cols = get_feature_columns()
    folds = get_temporal_folds(df_dev)

    metrics_dir = REPO_ROOT / "research" / "outputs" / "metrics"
    tables_dir = REPO_ROOT / "research" / "outputs" / "tables"
    figures_dir = REPO_ROOT / "research" / "outputs" / "figures"
    metrics_dir.mkdir(parents=True, exist_ok=True)
    tables_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)

    utility_records = []

    for fold in folds:
        fold_id = fold["fold_id"]
        train_idx = fold["train_idx"]
        val_idx = fold["val_idx"]

        # Temporal split of train into sub-train (80%) and calib (20%)
        df_tr_full = df_dev.loc[train_idx].copy().sort_values("T_pred")
        n_tr = len(df_tr_full)
        split_pt = int(0.80 * n_tr)

        df_subtr = df_tr_full.iloc[:split_pt]
        df_calib = df_tr_full.iloc[split_pt:]
        df_val = df_dev.loc[val_idx].copy()

        y_subtr_flag = df_subtr["Delay_Flag"].astype(int).to_numpy()
        y_calib_flag = df_calib["Delay_Flag"].astype(int).to_numpy()
        y_val_flag = df_val["Delay_Flag"].astype(int).to_numpy()
        y_val_days = df_val["Delay_Days"].astype(float).fillna(0.0).to_numpy()

        X_subtr = df_subtr[num_cols + cat_cols].copy()
        X_calib = df_calib[num_cols + cat_cols].copy()
        X_val = df_val[num_cols + cat_cols].copy()

        for col in cat_cols:
            X_subtr[col] = X_subtr[col].fillna("Missing").astype(str)
            X_calib[col] = X_calib[col].fillna("Missing").astype(str)
            X_val[col] = X_val[col].fillna("Missing").astype(str)
        for col in num_cols:
            X_subtr[col] = pd.to_numeric(X_subtr[col], errors="coerce").fillna(0.0).astype(float)
            X_calib[col] = pd.to_numeric(X_calib[col], errors="coerce").fillna(0.0).astype(float)
            X_val[col] = pd.to_numeric(X_val[col], errors="coerce").fillna(0.0).astype(float)

        print(f"\n--- Fold {fold_id} (Train: {len(X_subtr)}, Calib: {len(X_calib)}, Val: {len(X_val)}) ---")

        # 1. Fit CatBoost Classifier + Isotonic Calibration
        clf_cb = cb.CatBoostClassifier(iterations=300, learning_rate=0.05, depth=6, auto_class_weights="Balanced", cat_features=cat_cols, random_seed=SEED, verbose=0, thread_count=-1)
        clf_cb.fit(X_subtr, y_subtr_flag)
        p_cal = clf_cb.predict_proba(X_calib)[:, 1]
        p_val_raw = clf_cb.predict_proba(X_val)[:, 1]

        iso = IsotonicRegression(out_of_bounds="clip")
        iso.fit(p_cal, y_calib_flag)
        p_val_calibrated = iso.predict(p_val_raw)

        # 2. Fit LightGBM Quantile Regressors on Delayed Sub-train
        del_mask_subtr = y_subtr_flag == 1
        X_subtr_del = X_subtr[del_mask_subtr].copy()
        y_subtr_del_days = df_subtr.loc[del_mask_subtr, "Delay_Days"].astype(float).to_numpy()

        for col in cat_cols:
            X_subtr_del[col] = X_subtr_del[col].astype("category")
            X_calib[col] = pd.Categorical(X_calib[col], categories=X_subtr_del[col].cat.categories)
            X_val[col] = pd.Categorical(X_val[col], categories=X_subtr_del[col].cat.categories)

        lgb_q05 = lgb.LGBMRegressor(objective="quantile", alpha=0.05, n_estimators=300, learning_rate=0.05, num_leaves=31, subsample=0.8, colsample_bytree=0.8, random_state=SEED, verbose=-1, n_jobs=-1)
        lgb_q50 = lgb.LGBMRegressor(objective="quantile", alpha=0.50, n_estimators=300, learning_rate=0.05, num_leaves=31, subsample=0.8, colsample_bytree=0.8, random_state=SEED, verbose=-1, n_jobs=-1)
        lgb_q95 = lgb.LGBMRegressor(objective="quantile", alpha=0.95, n_estimators=300, learning_rate=0.05, num_leaves=31, subsample=0.8, colsample_bytree=0.8, random_state=SEED, verbose=-1, n_jobs=-1)

        lgb_q05.fit(X_subtr_del, y_subtr_del_days)
        lgb_q50.fit(X_subtr_del, y_subtr_del_days)
        lgb_q95.fit(X_subtr_del, y_subtr_del_days)

        # Conformal adjustment on calibration delayed
        del_mask_calib = y_calib_flag == 1
        X_cal_del = X_calib[del_mask_calib].copy()
        y_cal_del_days = df_calib.loc[del_mask_calib, "Delay_Days"].astype(float).to_numpy()

        scores_90 = np.maximum(lgb_q05.predict(X_cal_del) - y_cal_del_days, y_cal_del_days - lgb_q95.predict(X_cal_del))
        q_adj_90 = float(np.quantile(scores_90, min(1.0, 0.90 * (1.0 + 1.0 / len(scores_90))), method="higher"))

        sev_p50_val = np.maximum(0.0, lgb_q50.predict(X_val))
        sev_q95_val = np.maximum(0.0, lgb_q95.predict(X_val) + q_adj_90)
        sev_q05_val = np.maximum(0.0, lgb_q05.predict(X_val) - q_adj_90)
        uncertainty_width = sev_q95_val - sev_q05_val

        # Ranking Strategies
        strategies = {
            "Strategy_1_Risk_Only": p_val_calibrated,
            "Strategy_2_Risk_x_Severity": p_val_calibrated * sev_p50_val,
            "Strategy_3_Uncertainty_Aware": p_val_calibrated * sev_q95_val,
        }

        for strat_name, score_arr in strategies.items():
            k_evals = evaluate_ranking_at_k(y_val_flag, y_val_days, score_arr)
            for res in k_evals:
                utility_records.append({
                    "experiment_id": EXPERIMENT_ID,
                    "git_commit": GIT_COMMIT,
                    "data_sha256": CANONICAL_SHA256,
                    "evidence_label": "SIMULATED SCENARIO",
                    "fold_id": fold_id,
                    "strategy": strat_name,
                    "k_fraction": res["k_fraction"],
                    "k_shipments": res["k_shipments"],
                    "delayed_captured": res["delayed_captured"],
                    "total_delayed": res["total_delayed"],
                    "recall_at_k": res["recall_at_k"],
                    "high_severity_captured": res["high_severity_captured"],
                    "high_severity_recall_at_k": res["high_severity_recall_at_k"],
                    "delay_days_captured": res["delay_days_captured"],
                    "total_delay_days": res["total_delay_days"],
                    "delay_days_capture_ratio": res["delay_days_capture_ratio"],
                })

    df_util = pd.DataFrame(utility_records)
    util_csv = metrics_dir / "decision_utility.csv"
    df_util.to_csv(util_csv, index=False)
    print(f"\nSaved decision utility records to {util_csv}")

    # Summary grouped by strategy and K
    summary_util = df_util.groupby(["strategy", "k_fraction"]).agg({
        "recall_at_k": ["mean", "std"],
        "high_severity_recall_at_k": ["mean", "std"],
        "delay_days_capture_ratio": ["mean", "std"],
    }).reset_index()
    summary_util.columns = ["_".join(c).strip("_") for c in summary_util.columns]
    summary_csv = tables_dir / "decision_utility_summary.csv"
    summary_util.to_csv(summary_csv, index=False)
    print(f"Saved decision utility summary to {summary_csv}")
    print("\n" + summary_util.to_string(index=False))

    # Figure: Prioritization Curves across K
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 4.8))
    k_vals = [0.01, 0.05, 0.10, 0.20]
    strat_colors = {
        "Strategy_1_Risk_Only": ("tab:blue", "o-", "Strategy 1: Risk Probability Only"),
        "Strategy_2_Risk_x_Severity": ("tab:green", "s-", "Strategy 2: Risk × Predicted Severity (p50)"),
        "Strategy_3_Uncertainty_Aware": ("tab:purple", "^-", "Strategy 3: Uncertainty-Aware (Upper Bound q95)"),
    }

    for strat, (color, fmt, label) in strat_colors.items():
        sub = summary_util[summary_util["strategy"] == strat]
        ax1.plot(sub["k_fraction"] * 100, sub["recall_at_k_mean"] * 100, fmt, color=color, linewidth=2, markersize=7, label=label)
        ax2.plot(sub["k_fraction"] * 100, sub["delay_days_capture_ratio_mean"] * 100, fmt, color=color, linewidth=2, markersize=7, label=label)

    ax1.set_xlabel("Operational Inspection Capacity K (%)", fontsize=11, fontweight="bold")
    ax1.set_ylabel("Delayed Shipments Captured (Recall@K %)", fontsize=11, fontweight="bold")
    ax1.set_title("Delayed Shipment Capture vs. Capacity K\n[SIMULATED SCENARIO]", fontsize=12, fontweight="bold")
    ax1.grid(True, alpha=0.3)
    ax1.legend(loc="lower right", frameon=True, fontsize=9)

    ax2.set_xlabel("Operational Inspection Capacity K (%)", fontsize=11, fontweight="bold")
    ax2.set_ylabel("Cumulative Delay Days Captured (%)", fontsize=11, fontweight="bold")
    ax2.set_title("Delay-Days Captured vs. Capacity K\n[SIMULATED SCENARIO]", fontsize=12, fontweight="bold")
    ax2.grid(True, alpha=0.3)
    ax2.legend(loc="lower right", frameon=True, fontsize=9)

    plt.tight_layout()
    fig_path = figures_dir / "decision_utility_at_k.png"
    plt.savefig(fig_path, dpi=300)
    plt.close()
    print(f"Saved Decision Utility figure to {fig_path}")

if __name__ == "__main__":
    run_decision_utility_experiments()
