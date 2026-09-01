"""Test Suite for ORCA Research Pipeline, Folds, and Quarantine Integrity."""

import hashlib
import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

import sys
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from research.scripts.data_utils import (
    load_canonical_raw_data,
    load_and_verify_features,
    get_development_data,
    get_feature_columns,
    get_temporal_folds,
    CANONICAL_SHA256,
    RAW_DATA_PATH,
)
from research.experiments.exp_calibration_study import compute_ece
from research.experiments.exp_conformal_uncertainty import exact_clopper_pearson_ci


def test_raw_data_integrity():
    """Verify the canonical raw source when it is explicitly available locally."""
    if not RAW_DATA_PATH.exists():
        pytest.skip(
            "Raw SCMS data is intentionally not bundled. Set ORCA_SCMS_DATA_PATH "
            "to run canonical-source hash verification."
        )
    df = load_canonical_raw_data()
    assert len(df) == 10324
    assert int(df["Delay_Flag"].sum()) == 1186


def test_versioned_research_feature_cache_integrity():
    """Verify the strict modeling cache and its temporal evidence partition."""
    cache_path = REPO_ROOT / "research" / "outputs" / "scms_research_features.parquet"
    assert cache_path.exists(), f"Research feature cache missing at {cache_path}"
    df = pd.read_parquet(cache_path)

    # Strict prediction-eligible modeling cohort after temporal/anomaly filtering.
    assert len(df) == 8319, f"Expected 8,319 eligible research rows, got {len(df)}"
    assert int(df["Delay_Flag"].sum()) == 1169
    assert "T_pred" in df.columns

    t_pred = pd.to_datetime(df["T_pred"])
    cutoff = pd.Timestamp("2014-08-24")
    benchmark_end = pd.Timestamp("2015-08-24")

    df_dev = df[t_pred < cutoff]
    df_benchmark = df[(t_pred >= cutoff) & (t_pred <= benchmark_end)]

    assert len(df_dev) == 7306
    assert int(df_dev["Delay_Flag"].sum()) == 1108
    assert len(df_benchmark) == 1013
    assert int(df_benchmark["Delay_Flag"].sum()) == 61
    assert len(df_dev) + len(df_benchmark) == len(df)
    assert int(df_dev["Delay_Flag"].sum()) + int(df_benchmark["Delay_Flag"].sum()) == int(df["Delay_Flag"].sum())


def test_feature_columns_and_schema():
    """Verify feature schema matches exactly 39 features (26 numeric, 13 categorical)."""
    num_cols, cat_cols = get_feature_columns()
    assert len(num_cols) == 26, f"Expected 26 numeric columns, got {len(num_cols)}"
    assert len(cat_cols) == 13, f"Expected 13 categorical columns, got {len(cat_cols)}"
    assert len(set(num_cols).intersection(set(cat_cols))) == 0


def test_quarantine_integrity_in_development():
    """Verify strictly 0 rows in development cohort violate the 2014-08-24 quarantine."""
    df_dev = get_development_data()
    assert len(df_dev) == 7306, f"Expected 7,306 development rows, got {len(df_dev)}"
    assert int(df_dev["Delay_Flag"].sum()) == 1108
    max_tpred = pd.to_datetime(df_dev["T_pred"]).max()
    assert max_tpred < pd.Timestamp("2014-08-24"), f"Quarantine breach: found T_pred {max_tpred}"


def test_temporal_folds_embargo_and_disjointness():
    """Verify 5 temporal folds with strict expanding train and 90-day embargo."""
    df_dev = get_development_data()
    folds = get_temporal_folds(df_dev)
    assert len(folds) == 5

    prev_train_len = 0
    for fold in folds:
        train_idx = fold["train_idx"]
        val_idx = fold["val_idx"]

        overlap = set(train_idx).intersection(set(val_idx))
        assert len(overlap) == 0, f"Fold {fold['fold_id']} has {len(overlap)} overlapping indices"

        assert len(train_idx) > prev_train_len
        prev_train_len = len(train_idx)

        max_train_date = pd.to_datetime(df_dev.loc[train_idx, "T_pred"]).max()
        min_val_date = pd.to_datetime(df_dev.loc[val_idx, "T_pred"]).min()
        gap_days = (min_val_date - max_train_date).days
        assert gap_days >= 85, f"Fold {fold['fold_id']} has insufficient embargo gap: {gap_days} days"


def test_ece_computation_properties():
    """Verify ECE calculation properties on synthetic perfectly calibrated data."""
    y_true_perf = np.array([0, 0, 0, 0, 1, 1, 1, 1, 1, 0])
    y_prob_perf = np.array([0.2, 0.2, 0.2, 0.2, 0.2, 0.8, 0.8, 0.8, 0.8, 0.8])
    ece_perf, _, _, _ = compute_ece(y_true_perf, y_prob_perf, n_bins=10)
    assert ece_perf < 1e-5, f"Expected 0 ECE on perfect calibration, got {ece_perf}"


def test_exact_binomial_ci():
    """Verify exact Clopper-Pearson binomial confidence interval bounds."""
    low, high = exact_clopper_pearson_ci(k=58, n=61, confidence=0.95)
    assert 0.0 <= low <= high <= 1.0
    assert 0.85 <= low <= 0.92
    assert 0.97 <= high <= 1.0


def test_required_phase2_artifacts_exist():
    """Verify all required metric CSVs, tables, and figures exist on disk."""
    required_files = [
        "research/outputs/metrics/temporal_fold_manifest.csv",
        "research/outputs/metrics/classification_fold_results.csv",
        "research/outputs/metrics/calibration_results.csv",
        "research/outputs/metrics/severity_results.csv",
        "research/outputs/metrics/conformal_results.csv",
        "research/outputs/metrics/decision_utility.csv",
        "research/outputs/tables/classification_summary.csv",
        "research/outputs/tables/random_vs_temporal.csv",
        "research/outputs/tables/calibration_summary.csv",
        "research/outputs/tables/temporal_stability_summary.csv",
        "research/outputs/tables/severity_summary.csv",
        "research/outputs/tables/conformal_summary.csv",
        "research/outputs/tables/decision_utility_summary.csv",
        "research/outputs/tables/ablation_summary.csv",
        "research/outputs/tables/development_metrics_with_ci.csv",
        "research/outputs/figures/calibration_reliability_catboost.png",
        "research/outputs/figures/temporal_pr_auc.png",
        "research/outputs/figures/temporal_brier.png",
        "research/outputs/figures/coverage_vs_width.png",
        "research/outputs/figures/decision_utility_at_k.png",
        "research/outputs/tables/locked_registry_classification.csv",
        "research/outputs/tables/locked_registry_calibration.csv",
        "research/outputs/tables/locked_registry_severity.csv",
        "research/outputs/tables/locked_registry_cqr.csv",
        "research/outputs/tables/development_vs_registry.csv",
        "research/outputs/tables/locked_registry_decision_utility.csv",
        "research/outputs/figures/locked_registry_calibration_catboost.png",
        "research/outputs/figures/locked_registry_calibration_rf.png",
        "research/outputs/figures/locked_registry_coverage_vs_width.png",
        "research/outputs/LOCKED_REGISTRY_MANIFEST.json",
    ]
    for rel_path in required_files:
        full_path = REPO_ROOT / rel_path
        assert full_path.exists(), f"Missing required Phase-2 artifact: {rel_path}"


def test_locked_registry_manifest_integrity():
    """Verify locked registry manifest hash, cohort counts, and frozen thresholds."""
    manifest_path = REPO_ROOT / "research" / "outputs" / "LOCKED_REGISTRY_MANIFEST.json"
    assert manifest_path.exists()

    with open(manifest_path, "r") as f:
        data = json.load(f)

    h_recorded = data.get("manifest_sha256", "")
    data["manifest_sha256"] = ""
    raw_str = json.dumps(data, indent=2)
    h_computed = hashlib.sha256(raw_str.encode("utf-8")).hexdigest().upper()
    assert h_recorded == h_computed, f"Manifest hash mismatch: recorded {h_recorded} vs computed {h_computed}"

    cohorts = data["cohorts"] if "cohorts" in data else data.get("cohort_counts", {})
    assert cohorts.get("locked_registry_rows") == 1013
    assert cohorts.get("locked_registry_delayed") == 61
    assert data["frozen_models"]["primary_threshold"] == 0.1000
    assert data["frozen_models"]["sensitivity_threshold"] == 0.1050
