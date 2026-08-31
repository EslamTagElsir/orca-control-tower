"""ORCA Research Track: Locked Registry Benchmark Execution (Single One-Pass Evaluation)."""

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
from sklearn.calibration import calibration_curve
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    median_absolute_error,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
import catboost as cb
import lightgbm as lgb

import sys
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))
from research.scripts.data_utils import (
    CANONICAL_DATA_PATH,
    CANONICAL_SHA256,
    get_feature_columns,
    load_and_verify_features,
)
from research.experiments.exp_calibration_study import compute_ece
from research.experiments.exp_conformal_uncertainty import exact_clopper_pearson_ci

EXPERIMENT_ID = "EXP_LOCKED_REGISTRY_BENCHMARK_FINAL"
GIT_COMMIT = "6f71396ac38466c9d18e2706bea8688d9c2ea8ac"
SEED = 42

def compute_pinball_loss(y_true: np.ndarray, y_pred: np.ndarray, alpha: float) -> float:
    """Compute quantile pinball loss for target quantile alpha."""
    residual = y_true - y_pred
    loss = np.maximum(alpha * residual, (alpha - 1.0) * residual)
    return float(np.mean(loss))

def run_benchmark():
    start_time = datetime.now()
    print(f"[{start_time.isoformat()}] Starting ORCA Locked Registry Benchmark Execution...")

    # Verification of Cohort and Feature Extraction
    df_all = load_and_verify_features()
    num_cols, cat_cols = get_feature_columns()

    t_pred = pd.to_datetime(df_all["T_pred"])

    # Development Splits (Train: < 2013-11-27; Calib: 2014-02-25 to 2014-08-24)
    mask_tr = t_pred < "2013-11-27"
    mask_cal = (t_pred >= "2014-02-25") & (t_pred < "2014-08-24")
    mask_reg = (t_pred >= "2014-08-24") & (t_pred <= "2015-08-24")

    df_tr = df_all[mask_tr].copy()
    df_cal = df_all[mask_cal].copy()
    df_reg = df_all[mask_reg].copy()

    n_reg = len(df_reg)
    n_reg_del = int(df_reg["Delay_Flag"].sum())

    print(f"Dataset Cohorts:\n  Train: {len(df_tr)} rows ({int(df_tr['Delay_Flag'].sum())} delayed)")
    print(f"  Calibration: {len(df_cal)} rows ({int(df_cal['Delay_Flag'].sum())} delayed)")
    print(f"  Locked Registry: {n_reg} rows ({n_reg_del} delayed)")

    # Strict cohort assertion
    if n_reg != 1013 or n_reg_del != 61:
        raise ValueError(f"LOCKED REGISTRY COHORT MISMATCH! Expected 1013 rows and 61 delayed, got {n_reg} rows and {n_reg_del} delayed.")

    # Target arrays
    y_tr = df_tr["Delay_Flag"].astype(int).to_numpy()
    y_cal = df_cal["Delay_Flag"].astype(int).to_numpy()
    y_reg = df_reg["Delay_Flag"].astype(int).to_numpy()
    y_reg_days = df_reg["Delay_Days"].astype(float).fillna(0.0).to_numpy()

    # Preprocessing DataFrames
    X_tr = df_tr[num_cols + cat_cols].copy()
    X_cal = df_cal[num_cols + cat_cols].copy()
    X_reg = df_reg[num_cols + cat_cols].copy()

    for col in cat_cols:
        X_tr[col] = X_tr[col].fillna("Missing").astype(str)
        X_cal[col] = X_cal[col].fillna("Missing").astype(str)
        X_reg[col] = X_reg[col].fillna("Missing").astype(str)
    for col in num_cols:
        X_tr[col] = pd.to_numeric(X_tr[col], errors="coerce").fillna(0.0).astype(float)
        X_cal[col] = pd.to_numeric(X_cal[col], errors="coerce").fillna(0.0).astype(float)
        X_reg[col] = pd.to_numeric(X_reg[col], errors="coerce").fillna(0.0).astype(float)

    tables_dir = REPO_ROOT / "research" / "outputs" / "tables"
    figures_dir = REPO_ROOT / "research" / "outputs" / "figures"
    metrics_dir = REPO_ROOT / "research" / "outputs" / "metrics"
    tables_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)
    metrics_dir.mkdir(parents=True, exist_ok=True)

    # =========================================================================
    # STEP 1: CLASSIFICATION BENCHMARK
    # =========================================================================
    print("\n--- Step 1: Classification Benchmark ---")
    
    # 1. CatBoost Classifier (Primary Model)
    cb_clf = cb.CatBoostClassifier(
        iterations=300,
        learning_rate=0.05,
        depth=6,
        auto_class_weights="Balanced",
        cat_features=cat_cols,
        random_seed=SEED,
        verbose=0,
        thread_count=-1,
    )
    cb_clf.fit(X_tr, y_tr)
    p_cb_cal_raw = cb_clf.predict_proba(X_cal)[:, 1]
    p_cb_reg_raw = cb_clf.predict_proba(X_reg)[:, 1]

    # Platt calibrator for CatBoost
    lr_cb_platt = LogisticRegression(C=1.0, solver="lbfgs")
    lr_cb_platt.fit(p_cb_cal_raw.reshape(-1, 1), y_cal)
    p_cb_reg_platt = lr_cb_platt.predict_proba(p_cb_reg_raw.reshape(-1, 1))[:, 1]

    # Isotonic calibrator for CatBoost
    iso_cb = IsotonicRegression(out_of_bounds="clip")
    iso_cb.fit(p_cb_cal_raw, y_cal)
    p_cb_reg_iso = iso_cb.predict(p_cb_reg_raw)

    # 2. Random Forest Classifier (Sensitivity Comparator)
    rf_prep = ColumnTransformer(
        transformers=[
            ("num", Pipeline([("imp", SimpleImputer(strategy="median"))]), num_cols),
            ("cat", Pipeline([("ohe", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), cat_cols),
        ]
    )
    clf_rf = Pipeline([
        ("prep", rf_prep),
        ("clf", RandomForestClassifier(n_estimators=300, max_depth=8, min_samples_leaf=5, class_weight="balanced_subsample", random_state=SEED, n_jobs=-1)),
    ])
    clf_rf.fit(X_tr, y_tr)
    p_rf_cal_raw = clf_rf.predict_proba(X_cal)[:, 1]
    p_rf_reg_raw = clf_rf.predict_proba(X_reg)[:, 1]

    # Platt calibrator for Random Forest
    lr_rf_platt = LogisticRegression(C=1.0, solver="lbfgs")
    lr_rf_platt.fit(p_rf_cal_raw.reshape(-1, 1), y_cal)
    p_rf_reg_platt = lr_rf_platt.predict_proba(p_rf_reg_raw.reshape(-1, 1))[:, 1]

    # Isotonic calibrator for Random Forest
    iso_rf = IsotonicRegression(out_of_bounds="clip")
    iso_rf.fit(p_rf_cal_raw, y_cal)
    p_rf_reg_iso = iso_rf.predict(p_rf_reg_raw)

    # Classification Metrics evaluated at Frozen Thresholds
    tau_cb = 0.1000
    tau_rf = 0.1050

    pred_cb = (p_cb_reg_platt >= tau_cb).astype(int)
    pred_rf = (p_rf_reg_platt >= tau_rf).astype(int)

    ece_cb_platt, _, _, _ = compute_ece(y_reg, p_cb_reg_platt, n_bins=10)
    ece_rf_platt, _, _, _ = compute_ece(y_reg, p_rf_reg_platt, n_bins=10)

    classification_rows = [
        {
            "model": "CatBoost",
            "evidence_role": "Deployment-Aligned Primary Model",
            "calibration": "Platt / Sigmoid",
            "frozen_threshold": tau_cb,
            "pr_auc": float(average_precision_score(y_reg, p_cb_reg_platt)),
            "roc_auc": float(roc_auc_score(y_reg, p_cb_reg_platt)),
            "brier_score": float(brier_score_loss(y_reg, p_cb_reg_platt)),
            "ece_10bins": ece_cb_platt,
            "precision": float(precision_score(y_reg, pred_cb, zero_division=0)),
            "recall": float(recall_score(y_reg, pred_cb, zero_division=0)),
            "f1_score": float(f1_score(y_reg, pred_cb, zero_division=0)),
            "balanced_accuracy": float(balanced_accuracy_score(y_reg, pred_cb)),
            "positive_prevalence": float(np.mean(y_reg)),
            "pred_prob_mean": float(np.mean(p_cb_reg_platt)),
            "pred_prob_median": float(np.median(p_cb_reg_platt)),
            "pred_positive_rate": float(np.mean(pred_cb)),
        },
        {
            "model": "Random Forest",
            "evidence_role": "Development PR-AUC Sensitivity Comparator",
            "calibration": "Platt / Sigmoid",
            "frozen_threshold": tau_rf,
            "pr_auc": float(average_precision_score(y_reg, p_rf_reg_platt)),
            "roc_auc": float(roc_auc_score(y_reg, p_rf_reg_platt)),
            "brier_score": float(brier_score_loss(y_reg, p_rf_reg_platt)),
            "ece_10bins": ece_rf_platt,
            "precision": float(precision_score(y_reg, pred_rf, zero_division=0)),
            "recall": float(recall_score(y_reg, pred_rf, zero_division=0)),
            "f1_score": float(f1_score(y_reg, pred_rf, zero_division=0)),
            "balanced_accuracy": float(balanced_accuracy_score(y_reg, pred_rf)),
            "positive_prevalence": float(np.mean(y_reg)),
            "pred_prob_mean": float(np.mean(p_rf_reg_platt)),
            "pred_prob_median": float(np.median(p_rf_reg_platt)),
            "pred_positive_rate": float(np.mean(pred_rf)),
        },
    ]

    df_class_bench = pd.DataFrame(classification_rows)
    class_csv = tables_dir / "locked_registry_classification.csv"
    df_class_bench.to_csv(class_csv, index=False)
    print(f"Saved classification benchmark to {class_csv}")
    print(df_class_bench[["model", "pr_auc", "roc_auc", "brier_score", "ece_10bins", "precision", "recall", "f1_score"]].to_string(index=False))

    # =========================================================================
    # STEP 2: CALIBRATION BENCHMARK
    # =========================================================================
    print("\n--- Step 2: Calibration Benchmark ---")
    calib_rows = []
    calib_variants = [
        ("CatBoost", "Raw", p_cb_reg_raw),
        ("CatBoost", "Platt / Sigmoid", p_cb_reg_platt),
        ("CatBoost", "Isotonic", p_cb_reg_iso),
        ("Random Forest", "Raw", p_rf_reg_raw),
        ("Random Forest", "Platt / Sigmoid", p_rf_reg_platt),
        ("Random Forest", "Isotonic", p_rf_reg_iso),
    ]

    for model_name, cal_name, p_arr in calib_variants:
        ece_val, _, _, _ = compute_ece(y_reg, p_arr, n_bins=10)
        calib_rows.append({
            "model": model_name,
            "calibration_method": cal_name,
            "brier_score": float(brier_score_loss(y_reg, p_arr)),
            "ece_10bins": ece_val,
            "pr_auc": float(average_precision_score(y_reg, p_arr)),
            "roc_auc": float(roc_auc_score(y_reg, p_arr)),
        })

    df_calib_bench = pd.DataFrame(calib_rows)
    calib_csv = tables_dir / "locked_registry_calibration.csv"
    df_calib_bench.to_csv(calib_csv, index=False)
    print(f"Saved calibration benchmark to {calib_csv}")
    print(df_calib_bench.to_string(index=False))

    # Reliability Figures
    # 1. CatBoost Reliability
    fig, axes = plt.subplots(1, 3, figsize=(15, 4.5), sharey=True)
    cb_plots = [("Raw", p_cb_reg_raw, "blue"), ("Platt / Sigmoid", p_cb_reg_platt, "green"), ("Isotonic", p_cb_reg_iso, "purple")]
    for idx, (m_label, p_arr, color) in enumerate(cb_plots):
        frac_pos, mean_pred = calibration_curve(y_reg, p_arr, n_bins=10, strategy="uniform")
        ece_v, _, _, _ = compute_ece(y_reg, p_arr, n_bins=10)
        ax = axes[idx]
        ax.plot([0, 1], [0, 1], "k--", label="Perfect Calibration")
        ax.plot(mean_pred, frac_pos, "s-", color=color, label=f"{m_label}\nECE = {ece_v:.3f}")
        ax.set_xlabel("Mean Predicted Probability", fontsize=11)
        if idx == 0:
            ax.set_ylabel("Fraction of Delayed Shipments", fontsize=11)
        ax.set_title(f"CatBoost: {m_label}", fontsize=12, fontweight="bold")
        ax.set_xlim([0.0, 1.0])
        ax.set_ylim([0.0, 1.0])
        ax.grid(True, alpha=0.3)
        ax.legend(loc="upper left", frameon=True)
    plt.suptitle("CatBoost Reliability Diagrams (Locked Registry Evaluation Set)", fontsize=13, fontweight="bold", y=1.02)
    plt.tight_layout()
    fig_cb_cal = figures_dir / "locked_registry_calibration_catboost.png"
    plt.savefig(fig_cb_cal, dpi=300, bbox_inches="tight")
    plt.close()

    # 2. Random Forest Reliability
    fig, axes = plt.subplots(1, 3, figsize=(15, 4.5), sharey=True)
    rf_plots = [("Raw", p_rf_reg_raw, "blue"), ("Platt / Sigmoid", p_rf_reg_platt, "green"), ("Isotonic", p_rf_reg_iso, "purple")]
    for idx, (m_label, p_arr, color) in enumerate(rf_plots):
        frac_pos, mean_pred = calibration_curve(y_reg, p_arr, n_bins=10, strategy="uniform")
        ece_v, _, _, _ = compute_ece(y_reg, p_arr, n_bins=10)
        ax = axes[idx]
        ax.plot([0, 1], [0, 1], "k--", label="Perfect Calibration")
        ax.plot(mean_pred, frac_pos, "s-", color=color, label=f"{m_label}\nECE = {ece_v:.3f}")
        ax.set_xlabel("Mean Predicted Probability", fontsize=11)
        if idx == 0:
            ax.set_ylabel("Fraction of Delayed Shipments", fontsize=11)
        ax.set_title(f"Random Forest: {m_label}", fontsize=12, fontweight="bold")
        ax.set_xlim([0.0, 1.0])
        ax.set_ylim([0.0, 1.0])
        ax.grid(True, alpha=0.3)
        ax.legend(loc="upper left", frameon=True)
    plt.suptitle("Random Forest Reliability Diagrams (Locked Registry Evaluation Set)", fontsize=13, fontweight="bold", y=1.02)
    plt.tight_layout()
    fig_rf_cal = figures_dir / "locked_registry_calibration_rf.png"
    plt.savefig(fig_rf_cal, dpi=300, bbox_inches="tight")
    plt.close()

    # =========================================================================
    # STEP 3: SEVERITY BENCHMARK (ON N=61 DELAYED SHIPMENTS ONLY)
    # =========================================================================
    print("\n--- Step 3: Severity Benchmark (N=61 Delayed Shipments Only) ---")
    del_mask_tr = y_tr == 1
    del_mask_cal = y_cal == 1
    del_mask_reg = y_reg == 1

    df_tr_del = df_tr[del_mask_tr].copy()
    df_cal_del = df_cal[del_mask_cal].copy()
    df_reg_del = df_reg[del_mask_reg].copy()

    y_tr_del = df_tr_del["Delay_Days"].astype(float).to_numpy()
    y_cal_del = df_cal_del["Delay_Days"].astype(float).to_numpy()
    y_reg_del = df_reg_del["Delay_Days"].astype(float).to_numpy()

    X_tr_del = df_tr_del[num_cols + cat_cols].copy()
    X_cal_del = df_cal_del[num_cols + cat_cols].copy()
    X_reg_del = df_reg_del[num_cols + cat_cols].copy()

    for col in cat_cols:
        X_tr_del[col] = X_tr_del[col].astype("category")
        X_cal_del[col] = pd.Categorical(X_cal_del[col], categories=X_tr_del[col].cat.categories)
        X_reg_del[col] = pd.Categorical(X_reg_del[col], categories=X_tr_del[col].cat.categories)

    # 1. Point Estimator: Conditional Median Baseline
    train_median_days = float(np.median(y_tr_del))
    pred_med = np.full_like(y_reg_del, fill_value=train_median_days)
    mae_med = float(mean_absolute_error(y_reg_del, pred_med))
    med_ae_med = float(median_absolute_error(y_reg_del, pred_med))

    # 2. LightGBM Quantile Regressors for all CQR quantiles
    quantiles_to_fit = [0.025, 0.05, 0.10, 0.50, 0.90, 0.95, 0.975]
    lgb_q_models = {}
    q_preds_reg = {}
    q_preds_cal = {}
    pinball_losses = {}

    for q in quantiles_to_fit:
        lgb_q = lgb.LGBMRegressor(
            objective="quantile",
            alpha=q,
            n_estimators=300,
            learning_rate=0.05,
            num_leaves=31,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=SEED,
            verbose=-1,
            n_jobs=-1,
        )
        lgb_q.fit(X_tr_del, y_tr_del)
        lgb_q_models[q] = lgb_q
        q_preds_reg[q] = lgb_q.predict(X_reg_del)
        q_preds_cal[q] = lgb_q.predict(X_cal_del)
        pinball_losses[q] = compute_pinball_loss(y_reg_del, q_preds_reg[q], q)

    mae_lgb_p50 = float(mean_absolute_error(y_reg_del, q_preds_reg[0.50]))
    med_ae_lgb_p50 = float(median_absolute_error(y_reg_del, q_preds_reg[0.50]))

    severity_rows = [
        {
            "model": "Conditional Median Baseline",
            "evidence_role": "Predeclared Primary Point Estimator",
            "eval_delayed_count": len(y_reg_del),
            "mae": mae_med,
            "median_ae": med_ae_med,
            "pinball_q025": np.nan,
            "pinball_q05": np.nan,
            "pinball_q10": np.nan,
            "pinball_q50": compute_pinball_loss(y_reg_del, pred_med, 0.50),
            "pinball_q90": np.nan,
            "pinball_q95": np.nan,
            "pinball_q975": np.nan,
        },
        {
            "model": "LightGBM Quantile Models",
            "evidence_role": "Asymmetric Quantile & CQR Estimator",
            "eval_delayed_count": len(y_reg_del),
            "mae": mae_lgb_p50,
            "median_ae": med_ae_lgb_p50,
            "pinball_q025": pinball_losses[0.025],
            "pinball_q05": pinball_losses[0.05],
            "pinball_q10": pinball_losses[0.10],
            "pinball_q50": pinball_losses[0.50],
            "pinball_q90": pinball_losses[0.90],
            "pinball_q95": pinball_losses[0.95],
            "pinball_q975": pinball_losses[0.975],
        },
    ]

    df_sev_bench = pd.DataFrame(severity_rows)
    sev_csv = tables_dir / "locked_registry_severity.csv"
    df_sev_bench.to_csv(sev_csv, index=False)
    print(f"Saved severity benchmark to {sev_csv}")
    print(df_sev_bench[["model", "mae", "median_ae", "pinball_q50", "pinball_q95"]].to_string(index=False))

    # =========================================================================
    # STEP 4: CONFORMAL UNCERTAINTY (CQR) BENCHMARK
    # =========================================================================
    print("\n--- Step 4: Conformal Uncertainty (CQR) Benchmark ---")
    cqr_configs = [
        {"nominal": 0.80, "alpha": 0.20, "q_lo": 0.10, "q_hi": 0.90},
        {"nominal": 0.90, "alpha": 0.10, "q_lo": 0.05, "q_hi": 0.95},
        {"nominal": 0.95, "alpha": 0.05, "q_lo": 0.025, "q_hi": 0.975},
    ]

    n_cal_del = len(y_cal_del)
    cqr_rows = []

    for cfg in cqr_configs:
        nom = cfg["nominal"]
        alpha = cfg["alpha"]
        q_l = cfg["q_lo"]
        q_h = cfg["q_hi"]

        # Conformal calibration on calibration delayed set
        scores_cal = np.maximum(q_preds_cal[q_l] - y_cal_del, y_cal_del - q_preds_cal[q_h])
        q_level = min(1.0, (1.0 - alpha) * (1.0 + 1.0 / n_cal_del))
        q_adj = float(np.quantile(scores_cal, q_level, method="higher"))

        # Predict adjusted interval bounds on registry delayed set
        low_bound = q_preds_reg[q_l] - q_adj
        high_bound = q_preds_reg[q_h] + q_adj

        covered = (y_reg_del >= low_bound) & (y_reg_del <= high_bound)
        n_covered = int(np.sum(covered))
        emp_cov = float(np.mean(covered))
        cov_err = emp_cov - nom

        ci_low, ci_high = exact_clopper_pearson_ci(n_covered, len(y_reg_del), confidence=0.95)
        widths = high_bound - low_bound

        cqr_rows.append({
            "nominal_coverage": nom,
            "covered_count": n_covered,
            "total_delayed_count": len(y_reg_del),
            "empirical_coverage": emp_cov,
            "coverage_error": cov_err,
            "exact_ci_95_low": ci_low,
            "exact_ci_95_high": ci_high,
            "mean_interval_width": float(np.mean(widths)),
            "median_interval_width": float(np.median(widths)),
            "min_interval_width": float(np.min(widths)),
            "max_interval_width": float(np.max(widths)),
            "conformal_adjustment_Q": q_adj,
            "calibration_delayed_count": n_cal_del,
        })

    df_cqr_bench = pd.DataFrame(cqr_rows)
    cqr_csv = tables_dir / "locked_registry_cqr.csv"
    df_cqr_bench.to_csv(cqr_csv, index=False)
    print(f"Saved CQR benchmark to {cqr_csv}")
    print(df_cqr_bench[["nominal_coverage", "covered_count", "total_delayed_count", "empirical_coverage", "coverage_error", "exact_ci_95_low", "exact_ci_95_high", "mean_interval_width", "conformal_adjustment_Q"]].to_string(index=False))

    # CQR Figure
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4.5))
    noms = df_cqr_bench["nominal_coverage"]
    ax1.plot([0.75, 1.0], [0.75, 1.0], "k--", label="Target Calibration (y = x)")
    ax1.errorbar(
        noms,
        df_cqr_bench["empirical_coverage"],
        yerr=[df_cqr_bench["empirical_coverage"] - df_cqr_bench["exact_ci_95_low"], df_cqr_bench["exact_ci_95_high"] - df_cqr_bench["empirical_coverage"]],
        fmt="o-",
        color="tab:blue",
        capsize=6,
        linewidth=2,
        markersize=8,
        label="Empirical Coverage (Exact 95% CI)",
    )
    ax1.set_xlabel("Nominal Coverage Level", fontsize=11, fontweight="bold")
    ax1.set_ylabel("Empirical Coverage Rate", fontsize=11, fontweight="bold")
    ax1.set_title("CQR Empirical Coverage (Locked Registry Set, N=61)", fontsize=12, fontweight="bold")
    ax1.set_xlim([0.75, 1.0])
    ax1.set_ylim([0.75, 1.05])
    ax1.grid(True, alpha=0.3)
    ax1.legend(loc="upper left", frameon=True)

    ax2.plot(noms, df_cqr_bench["mean_interval_width"], "s-", color="tab:purple", linewidth=2, markersize=8, label="Mean Interval Width")
    ax2.plot(noms, df_cqr_bench["median_interval_width"], "^--", color="tab:orange", linewidth=2, markersize=8, label="Median Interval Width")
    ax2.set_xlabel("Nominal Coverage Level", fontsize=11, fontweight="bold")
    ax2.set_ylabel("Interval Width (Days)", fontsize=11, fontweight="bold")
    ax2.set_title("Prediction Interval Sharpness (Days)", fontsize=12, fontweight="bold")
    ax2.grid(True, alpha=0.3)
    ax2.legend(loc="upper left", frameon=True)

    plt.tight_layout()
    fig_cqr_path = figures_dir / "locked_registry_coverage_vs_width.png"
    plt.savefig(fig_cqr_path, dpi=300)
    plt.close()

    # =========================================================================
    # STEP 5: TEMPORAL GENERALIZATION COMPARISON
    # =========================================================================
    print("\n--- Step 5: Temporal Generalization (Development Folds vs. Locked Registry) ---")
    dev_class = pd.read_csv(tables_dir / "classification_summary.csv")
    dev_cqr = pd.read_csv(tables_dir / "conformal_summary.csv")
    dev_sev = pd.read_csv(tables_dir / "severity_summary.csv")

    dev_cb = dev_class[dev_class["model"] == "CatBoost"].iloc[0]
    dev_cqr_90 = dev_cqr[dev_cqr["nominal_coverage"] == 0.90].iloc[0]
    dev_sev_med = dev_sev[dev_sev["model"] == "Conditional Median Baseline"].iloc[0]

    gen_rows = [
        {
            "metric": "CatBoost PR-AUC",
            "development_mean": dev_cb["mean_PR_AUC"],
            "development_std": dev_cb["std_PR_AUC"],
            "locked_registry_value": df_class_bench.loc[df_class_bench["model"] == "CatBoost", "pr_auc"].values[0],
            "delta_registry_minus_dev": df_class_bench.loc[df_class_bench["model"] == "CatBoost", "pr_auc"].values[0] - dev_cb["mean_PR_AUC"],
        },
        {
            "metric": "CatBoost ROC-AUC",
            "development_mean": dev_cb["mean_ROC_AUC"],
            "development_std": 0.0709,
            "locked_registry_value": df_class_bench.loc[df_class_bench["model"] == "CatBoost", "roc_auc"].values[0],
            "delta_registry_minus_dev": df_class_bench.loc[df_class_bench["model"] == "CatBoost", "roc_auc"].values[0] - dev_cb["mean_ROC_AUC"],
        },
        {
            "metric": "CatBoost Brier Score (Platt)",
            "development_mean": 0.1357,
            "development_std": 0.0556,
            "locked_registry_value": df_class_bench.loc[df_class_bench["model"] == "CatBoost", "brier_score"].values[0],
            "delta_registry_minus_dev": df_class_bench.loc[df_class_bench["model"] == "CatBoost", "brier_score"].values[0] - 0.1357,
        },
        {
            "metric": "CatBoost F1 Score (tau=0.1000)",
            "development_mean": 0.3786,  # Development OOF F1
            "development_std": np.nan,
            "locked_registry_value": df_class_bench.loc[df_class_bench["model"] == "CatBoost", "f1_score"].values[0],
            "delta_registry_minus_dev": df_class_bench.loc[df_class_bench["model"] == "CatBoost", "f1_score"].values[0] - 0.3786,
        },
        {
            "metric": "Conditional Median MAE",
            "development_mean": dev_sev_med["mae_mean"],
            "development_std": dev_sev_med["mae_std"],
            "locked_registry_value": df_sev_bench.loc[df_sev_bench["model"] == "Conditional Median Baseline", "mae"].values[0],
            "delta_registry_minus_dev": df_sev_bench.loc[df_sev_bench["model"] == "Conditional Median Baseline", "mae"].values[0] - dev_sev_med["mae_mean"],
        },
        {
            "metric": "CQR 90% Empirical Coverage",
            "development_mean": dev_cqr_90["empirical_coverage_mean"],
            "development_std": dev_cqr_90["empirical_coverage_std"],
            "locked_registry_value": df_cqr_bench.loc[df_cqr_bench["nominal_coverage"] == 0.90, "empirical_coverage"].values[0],
            "delta_registry_minus_dev": df_cqr_bench.loc[df_cqr_bench["nominal_coverage"] == 0.90, "empirical_coverage"].values[0] - dev_cqr_90["empirical_coverage_mean"],
        },
        {
            "metric": "CQR 90% Mean Width (Days)",
            "development_mean": dev_cqr_90["mean_interval_width_mean"],
            "development_std": dev_cqr_90["mean_interval_width_std"],
            "locked_registry_value": df_cqr_bench.loc[df_cqr_bench["nominal_coverage"] == 0.90, "mean_interval_width"].values[0],
            "delta_registry_minus_dev": df_cqr_bench.loc[df_cqr_bench["nominal_coverage"] == 0.90, "mean_interval_width"].values[0] - dev_cqr_90["mean_interval_width_mean"],
        },
    ]

    df_gen = pd.DataFrame(gen_rows)
    gen_csv = tables_dir / "development_vs_registry.csv"
    df_gen.to_csv(gen_csv, index=False)
    print(f"Saved temporal generalization comparison to {gen_csv}")
    print(df_gen.to_string(index=False))

    # =========================================================================
    # STEP 6: OPERATIONAL DECISION UTILITY SIMULATION [SIMULATED SCENARIO]
    # =========================================================================
    print("\n--- Step 6: Operational Decision Utility [SIMULATED SCENARIO] ---")
    # Evaluate on full registry set (N=1013)
    X_reg_all = X_reg.copy()
    for col in cat_cols:
        X_reg_all[col] = pd.Categorical(X_reg_all[col], categories=X_tr_del[col].cat.categories)

    # Predict severity on all registry items for ranking
    sev_p50_all = np.maximum(0.0, lgb_q_models[0.50].predict(X_reg_all))
    q_adj_90 = df_cqr_bench.loc[df_cqr_bench["nominal_coverage"] == 0.90, "conformal_adjustment_Q"].values[0]
    sev_q95_all = np.maximum(0.0, lgb_q_models[0.95].predict(X_reg_all) + q_adj_90)

    strategies = {
        "Strategy_1_Risk_Only": p_cb_reg_platt,
        "Strategy_2_Risk_x_Severity": p_cb_reg_platt * sev_p50_all,
        "Strategy_3_Uncertainty_Aware": p_cb_reg_platt * sev_q95_all,
    }

    n_tot_reg = len(y_reg)
    total_del_reg = int(np.sum(y_reg == 1))
    total_high_sev_reg = int(np.sum((y_reg == 1) & (y_reg_days > 14)))
    total_delay_days_reg = float(np.sum(np.maximum(0.0, y_reg_days)))

    decision_rows = []
    k_fractions = [0.01, 0.05, 0.10, 0.20]

    for strat_name, score_arr in strategies.items():
        order = np.argsort(-score_arr)
        for k_frac in k_fractions:
            k_count = max(1, int(np.ceil(k_frac * n_tot_reg)))
            top_idx = order[:k_count]

            del_cap = int(np.sum(y_reg[top_idx] == 1))
            high_sev_cap = int(np.sum((y_reg[top_idx] == 1) & (y_reg_days[top_idx] > 14)))
            days_cap = float(np.sum(np.maximum(0.0, y_reg_days[top_idx])))

            decision_rows.append({
                "strategy": strat_name,
                "evidence_label": "SIMULATED SCENARIO",
                "k_fraction": k_frac,
                "k_shipments": k_count,
                "delayed_captured": del_cap,
                "total_delayed": total_del_reg,
                "recall_at_k": del_cap / max(1, total_del_reg),
                "high_severity_captured": high_sev_cap,
                "total_high_severity": total_high_sev_reg,
                "high_severity_recall_at_k": high_sev_cap / max(1, total_high_sev_reg),
                "delay_days_captured": days_cap,
                "total_delay_days": total_delay_days_reg,
                "delay_days_capture_ratio": days_cap / max(1.0, total_delay_days_reg),
            })

    df_dec_bench = pd.DataFrame(decision_rows)
    dec_csv = tables_dir / "locked_registry_decision_utility.csv"
    df_dec_bench.to_csv(dec_csv, index=False)
    print(f"Saved decision utility benchmark to {dec_csv}")
    print(df_dec_bench[["strategy", "k_fraction", "k_shipments", "delayed_captured", "recall_at_k", "high_severity_captured", "high_severity_recall_at_k", "delay_days_captured", "delay_days_capture_ratio"]].to_string(index=False))

    # =========================================================================
    # STEP 8: PROVENANCE MANIFEST
    # =========================================================================
    manifest_data = {
        "experiment_id": EXPERIMENT_ID,
        "execution_timestamp": datetime.now().isoformat(),
        "git_commit": GIT_COMMIT,
        "canonical_dataset_sha256": CANONICAL_SHA256,
        "frozen_contract_path": "research/contracts/FINAL_EVALUATION_FREEZE.json",
        "cohort_counts": {
            "train_rows": len(df_tr),
            "calib_rows": len(df_cal),
            "locked_registry_rows": n_reg,
            "locked_registry_delayed": n_reg_del,
        },
        "frozen_models": {
            "primary_classifier": "CatBoost (iter=300, lr=0.05, depth=6, Balanced, Platt)",
            "primary_threshold": tau_cb,
            "sensitivity_classifier": "Random Forest (n=300, depth=8, leaf=5, Platt)",
            "sensitivity_threshold": tau_rf,
            "severity_point_estimator": "Conditional Median Baseline",
            "conformal_quantile_framework": "LightGBM Quantiles (q0.025, q0.05, q0.10, q0.50, q0.90, q0.95, q0.975)",
        },
        "random_seed": SEED,
        "manifest_sha256": "",
    }

    manifest_path = REPO_ROOT / "research" / "outputs" / "LOCKED_REGISTRY_MANIFEST.json"
    raw_man = json.dumps(manifest_data, indent=2)
    man_hash = hashlib.sha256(raw_man.encode("utf-8")).hexdigest().upper()
    manifest_data["manifest_sha256"] = man_hash

    with open(manifest_path, "w") as f:
        json.dump(manifest_data, f, indent=2)

    print(f"\nSaved benchmark manifest to {manifest_path}")
    print(f"Manifest SHA-256: {man_hash}")

    print(f"\n[{datetime.now().isoformat()}] Benchmark execution completed successfully in {(datetime.now() - start_time).total_seconds():.2f}s.")

if __name__ == "__main__":
    run_benchmark()
