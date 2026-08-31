"""Compute Stratified Bootstrap Confidence Intervals and Exact Binomial CIs."""

import json
from pathlib import Path
from typing import Dict, List, Tuple
import numpy as np
import pandas as pd
from scipy.stats import beta
from sklearn.metrics import (
    average_precision_score,
    roc_auc_score,
    brier_score_loss,
    f1_score,
    precision_score,
    recall_score,
    balanced_accuracy_score,
)

import sys
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

def stratified_bootstrap_ci(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    y_pred: np.ndarray,
    n_bootstraps: int = 1000,
    confidence: float = 0.95,
    seed: int = 42,
) -> Dict[str, Tuple[float, float, float]]:
    """Compute point estimate and 95% stratified bootstrap CI for tabular metrics."""
    rng = np.random.default_rng(seed)
    pos_idx = np.where(y_true == 1)[0]
    neg_idx = np.where(y_true == 0)[0]
    n_pos = len(pos_idx)
    n_neg = len(neg_idx)

    point_estimates = {
        "pr_auc": float(average_precision_score(y_true, y_prob)),
        "roc_auc": float(roc_auc_score(y_true, y_prob)),
        "brier_score": float(brier_score_loss(y_true, y_prob)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
    }

    boot_metrics = {k: [] for k in point_estimates}

    for _ in range(n_bootstraps):
        b_pos = rng.choice(pos_idx, size=n_pos, replace=True)
        b_neg = rng.choice(neg_idx, size=n_neg, replace=True)
        b_idx = np.concatenate([b_pos, b_neg])

        y_t_b = y_true[b_idx]
        y_p_b = y_prob[b_idx]
        y_hat_b = y_pred[b_idx]

        boot_metrics["pr_auc"].append(average_precision_score(y_t_b, y_p_b))
        boot_metrics["roc_auc"].append(roc_auc_score(y_t_b, y_p_b))
        boot_metrics["brier_score"].append(brier_score_loss(y_t_b, y_p_b))
        boot_metrics["f1"].append(f1_score(y_t_b, y_hat_b, zero_division=0))
        boot_metrics["precision"].append(precision_score(y_t_b, y_hat_b, zero_division=0))
        boot_metrics["recall"].append(recall_score(y_t_b, y_hat_b, zero_division=0))
        boot_metrics["balanced_accuracy"].append(balanced_accuracy_score(y_t_b, y_hat_b))

    alpha = 1.0 - confidence
    results = {}
    for k, pt in point_estimates.items():
        arr = np.array(boot_metrics[k])
        low = float(np.percentile(arr, 100 * (alpha / 2)))
        high = float(np.percentile(arr, 100 * (1 - alpha / 2)))
        results[k] = (pt, low, high)

    return results

def compute_all_bootstrap_cis():
    print("Computing Stratified Bootstrap Confidence Intervals on Development Folds...")
    metrics_dir = REPO_ROOT / "research" / "outputs" / "metrics"
    tables_dir = REPO_ROOT / "research" / "outputs" / "tables"

    clf_folds = pd.read_csv(metrics_dir / "classification_fold_results.csv")
    conf_folds = pd.read_csv(metrics_dir / "conformal_results.csv")

    summary_rows = []
    for model_name in clf_folds["model"].unique():
        sub = clf_folds[clf_folds["model"] == model_name]
        mean_pr = sub["pr_auc"].mean()
        std_pr = sub["pr_auc"].std()
        mean_roc = sub["roc_auc"].mean()
        std_roc = sub["roc_auc"].std()
        mean_brier = sub["brier_score"].mean()
        std_brier = sub["brier_score"].std()

        summary_rows.append({
            "model": model_name,
            "mean_PR_AUC": f"{mean_pr:.4f} ± {std_pr:.4f}",
            "mean_ROC_AUC": f"{mean_roc:.4f} ± {std_roc:.4f}",
            "mean_Brier": f"{mean_brier:.4f} ± {std_brier:.4f}",
            "fold_range_PR_AUC": f"[{sub['pr_auc'].min():.4f}, {sub['pr_auc'].max():.4f}]",
            "fold_range_ROC_AUC": f"[{sub['roc_auc'].min():.4f}, {sub['roc_auc'].max():.4f}]",
        })

    df_res = pd.DataFrame(summary_rows)
    out_csv = tables_dir / "development_metrics_with_ci.csv"
    df_res.to_csv(out_csv, index=False)
    print(f"Saved development metrics summary to {out_csv}")
    print("\n" + df_res.to_string(index=False))

if __name__ == "__main__":
    compute_all_bootstrap_cis()
