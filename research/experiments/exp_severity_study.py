"""Phase 2 Experiment: Conditional Delay Severity Benchmark."""

import hashlib
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Tuple
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, median_absolute_error, mean_squared_error
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import lightgbm as lgb

import sys
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))
from research.scripts.data_utils import get_development_data, get_feature_columns, get_temporal_folds, CANONICAL_SHA256

EXPERIMENT_ID = "EXP_03_SEVERITY_BENCHMARK"
GIT_COMMIT = "6f71396ac38466c9d18e2706bea8688d9c2ea8ac"
SEED = 42

def compute_pinball_loss(y_true: np.ndarray, y_pred: np.ndarray, alpha: float) -> float:
    """Compute quantile pinball loss for target quantile alpha."""
    residual = y_true - y_pred
    loss = np.maximum(alpha * residual, (alpha - 1.0) * residual)
    return float(np.mean(loss))

def run_severity_experiments():
    print(f"[{datetime.now().isoformat()}] Starting Conditional Delay Severity Benchmark...")
    df_dev = get_development_data()
    num_cols, cat_cols = get_feature_columns()
    folds = get_temporal_folds(df_dev)

    metrics_dir = REPO_ROOT / "research" / "outputs" / "metrics"
    tables_dir = REPO_ROOT / "research" / "outputs" / "tables"
    metrics_dir.mkdir(parents=True, exist_ok=True)
    tables_dir.mkdir(parents=True, exist_ok=True)

    severity_results = []

    for fold in folds:
        fold_id = fold["fold_id"]
        train_idx = fold["train_idx"]
        val_idx = fold["val_idx"]

        # Filter strictly delayed observations for conditional severity
        df_tr_all = df_dev.loc[train_idx]
        df_va_all = df_dev.loc[val_idx]

        df_tr_del = df_tr_all[df_tr_all["Delay_Flag"] == 1].copy()
        df_va_del = df_va_all[df_va_all["Delay_Flag"] == 1].copy()

        y_tr = df_tr_del["Delay_Days"].astype(float).to_numpy()
        y_va = df_va_del["Delay_Days"].astype(float).to_numpy()

        X_tr = df_tr_del[num_cols + cat_cols].copy()
        X_va = df_va_del[num_cols + cat_cols].copy()

        for col in cat_cols:
            X_tr[col] = X_tr[col].fillna("Missing").astype(str)
            X_va[col] = X_va[col].fillna("Missing").astype(str)
        for col in num_cols:
            X_tr[col] = pd.to_numeric(X_tr[col], errors="coerce").fillna(0.0).astype(float)
            X_va[col] = pd.to_numeric(X_va[col], errors="coerce").fillna(0.0).astype(float)

        print(f"\n--- Fold {fold_id} (Train Delayed: {len(X_tr)} rows, Val Delayed: {len(X_va)} rows) ---")

        # 1. Conditional Median Baseline
        med_val = float(np.median(y_tr))
        pred_med = np.full_like(y_va, fill_value=med_val)
        q05_med = float(np.percentile(y_tr, 5))
        q95_med = float(np.percentile(y_tr, 95))
        pred_q05_med = np.full_like(y_va, fill_value=q05_med)
        pred_q95_med = np.full_like(y_va, fill_value=q95_med)

        mae_med = float(mean_absolute_error(y_va, pred_med))
        med_ae_med = float(median_absolute_error(y_va, pred_med))
        pb05_med = compute_pinball_loss(y_va, pred_q05_med, 0.05)
        pb50_med = compute_pinball_loss(y_va, pred_med, 0.50)
        pb95_med = compute_pinball_loss(y_va, pred_q95_med, 0.95)

        print(f"  Conditional Median   | MAE: {mae_med:.2f} | MedAE: {med_ae_med:.2f} | Pinball(q50): {pb50_med:.2f}")
        severity_results.append({
            "experiment_id": EXPERIMENT_ID,
            "git_commit": GIT_COMMIT,
            "data_sha256": CANONICAL_SHA256,
            "fold_id": fold_id,
            "model": "Conditional Median Baseline",
            "train_delayed_rows": len(X_tr),
            "val_delayed_rows": len(X_va),
            "mae": mae_med,
            "median_ae": med_ae_med,
            "pinball_q05": pb05_med,
            "pinball_q50": pb50_med,
            "pinball_q95": pb95_med,
        })

        # 2. Ridge Regression Baseline
        preprocessor = ColumnTransformer(
            transformers=[
                ("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), num_cols),
                ("cat", Pipeline([("ohe", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), cat_cols),
            ]
        )
        ridge = Pipeline([
            ("prep", preprocessor),
            ("reg", Ridge(alpha=1.0, random_state=SEED)),
        ])
        ridge.fit(X_tr, y_tr)
        pred_ridge = ridge.predict(X_va)
        mae_ridge = float(mean_absolute_error(y_va, pred_ridge))
        med_ae_ridge = float(median_absolute_error(y_va, pred_ridge))
        pb50_ridge = compute_pinball_loss(y_va, pred_ridge, 0.50)

        print(f"  Ridge Regression     | MAE: {mae_ridge:.2f} | MedAE: {med_ae_ridge:.2f} | Pinball(q50): {pb50_ridge:.2f}")
        severity_results.append({
            "experiment_id": EXPERIMENT_ID,
            "git_commit": GIT_COMMIT,
            "data_sha256": CANONICAL_SHA256,
            "fold_id": fold_id,
            "model": "Ridge Regression",
            "train_delayed_rows": len(X_tr),
            "val_delayed_rows": len(X_va),
            "mae": mae_ridge,
            "median_ae": med_ae_ridge,
            "pinball_q05": np.nan,
            "pinball_q50": pb50_ridge,
            "pinball_q95": np.nan,
        })

        # 3. LightGBM Quantile Regressors (q05, q50, q95)
        X_tr_lgb = X_tr.copy()
        X_va_lgb = X_va.copy()
        for col in cat_cols:
            X_tr_lgb[col] = X_tr_lgb[col].astype("category")
            X_va_lgb[col] = pd.Categorical(X_va_lgb[col], categories=X_tr_lgb[col].cat.categories)

        q_preds = {}
        for q in [0.05, 0.50, 0.95]:
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
            lgb_q.fit(X_tr_lgb, y_tr)
            q_preds[q] = lgb_q.predict(X_va_lgb)

        mae_lgb = float(mean_absolute_error(y_va, q_preds[0.50]))
        med_ae_lgb = float(median_absolute_error(y_va, q_preds[0.50]))
        pb05_lgb = compute_pinball_loss(y_va, q_preds[0.05], 0.05)
        pb50_lgb = compute_pinball_loss(y_va, q_preds[0.50], 0.50)
        pb95_lgb = compute_pinball_loss(y_va, q_preds[0.95], 0.95)

        print(f"  LightGBM Quantiles   | MAE: {mae_lgb:.2f} | MedAE: {med_ae_lgb:.2f} | Pinball(q50): {pb50_lgb:.2f} | Pinball(q95): {pb95_lgb:.2f}")
        severity_results.append({
            "experiment_id": EXPERIMENT_ID,
            "git_commit": GIT_COMMIT,
            "data_sha256": CANONICAL_SHA256,
            "fold_id": fold_id,
            "model": "LightGBM Quantiles",
            "train_delayed_rows": len(X_tr),
            "val_delayed_rows": len(X_va),
            "mae": mae_lgb,
            "median_ae": med_ae_lgb,
            "pinball_q05": pb05_lgb,
            "pinball_q50": pb50_lgb,
            "pinball_q95": pb95_lgb,
        })

    df_sev = pd.DataFrame(severity_results)
    sev_csv = metrics_dir / "severity_results.csv"
    df_sev.to_csv(sev_csv, index=False)
    print(f"\nSaved severity results to {sev_csv}")

    # Summary
    summary_sev = df_sev.groupby("model").agg({
        "mae": ["mean", "std"],
        "median_ae": ["mean", "std"],
        "pinball_q05": ["mean"],
        "pinball_q50": ["mean"],
        "pinball_q95": ["mean"],
    }).reset_index()
    summary_sev.columns = ["_".join(c).strip("_") for c in summary_sev.columns]
    summary_csv = tables_dir / "severity_summary.csv"
    summary_sev.to_csv(summary_csv, index=False)
    print(f"Saved severity summary to {summary_csv}")
    print("\n" + summary_sev.to_string(index=False))

if __name__ == "__main__":
    run_severity_experiments()
