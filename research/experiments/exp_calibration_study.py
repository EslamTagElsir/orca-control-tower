"""Phase 2 Experiment: Probability Calibration Study & Reliability Curves."""

import hashlib
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Tuple
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    roc_auc_score,
    brier_score_loss,
)
import catboost as cb
import lightgbm as lgb

import sys
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))
from research.scripts.data_utils import get_development_data, get_feature_columns, get_temporal_folds, CANONICAL_SHA256

EXPERIMENT_ID = "EXP_02_PROBABILITY_CALIBRATION"
GIT_COMMIT = "6f71396ac38466c9d18e2706bea8688d9c2ea8ac"
SEED = 42

def compute_ece(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10) -> Tuple[float, np.ndarray, np.ndarray, np.ndarray]:
    """
    Compute Expected Calibration Error (ECE) using uniform binning.
    Documented behavior:
    - Bins: n_bins uniform partitions of [0, 1].
    - Empty bins: weight = 0, error = 0.
    """
    bin_edges = np.linspace(0.0, 1.0, n_bins + 1)
    bin_indices = np.digitize(y_prob, bin_edges[1:-1])  # 0 to n_bins-1

    ece = 0.0
    bin_confs = []
    bin_accs = []
    bin_counts = []

    for b in range(n_bins):
        mask = bin_indices == b
        count = np.sum(mask)
        bin_counts.append(count)
        if count > 0:
            avg_conf = np.mean(y_prob[mask])
            avg_acc = np.mean(y_true[mask])
            bin_confs.append(avg_conf)
            bin_accs.append(avg_acc)
            ece += (count / len(y_true)) * np.abs(avg_acc - avg_conf)
        else:
            bin_confs.append(np.nan)
            bin_accs.append(np.nan)

    return float(ece), np.array(bin_confs), np.array(bin_accs), np.array(bin_counts)

def run_calibration_experiments():
    print(f"[{datetime.now().isoformat()}] Starting Probability Calibration Study...")
    df_dev = get_development_data()
    num_cols, cat_cols = get_feature_columns()
    folds = get_temporal_folds(df_dev)

    metrics_dir = REPO_ROOT / "research" / "outputs" / "metrics"
    tables_dir = REPO_ROOT / "research" / "outputs" / "tables"
    figures_dir = REPO_ROOT / "research" / "outputs" / "figures"
    metrics_dir.mkdir(parents=True, exist_ok=True)
    tables_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)

    calib_results = []
    plot_data = {"CatBoost": {"uncalibrated": [], "platt": [], "isotonic": []}}

    for fold in folds:
        fold_id = fold["fold_id"]
        train_idx = fold["train_idx"]
        val_idx = fold["val_idx"]

        # Temporal split of train into sub-train (80%) and calib buffer (20%)
        df_train_full = df_dev.loc[train_idx].copy().sort_values("T_pred")
        n_train_full = len(df_train_full)
        split_point = int(0.80 * n_train_full)

        df_subtrain = df_train_full.iloc[:split_point]
        df_calib = df_train_full.iloc[split_point:]
        df_val = df_dev.loc[val_idx].copy()

        y_subtrain = df_subtrain["Delay_Flag"].astype(int).to_numpy()
        y_calib = df_calib["Delay_Flag"].astype(int).to_numpy()
        y_val = df_val["Delay_Flag"].astype(int).to_numpy()

        # Sanitize columns
        X_subtr = df_subtrain[num_cols + cat_cols].copy()
        X_cal = df_calib[num_cols + cat_cols].copy()
        X_va = df_val[num_cols + cat_cols].copy()

        for col in cat_cols:
            X_subtr[col] = X_subtr[col].fillna("Missing").astype(str)
            X_cal[col] = X_cal[col].fillna("Missing").astype(str)
            X_va[col] = X_va[col].fillna("Missing").astype(str)
        for col in num_cols:
            X_subtr[col] = pd.to_numeric(X_subtr[col], errors="coerce").fillna(0.0).astype(float)
            X_cal[col] = pd.to_numeric(X_cal[col], errors="coerce").fillna(0.0).astype(float)
            X_va[col] = pd.to_numeric(X_va[col], errors="coerce").fillna(0.0).astype(float)

        print(f"\n--- Fold {fold_id} (Sub-train: {len(X_subtr)}, Calib: {len(X_cal)}, Val: {len(X_va)}) ---")

        # 1. Fit Base CatBoost Classifier on Sub-train
        clf_cb = cb.CatBoostClassifier(
            iterations=300,
            learning_rate=0.05,
            depth=6,
            auto_class_weights="Balanced",
            cat_features=cat_cols,
            random_seed=SEED,
            verbose=0,
            thread_count=-1,
        )
        clf_cb.fit(X_subtr, y_subtrain)

        # Raw probabilities
        p_cal_raw = clf_cb.predict_proba(X_cal)[:, 1]
        p_val_raw = clf_cb.predict_proba(X_va)[:, 1]

        # 2. Fit Platt / Sigmoid Scaling on Calib
        lr_platt = LogisticRegression(C=1.0, solver="lbfgs")
        lr_platt.fit(p_cal_raw.reshape(-1, 1), y_calib)
        p_val_platt = lr_platt.predict_proba(p_val_raw.reshape(-1, 1))[:, 1]

        # 3. Fit Isotonic Regression on Calib
        iso = IsotonicRegression(out_of_bounds="clip")
        iso.fit(p_cal_raw, y_calib)
        p_val_iso = iso.predict(p_val_raw)

        methods = {
            "uncalibrated": p_val_raw,
            "platt_scaling": p_val_platt,
            "isotonic_regression": p_val_iso,
        }

        for method_name, p_pred in methods.items():
            ece_val, _, _, _ = compute_ece(y_val, p_pred, n_bins=10)
            brier = float(brier_score_loss(y_val, p_pred))
            pr_auc = float(average_precision_score(y_val, p_pred))
            roc_auc = float(roc_auc_score(y_val, p_pred))

            print(f"  {method_name:<22} | Brier: {brier:.4f} | ECE: {ece_val:.4f} | PR-AUC: {pr_auc:.4f} | ROC-AUC: {roc_auc:.4f}")

            calib_results.append({
                "experiment_id": EXPERIMENT_ID,
                "git_commit": GIT_COMMIT,
                "data_sha256": CANONICAL_SHA256,
                "fold_id": fold_id,
                "model": "CatBoost",
                "calibration_method": method_name,
                "calib_rows": len(X_cal),
                "val_rows": len(X_va),
                "val_positive_rows": int(y_val.sum()),
                "brier_score": brier,
                "expected_calibration_error": ece_val,
                "pr_auc": pr_auc,
                "roc_auc": roc_auc,
            })

            if fold_id == 4:  # Save predictions on most mature fold for figure
                plot_data["CatBoost"][method_name.replace("_scaling", "").replace("_regression", "")] = (y_val, p_pred)

    df_calib_results = pd.DataFrame(calib_results)
    calib_csv = metrics_dir / "calibration_results.csv"
    df_calib_results.to_csv(calib_csv, index=False)
    print(f"\nSaved calibration results to {calib_csv}")

    # Summary
    summary_calib = df_calib_results.groupby(["model", "calibration_method"]).agg({
        "brier_score": ["mean", "std"],
        "expected_calibration_error": ["mean", "std"],
        "pr_auc": ["mean", "std"],
        "roc_auc": ["mean", "std"],
    }).reset_index()
    summary_calib.columns = ["_".join(c).strip("_") for c in summary_calib.columns]
    summary_csv = tables_dir / "calibration_summary.csv"
    summary_calib.to_csv(summary_csv, index=False)
    print(f"Saved calibration summary to {summary_csv}")
    print("\n" + summary_calib.to_string(index=False))

    # Produce Reliability Curves Figure for Fold 4
    fig, axes = plt.subplots(1, 3, figsize=(15, 4.5), sharey=True)
    method_keys = [("uncalibrated", "Raw Uncalibrated", "blue"), ("platt", "Platt / Sigmoid", "green"), ("isotonic", "Isotonic Regression", "purple")]

    for idx, (m_key, m_label, color) in enumerate(method_keys):
        y_v, p_v = plot_data["CatBoost"][m_key]
        fraction_of_positives, mean_predicted_value = calibration_curve(y_v, p_v, n_bins=10, strategy="uniform")
        ece_val, _, _, _ = compute_ece(y_v, p_v, n_bins=10)

        ax = axes[idx]
        ax.plot([0, 1], [0, 1], "k--", label="Perfect Calibration")
        ax.plot(mean_predicted_value, fraction_of_positives, "s-", color=color, label=f"{m_label}\nECE = {ece_val:.3f}")
        ax.set_xlabel("Mean Predicted Probability", fontsize=11)
        if idx == 0:
            ax.set_ylabel("Fraction of Delayed Shipments", fontsize=11)
        ax.set_title(m_label, fontsize=12, fontweight="bold")
        ax.set_xlim([0.0, 1.0])
        ax.set_ylim([0.0, 1.0])
        ax.grid(True, alpha=0.3)
        ax.legend(loc="upper left", frameon=True)

    plt.suptitle("Reliability Diagrams Across Calibration Methods (Temporal Fold 4)", fontsize=13, fontweight="bold", y=1.02)
    plt.tight_layout()
    fig_path = figures_dir / "calibration_reliability_catboost.png"
    plt.savefig(fig_path, dpi=300, bbox_inches="tight")
    plt.close()
    print(f"Saved reliability diagram figure to {fig_path}")

if __name__ == "__main__":
    run_calibration_experiments()
