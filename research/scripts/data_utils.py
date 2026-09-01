"""Research Data Loading, Feature Engineering, and Temporal Splitting Utilities."""

import hashlib
import json
import os
from pathlib import Path
from typing import Dict, List, Tuple, Any
import numpy as np
import pandas as pd

import sys
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "backend" / "src"))

from delay_intelligence.data.adapters.scms import SCMSAdapter
from delay_intelligence.validation.contract_validator import PredictionContractValidator
from delay_intelligence.features.builder import TemporalFeatureBuilder

# Keep the research code portable. The raw SCMS CSV is intentionally not bundled in
# this repository. Set ORCA_SCMS_DATA_PATH to the local source file when raw-data
# verification or feature regeneration is required.
DEFAULT_CANONICAL_DATA_PATH = REPO_ROOT / "data" / "raw" / "SCMS_Delivery_History_Dataset.csv"
CANONICAL_DATA_PATH = Path(
    os.environ.get("ORCA_SCMS_DATA_PATH", str(DEFAULT_CANONICAL_DATA_PATH))
).expanduser()
CANONICAL_SHA256 = "918b992dd3e8d4b64d2a727b2c4ea607603d0c58f19484e73f7b78528c6a8673"
SCHEMA_PATH = REPO_ROOT / "backend" / "artifacts" / "model_registry" / "v2" / "feature_schema.json"
CACHE_PATH = REPO_ROOT / "research" / "outputs" / "scms_research_features.parquet"

RAW_DATA_PATH = CANONICAL_DATA_PATH

FORBIDDEN_FIELDS = {
    "ID", "ASN/DN #", "Weight (Kilograms)", "Freight Cost (USD)",
    "Delivered to Client Date", "Delivery Recorded Date",
    "Delay_Days", "Delay_Flag", "is_temporal_anomaly"
}


def load_canonical_raw_data() -> pd.DataFrame:
    """Load canonical standardized SCMS dataset with SHA-256 verification."""
    adapter = SCMSAdapter(data_path=CANONICAL_DATA_PATH)
    actual_hash = adapter._compute_sha256()
    if actual_hash != CANONICAL_SHA256:
        raise ValueError(f"CANONICAL DATA HASH MISMATCH! Expected: {CANONICAL_SHA256}, Got: {actual_hash}")
    df_raw = adapter.load_raw()
    df_std = adapter.standardize_schema(df_raw)
    df_temp = adapter.extract_temporal_features(df_std)
    return df_temp


def load_and_verify_features(force_recompute: bool = False) -> pd.DataFrame:
    """Load precomputed research features or build from raw data with SHA-256 verification."""
    if CACHE_PATH.exists() and not force_recompute:
        df = pd.read_parquet(CACHE_PATH)
        return df

    if not CANONICAL_DATA_PATH.exists():
        raise FileNotFoundError(
            "Canonical SCMS raw data was not found. Set ORCA_SCMS_DATA_PATH to "
            "SCMS_Delivery_History_Dataset.csv, or use the versioned research feature cache."
        )

    adapter = SCMSAdapter(data_path=CANONICAL_DATA_PATH)
    actual_hash = adapter._compute_sha256()
    if actual_hash != CANONICAL_SHA256:
        raise ValueError(f"CANONICAL DATA HASH MISMATCH! Expected: {CANONICAL_SHA256}, Got: {actual_hash}")

    df_raw = adapter.load_raw()
    df_std = adapter.standardize_schema(df_raw)
    df_temp = adapter.extract_temporal_features(df_std)

    validator = PredictionContractValidator()
    base_eligible = validator.evaluate_base_eligibility(df_temp)
    df_eligible = df_temp[base_eligible].copy()
    df_eligible['T_pred'] = validator.compute_prediction_timestamp(df_eligible, use_fallback=False)

    deliv = pd.to_datetime(df_eligible['Delivered to Client Date'])
    anomaly = df_eligible['is_temporal_anomaly'] == 0
    strict_cohort = df_eligible['T_pred'].notna() & (df_eligible['T_pred'] <= deliv) & anomaly

    df_model = df_eligible[strict_cohort].copy().sort_values('T_pred').reset_index(drop=True)

    builder = TemporalFeatureBuilder(config_path=str(REPO_ROOT / "backend" / "configs" / "features.yaml"))
    df_features = builder.build_features(df_model)

    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    df_features.to_parquet(CACHE_PATH, index=False)
    return df_features


def get_feature_columns() -> Tuple[List[str], List[str]]:
    """Return numeric and categorical feature column names from frozen schema."""
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema = json.load(f)
    return schema["num_cols"], schema["cat_cols"]


def get_development_data() -> pd.DataFrame:
    """Return strictly development records (T_pred < 2014-08-24). Quarantine holdout!"""
    df = load_and_verify_features()
    dev_end = pd.Timestamp("2014-08-24")
    df_dev = df[df["T_pred"] < dev_end].copy().reset_index(drop=True)
    return df_dev


def get_temporal_folds(df_dev: pd.DataFrame, n_folds: int = 5, val_days: int = 180, embargo_days: int = 90) -> List[Dict[str, Any]]:
    """Generate 5 expanding-origin temporal folds strictly within development data."""
    dev_end = pd.Timestamp("2014-08-24")
    t_start = df_dev["T_pred"].min()
    folds = []

    for k in range(n_folds - 1, -1, -1):
        val_end = dev_end - pd.Timedelta(days=k * val_days)
        val_start = val_end - pd.Timedelta(days=val_days)
        train_end = val_start - pd.Timedelta(days=embargo_days)
        train_start = t_start

        train_idx = df_dev[(df_dev["T_pred"] >= train_start) & (df_dev["T_pred"] < train_end)].index.to_numpy()
        val_idx = df_dev[(df_dev["T_pred"] >= val_start) & (df_dev["T_pred"] < val_end)].index.to_numpy()

        fold_id = n_folds - 1 - k
        folds.append({
            "fold_id": fold_id,
            "train_start": str(train_start.date()),
            "train_end": str(train_end.date()),
            "val_start": str(val_start.date()),
            "val_end": str(val_end.date()),
            "train_idx": train_idx,
            "val_idx": val_idx,
        })
    return folds
