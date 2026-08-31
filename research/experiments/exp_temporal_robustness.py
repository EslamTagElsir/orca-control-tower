"""Phase 2 Experiment: Temporal Robustness & Distribution Shift Stability Analysis."""

from datetime import datetime
from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import sys
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

def run_temporal_robustness_analysis():
    print(f"[{datetime.now().isoformat()}] Generating Temporal Robustness Analysis & Visualizations...")
    metrics_dir = REPO_ROOT / "research" / "outputs" / "metrics"
    tables_dir = REPO_ROOT / "research" / "outputs" / "tables"
    figures_dir = REPO_ROOT / "research" / "outputs" / "figures"

    # Load classification fold results and calibration fold results
    clf_folds = pd.read_csv(metrics_dir / "classification_fold_results.csv")
    calib_folds = pd.read_csv(metrics_dir / "calibration_results.csv")
    manifest = pd.read_csv(metrics_dir / "temporal_fold_manifest.csv")

    cb_clf = clf_folds[clf_folds["model"] == "CatBoost"].copy().sort_values("fold_id")
    cb_cal = calib_folds[(calib_folds["model"] == "CatBoost") & (calib_folds["calibration_method"] == "isotonic_regression")].copy().sort_values("fold_id")

    stability_rows = []
    for i, row in manifest.iterrows():
        f_id = int(row["fold_id"])
        c_row = cb_clf[cb_clf["fold_id"] == f_id].iloc[0]
        cal_row = cb_cal[cb_cal["fold_id"] == f_id].iloc[0] if not cb_cal[cb_cal["fold_id"] == f_id].empty else None

        stability_rows.append({
            "fold_id": f_id,
            "validation_window": f"{row['validation_start']} to {row['validation_end']}",
            "train_size": row["train_rows"],
            "val_size": row["validation_rows"],
            "val_delay_prevalence": row["validation_positive_rows"] / row["validation_rows"],
            "raw_PR_AUC": c_row["pr_auc"],
            "raw_ROC_AUC": c_row["roc_auc"],
            "raw_Brier": c_row["brier_score"],
            "calibrated_Brier": cal_row["brier_score"] if cal_row is not None else np.nan,
            "calibrated_ECE": cal_row["expected_calibration_error"] if cal_row is not None else np.nan,
        })

    df_stability = pd.DataFrame(stability_rows)
    stab_csv = tables_dir / "temporal_stability_summary.csv"
    df_stability.to_csv(stab_csv, index=False)
    print(f"Saved temporal stability summary to {stab_csv}")
    print("\n" + df_stability.to_string(index=False))

    # Figure 1: PR-AUC & Prevalence over Temporal Folds
    fig, ax1 = plt.subplots(figsize=(8, 4.5))
    folds_x = [f"Fold {int(r['fold_id'])}\n({r['validation_window'][:7]})" for _, r in df_stability.iterrows()]

    color = "tab:blue"
    ax1.set_xlabel("Expanding Validation Window", fontsize=11, fontweight="bold")
    ax1.set_ylabel("PR-AUC (CatBoost)", color=color, fontsize=11, fontweight="bold")
    ax1.plot(folds_x, df_stability["raw_PR_AUC"], "o-", color=color, linewidth=2.5, markersize=8, label="PR-AUC")
    ax1.tick_params(axis="y", labelcolor=color)
    ax1.set_ylim([0.0, 0.65])
    ax1.grid(True, alpha=0.3)

    ax2 = ax1.twinx()
    color = "tab:red"
    ax2.set_ylabel("Validation Delay Prevalence", color=color, fontsize=11, fontweight="bold")
    ax2.plot(folds_x, df_stability["val_delay_prevalence"], "s--", color=color, linewidth=2, markersize=7, label="Delay Prevalence")
    ax2.tick_params(axis="y", labelcolor=color)
    ax2.set_ylim([0.0, 0.35])

    plt.title("CatBoost Discrimination vs. Temporal Delay Prevalence Shift", fontsize=12, fontweight="bold")
    plt.tight_layout()
    fig1_path = figures_dir / "temporal_pr_auc.png"
    plt.savefig(fig1_path, dpi=300)
    plt.close()
    print(f"Saved PR-AUC temporal plot to {fig1_path}")

    # Figure 2: Brier Score (Raw vs Calibrated) over Temporal Folds
    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.plot(folds_x, df_stability["raw_Brier"], "o-", color="tab:orange", linewidth=2.5, markersize=8, label="Raw CatBoost Brier")
    ax.plot(folds_x, df_stability["calibrated_Brier"], "s-", color="tab:purple", linewidth=2.5, markersize=8, label="Isotonic Calibrated Brier")
    ax.set_xlabel("Expanding Validation Window", fontsize=11, fontweight="bold")
    ax.set_ylabel("Brier Score (Lower is Better)", fontsize=11, fontweight="bold")
    ax.set_title("Probability Brier Score Across Expanding Temporal Folds", fontsize=12, fontweight="bold")
    ax.grid(True, alpha=0.3)
    ax.legend(loc="upper right", frameon=True)
    plt.tight_layout()
    fig2_path = figures_dir / "temporal_brier.png"
    plt.savefig(fig2_path, dpi=300)
    plt.close()
    print(f"Saved Brier temporal plot to {fig2_path}")

if __name__ == "__main__":
    run_temporal_robustness_analysis()
