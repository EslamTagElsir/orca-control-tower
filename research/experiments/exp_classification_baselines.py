"""Phase 2 Experiment: Classification Baselines & Random-Split Optimism Diagnostic."""

import hashlib
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Tuple
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    average_precision_score,
    roc_auc_score,
    brier_score_loss,
    precision_score,
    recall_score,
    f1_score,
    balanced_accuracy_score,
    precision_recall_curve,
)
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import lightgbm as lgb
import xgboost as xgb
import catboost as cb

import sys
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))
from research.scripts.data_utils import get_development_data, get_feature_columns, get_temporal_folds, CANONICAL_SHA256

EXPERIMENT_ID = "EXP_01_CLASSIFICATION_BASELINES"
GIT_COMMIT = "6f71396ac38466c9d18e2706bea8688d9c2ea8ac"
SEED = 42

def find_optimal_threshold(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    """Find threshold maximizing F1 score on training predictions."""
    precisions, recalls, thresholds = precision_recall_curve(y_true, y_prob)
    f1_scores = np.where(
        (precisions + recalls) > 0,
        2 * (precisions * recalls) / (precisions + recalls),
        0.0,
    )
    best_idx = np.argmax(f1_scores[:-1]) if len(thresholds) > 0 else 0
    return float(thresholds[best_idx]) if len(thresholds) > 0 else 0.5

def train_and_eval_model(
    model_name: str,
    X_train: pd.DataFrame,
    y_train: np.ndarray,
    X_val: pd.DataFrame,
    y_val: np.ndarray,
    num_cols: List[str],
    cat_cols: List[str],
) -> Tuple[Dict[str, float], np.ndarray, float]:
    """Train single classifier and evaluate on validation set."""
    X_tr = X_train.copy()
    X_va = X_val.copy()

    # Sanitize dtypes cleanly
    for col in cat_cols:
        X_tr[col] = X_tr[col].fillna("Missing").astype(str)
        X_va[col] = X_va[col].fillna("Missing").astype(str)
    for col in num_cols:
        X_tr[col] = pd.to_numeric(X_tr[col], errors="coerce").astype(float)
        X_va[col] = pd.to_numeric(X_va[col], errors="coerce").astype(float)

    if model_name == "Logistic Regression":
        preprocessor = ColumnTransformer(
            transformers=[
                ("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), num_cols),
                ("cat", Pipeline([("ohe", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), cat_cols),
            ]
        )
        clf = Pipeline([
            ("prep", preprocessor),
            ("clf", LogisticRegression(C=1.0, max_iter=1000, class_weight="balanced", random_state=SEED)),
        ])
        clf.fit(X_tr, y_train)
        train_prob = clf.predict_proba(X_tr)[:, 1]
        val_prob = clf.predict_proba(X_va)[:, 1]

    elif model_name == "Random Forest":
        preprocessor = ColumnTransformer(
            transformers=[
                ("num", Pipeline([("imp", SimpleImputer(strategy="median"))]), num_cols),
                ("cat", Pipeline([("ohe", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), cat_cols),
            ]
        )
        clf = Pipeline([
            ("prep", preprocessor),
            ("clf", RandomForestClassifier(n_estimators=300, max_depth=8, min_samples_leaf=5, class_weight="balanced_subsample", random_state=SEED, n_jobs=-1)),
        ])
        clf.fit(X_tr, y_train)
        train_prob = clf.predict_proba(X_tr)[:, 1]
        val_prob = clf.predict_proba(X_va)[:, 1]

    elif model_name == "XGBoost":
        for col in cat_cols:
            X_tr[col] = X_tr[col].astype("category")
            X_va[col] = pd.Categorical(X_va[col], categories=X_tr[col].cat.categories)

        pos_count = y_train.sum()
        neg_count = len(y_train) - pos_count
        scale_weight = float(neg_count / max(1, pos_count))

        clf = xgb.XGBClassifier(
            n_estimators=300,
            learning_rate=0.05,
            max_depth=6,
            subsample=0.8,
            colsample_bytree=0.8,
            scale_pos_weight=scale_weight,
            enable_categorical=True,
            random_state=SEED,
            eval_metric="logloss",
            n_jobs=-1,
        )
        clf.fit(X_tr, y_train)
        train_prob = clf.predict_proba(X_tr)[:, 1]
        val_prob = clf.predict_proba(X_va)[:, 1]

    elif model_name == "LightGBM":
        for col in cat_cols:
            X_tr[col] = X_tr[col].astype("category")
            X_va[col] = pd.Categorical(X_va[col], categories=X_tr[col].cat.categories)

        clf = lgb.LGBMClassifier(
            n_estimators=300,
            learning_rate=0.05,
            num_leaves=31,
            subsample=0.8,
            colsample_bytree=0.8,
            class_weight="balanced",
            random_state=SEED,
            verbose=-1,
            n_jobs=-1,
        )
        clf.fit(X_tr, y_train)
        train_prob = clf.predict_proba(X_tr)[:, 1]
        val_prob = clf.predict_proba(X_va)[:, 1]

    elif model_name == "CatBoost":
        for col in num_cols:
            X_tr[col] = X_tr[col].fillna(0.0)
            X_va[col] = X_va[col].fillna(0.0)

        clf = cb.CatBoostClassifier(
            iterations=300,
            learning_rate=0.05,
            depth=6,
            auto_class_weights="Balanced",
            cat_features=cat_cols,
            random_seed=SEED,
            verbose=0,
            thread_count=-1,
        )
        clf.fit(X_tr, y_train)
        train_prob = clf.predict_proba(X_tr)[:, 1]
        val_prob = clf.predict_proba(X_va)[:, 1]
    else:
        raise ValueError(f"Unknown model: {model_name}")

    # Optimal threshold selected on train set
    thresh = find_optimal_threshold(y_train, train_prob)
    val_pred = (val_prob >= thresh).astype(int)

    metrics = {
        "pr_auc": float(average_precision_score(y_val, val_prob)),
        "roc_auc": float(roc_auc_score(y_val, val_prob)),
        "brier_score": float(brier_score_loss(y_val, val_prob)),
        "precision": float(precision_score(y_val, val_pred, zero_division=0)),
        "recall": float(recall_score(y_val, val_pred, zero_division=0)),
        "f1": float(f1_score(y_val, val_pred, zero_division=0)),
        "balanced_accuracy": float(balanced_accuracy_score(y_val, val_pred)),
        "threshold": thresh,
    }
    return metrics, val_prob, thresh

def run_classification_experiments():
    print(f"[{datetime.now().isoformat()}] Starting Classification Baselines Experiment...")
    df_dev = get_development_data()
    num_cols, cat_cols = get_feature_columns()
    folds = get_temporal_folds(df_dev)

    models = ["Logistic Regression", "Random Forest", "XGBoost", "LightGBM", "CatBoost"]
    fold_results = []

    for fold in folds:
        fold_id = fold["fold_id"]
        train_idx = fold["train_idx"]
        val_idx = fold["val_idx"]

        X_train = df_dev.loc[train_idx, num_cols + cat_cols].copy()
        y_train = df_dev.loc[train_idx, "Delay_Flag"].astype(int).to_numpy()

        X_val = df_dev.loc[val_idx, num_cols + cat_cols].copy()
        y_val = df_dev.loc[val_idx, "Delay_Flag"].astype(int).to_numpy()

        print(f"\n--- Fold {fold_id} (Train: {len(X_train)} rows, Val: {len(X_val)} rows, Pos: {y_val.sum()}) ---")

        for model_name in models:
            t0 = time.time()
            metrics, _, thresh = train_and_eval_model(
                model_name, X_train, y_train, X_val, y_val, num_cols, cat_cols
            )
            elapsed = time.time() - t0
            print(f"  {model_name:<20} | PR-AUC: {metrics['pr_auc']:.4f} | ROC-AUC: {metrics['roc_auc']:.4f} | Brier: {metrics['brier_score']:.4f} | F1: {metrics['f1']:.4f} ({elapsed:.2f}s)")

            fold_results.append({
                "experiment_id": EXPERIMENT_ID,
                "git_commit": GIT_COMMIT,
                "data_sha256": CANONICAL_SHA256,
                "fold_id": fold_id,
                "model": model_name,
                "train_rows": len(X_train),
                "val_rows": len(X_val),
                "val_positive_rows": int(y_val.sum()),
                "val_delay_rate": float(y_val.mean()),
                "pr_auc": metrics["pr_auc"],
                "roc_auc": metrics["roc_auc"],
                "brier_score": metrics["brier_score"],
                "precision": metrics["precision"],
                "recall": metrics["recall"],
                "f1": metrics["f1"],
                "balanced_accuracy": metrics["balanced_accuracy"],
                "selected_threshold": thresh,
                "runtime_seconds": elapsed,
            })

    df_fold_results = pd.DataFrame(fold_results)
    metrics_dir = REPO_ROOT / "research" / "outputs" / "metrics"
    tables_dir = REPO_ROOT / "research" / "outputs" / "tables"
    metrics_dir.mkdir(parents=True, exist_ok=True)
    tables_dir.mkdir(parents=True, exist_ok=True)

    fold_csv = metrics_dir / "classification_fold_results.csv"
    df_fold_results.to_csv(fold_csv, index=False)
    print(f"\nSaved fold results to {fold_csv}")

    # Aggregate Summary
    summary_rows = []
    for model_name in models:
        sub = df_fold_results[df_fold_results["model"] == model_name]
        summary_rows.append({
            "model": model_name,
            "mean_PR_AUC": float(sub["pr_auc"].mean()),
            "std_PR_AUC": float(sub["pr_auc"].std()),
            "min_PR_AUC": float(sub["pr_auc"].min()),
            "max_PR_AUC": float(sub["pr_auc"].max()),
            "mean_ROC_AUC": float(sub["roc_auc"].mean()),
            "mean_Brier": float(sub["brier_score"].mean()),
            "mean_F1": float(sub["f1"].mean()),
            "mean_precision": float(sub["precision"].mean()),
            "mean_recall": float(sub["recall"].mean()),
            "mean_balanced_accuracy": float(sub["balanced_accuracy"].mean()),
            "number_of_folds": len(sub),
        })

    df_summary = pd.DataFrame(summary_rows)
    summary_csv = tables_dir / "classification_summary.csv"
    df_summary.to_csv(summary_csv, index=False)
    print(f"Saved summary to {summary_csv}")
    print("\n" + df_summary.to_string(index=False))

    # =========================================================================
    # STEP 3: Random Split Diagnostic (DIAGNOSTIC ONLY)
    # =========================================================================
    print(f"\n[{datetime.now().isoformat()}] Running Random-Split Optimism Diagnostic (DIAGNOSTIC ONLY)...")
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    X_all = df_dev[num_cols + cat_cols].copy()
    y_all = df_dev["Delay_Flag"].astype(int).to_numpy()

    random_results = {m: {"pr_auc": [], "roc_auc": [], "brier": []} for m in models}

    for fold_i, (tr_idx, va_idx) in enumerate(skf.split(X_all, y_all)):
        X_tr, y_tr = X_all.iloc[tr_idx].copy(), y_all[tr_idx]
        X_va, y_va = X_all.iloc[va_idx].copy(), y_all[va_idx]

        for model_name in models:
            metrics, _, _ = train_and_eval_model(
                model_name, X_tr, y_tr, X_va, y_va, num_cols, cat_cols
            )
            random_results[model_name]["pr_auc"].append(metrics["pr_auc"])
            random_results[model_name]["roc_auc"].append(metrics["roc_auc"])
            random_results[model_name]["brier"].append(metrics["brier_score"])

    diag_rows = []
    for model_name in models:
        rand_pr = float(np.mean(random_results[model_name]["pr_auc"]))
        rand_roc = float(np.mean(random_results[model_name]["roc_auc"]))
        rand_brier = float(np.mean(random_results[model_name]["brier"]))

        temp_row = df_summary[df_summary["model"] == model_name].iloc[0]
        temp_pr = float(temp_row["mean_PR_AUC"])
        temp_roc = float(temp_row["mean_ROC_AUC"])
        temp_brier = float(temp_row["mean_Brier"])

        diag_rows.append({
            "model": model_name,
            "evaluation_status": "DIAGNOSTIC ONLY — NOT PRIMARY EVALUATION",
            "random_PR_AUC": rand_pr,
            "temporal_mean_PR_AUC": temp_pr,
            "delta_PR_AUC": rand_pr - temp_pr,
            "random_ROC_AUC": rand_roc,
            "temporal_mean_ROC_AUC": temp_roc,
            "delta_ROC_AUC": rand_roc - temp_roc,
            "random_Brier": rand_brier,
            "temporal_mean_Brier": temp_brier,
            "delta_Brier": rand_brier - temp_brier,
        })

    df_diag = pd.DataFrame(diag_rows)
    diag_csv = tables_dir / "random_vs_temporal.csv"
    df_diag.to_csv(diag_csv, index=False)
    print(f"Saved Random-vs-Temporal Diagnostic to {diag_csv}")
    print("\n" + df_diag.to_string(index=False))

if __name__ == "__main__":
    run_classification_experiments()
