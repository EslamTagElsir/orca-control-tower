"""Phase 2 Experiment: Conformal Uncertainty Calibration & Coverage vs. Sharpness Study."""

import hashlib
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Tuple
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.stats import beta
import lightgbm as lgb

import sys
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))
from research.scripts.data_utils import get_development_data, get_feature_columns, get_temporal_folds, CANONICAL_SHA256

EXPERIMENT_ID = "EXP_04_CONFORMAL_UNCERTAINTY"
GIT_COMMIT = "6f71396ac38466c9d18e2706bea8688d9c2ea8ac"
SEED = 42

def exact_clopper_pearson_ci(k: int, n: int, confidence: float = 0.95) -> Tuple[float, float]:
    """Calculate exact Clopper-Pearson Binomial Confidence Interval."""
    if n == 0:
        return 0.0, 1.0
    alpha = 1.0 - confidence
    low = 0.0 if k == 0 else float(beta.ppf(alpha / 2, k, n - k + 1))
    high = 1.0 if k == n else float(beta.ppf(1 - alpha / 2, k + 1, n - k))
    return low, high

def run_conformal_experiments():
    print(f"[{datetime.now().isoformat()}] Starting Conformal Uncertainty Study...")
    df_dev = get_development_data()
    num_cols, cat_cols = get_feature_columns()
    folds = get_temporal_folds(df_dev)

    metrics_dir = REPO_ROOT / "research" / "outputs" / "metrics"
    tables_dir = REPO_ROOT / "research" / "outputs" / "tables"
    figures_dir = REPO_ROOT / "research" / "outputs" / "figures"
    metrics_dir.mkdir(parents=True, exist_ok=True)
    tables_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)

    coverage_configs = [
        {"nominal": 0.80, "alpha": 0.20, "q_low": 0.10, "q_high": 0.90},
        {"nominal": 0.90, "alpha": 0.10, "q_low": 0.05, "q_high": 0.95},
        {"nominal": 0.95, "alpha": 0.05, "q_low": 0.025, "q_high": 0.975},
    ]

    conformal_results = []

    for fold in folds:
        fold_id = fold["fold_id"]
        train_idx = fold["train_idx"]
        val_idx = fold["val_idx"]

        # Delayed training set split into sub-train (80%) and calib (20%)
        df_tr_del = df_dev.loc[train_idx][df_dev.loc[train_idx, "Delay_Flag"] == 1].copy().sort_values("T_pred")
        df_va_del = df_dev.loc[val_idx][df_dev.loc[val_idx, "Delay_Flag"] == 1].copy()

        n_del_tr = len(df_tr_del)
        split_pt = int(0.80 * n_del_tr)

        df_subtr = df_tr_del.iloc[:split_pt]
        df_calib = df_tr_del.iloc[split_pt:]

        y_subtr = df_subtr["Delay_Days"].astype(float).to_numpy()
        y_calib = df_calib["Delay_Days"].astype(float).to_numpy()
        y_val = df_va_del["Delay_Days"].astype(float).to_numpy()

        X_subtr = df_subtr[num_cols + cat_cols].copy()
        X_calib = df_calib[num_cols + cat_cols].copy()
        X_val = df_va_del[num_cols + cat_cols].copy()

        for col in cat_cols:
            X_subtr[col] = X_subtr[col].fillna("Missing").astype("category")
            X_calib[col] = pd.Categorical(X_calib[col].fillna("Missing"), categories=X_subtr[col].cat.categories)
            X_val[col] = pd.Categorical(X_val[col].fillna("Missing"), categories=X_subtr[col].cat.categories)
        for col in num_cols:
            X_subtr[col] = pd.to_numeric(X_subtr[col], errors="coerce").fillna(0.0).astype(float)
            X_calib[col] = pd.to_numeric(X_calib[col], errors="coerce").fillna(0.0).astype(float)
            X_val[col] = pd.to_numeric(X_val[col], errors="coerce").fillna(0.0).astype(float)

        print(f"\n--- Fold {fold_id} (Sub-train Delayed: {len(X_subtr)}, Calib Delayed: {len(X_calib)}, Val Delayed: {len(X_val)}) ---")

        for cfg in coverage_configs:
            nom = cfg["nominal"]
            alpha = cfg["alpha"]
            q_lo = cfg["q_low"]
            q_hi = cfg["q_high"]

            # Train quantile models
            lgb_lo = lgb.LGBMRegressor(objective="quantile", alpha=q_lo, n_estimators=300, learning_rate=0.05, num_leaves=31, subsample=0.8, colsample_bytree=0.8, random_state=SEED, verbose=-1, n_jobs=-1)
            lgb_hi = lgb.LGBMRegressor(objective="quantile", alpha=q_hi, n_estimators=300, learning_rate=0.05, num_leaves=31, subsample=0.8, colsample_bytree=0.8, random_state=SEED, verbose=-1, n_jobs=-1)

            lgb_lo.fit(X_subtr, y_subtr)
            lgb_hi.fit(X_subtr, y_subtr)

            # Predictions on calibration set
            q_lo_cal = lgb_lo.predict(X_calib)
            q_hi_cal = lgb_hi.predict(X_calib)

            # Non-conformity scores: E_i = max(q_lo - y_i, y_i - q_hi)
            scores = np.maximum(q_lo_cal - y_calib, y_calib - q_hi_cal)
            n_cal = len(scores)

            # Finite sample corrected quantile level
            q_level = min(1.0, (1.0 - alpha) * (1.0 + 1.0 / n_cal))
            q_adjustment = float(np.quantile(scores, q_level, method="higher"))

            # Predictions on validation set
            q_lo_val = lgb_lo.predict(X_val) - q_adjustment
            q_hi_val = lgb_hi.predict(X_val) + q_adjustment

            # Empirical coverage
            covered = (y_val >= q_lo_val) & (y_val <= q_hi_val)
            emp_cov = float(np.mean(covered))
            n_covered = int(np.sum(covered))
            cov_error = emp_cov - nom

            widths = q_hi_val - q_lo_val
            mean_w = float(np.mean(widths))
            med_w = float(np.median(widths))

            ci_low, ci_high = exact_clopper_pearson_ci(n_covered, len(y_val), confidence=0.95)

            print(f"  Nominal: {nom*100:.0f}% | Empirical: {emp_cov*100:.1f}% ({n_covered}/{len(y_val)}) | 95% CI: [{ci_low*100:.1f}%, {ci_high*100:.1f}%] | Mean Width: {mean_w:.1f}d | Q: {q_adjustment:.2f}")

            conformal_results.append({
                "experiment_id": EXPERIMENT_ID,
                "git_commit": GIT_COMMIT,
                "data_sha256": CANONICAL_SHA256,
                "fold_id": fold_id,
                "nominal_coverage": nom,
                "empirical_coverage": emp_cov,
                "coverage_error": cov_error,
                "covered_count": n_covered,
                "sample_count": len(y_val),
                "exact_ci_95_low": ci_low,
                "exact_ci_95_high": ci_high,
                "mean_interval_width": mean_w,
                "median_interval_width": med_w,
                "q_adjustment": q_adjustment,
                "calib_sample_count": n_cal,
            })

    df_conf = pd.DataFrame(conformal_results)
    conf_csv = metrics_dir / "conformal_results.csv"
    df_conf.to_csv(conf_csv, index=False)
    print(f"\nSaved conformal results to {conf_csv}")

    # Summary
    summary_conf = df_conf.groupby("nominal_coverage").agg({
        "empirical_coverage": ["mean", "std"],
        "coverage_error": ["mean", "std"],
        "mean_interval_width": ["mean", "std"],
        "median_interval_width": ["mean", "std"],
        "q_adjustment": ["mean", "std"],
        "sample_count": ["sum"],
    }).reset_index()
    summary_conf.columns = ["_".join(c).strip("_") for c in summary_conf.columns]
    summary_csv = tables_dir / "conformal_summary.csv"
    summary_conf.to_csv(summary_csv, index=False)
    print(f"Saved conformal summary to {summary_csv}")
    print("\n" + summary_conf.to_string(index=False))

    # Figure: Coverage vs. Width Tradeoff
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4.5))

    noms = df_conf["nominal_coverage"].unique()
    emp_means = [df_conf[df_conf["nominal_coverage"] == n]["empirical_coverage"].mean() for n in noms]
    emp_stds = [df_conf[df_conf["nominal_coverage"] == n]["empirical_coverage"].std() for n in noms]
    width_means = [df_conf[df_conf["nominal_coverage"] == n]["mean_interval_width"].mean() for n in noms]
    width_stds = [df_conf[df_conf["nominal_coverage"] == n]["mean_interval_width"].std() for n in noms]

    # Panel 1: Nominal vs Empirical Coverage
    ax1.plot([0.75, 1.0], [0.75, 1.0], "k--", label="Target Calibration (y = x)")
    ax1.errorbar(noms, emp_means, yerr=emp_stds, fmt="o-", color="tab:blue", ecolor="tab:blue", capsize=5, linewidth=2, markersize=8, label="Empirical Mean ± 1 SD")
    ax1.set_xlabel("Nominal Coverage Level", fontsize=11, fontweight="bold")
    ax1.set_ylabel("Empirical Coverage Rate", fontsize=11, fontweight="bold")
    ax1.set_title("CQR Empirical Coverage vs. Nominal Level", fontsize=12, fontweight="bold")
    ax1.set_xlim([0.75, 1.0])
    ax1.set_ylim([0.75, 1.0])
    ax1.grid(True, alpha=0.3)
    ax1.legend(loc="upper left", frameon=True)

    # Panel 2: Mean Interval Width vs Nominal Coverage (Sharpness)
    ax2.errorbar(noms, width_means, yerr=width_stds, fmt="s-", color="tab:purple", ecolor="tab:purple", capsize=5, linewidth=2, markersize=8, label="Mean Interval Width ± 1 SD")
    ax2.set_xlabel("Nominal Coverage Level", fontsize=11, fontweight="bold")
    ax2.set_ylabel("Interval Width (Days)", fontsize=11, fontweight="bold")
    ax2.set_title("Interval Sharpness vs. Coverage Level", fontsize=12, fontweight="bold")
    ax2.grid(True, alpha=0.3)
    ax2.legend(loc="upper left", frameon=True)

    plt.tight_layout()
    fig_path = figures_dir / "coverage_vs_width.png"
    plt.savefig(fig_path, dpi=300)
    plt.close()
    print(f"Saved Coverage vs. Width figure to {fig_path}")

if __name__ == "__main__":
    run_conformal_experiments()
