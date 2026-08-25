"""Local dashboard client for the research demo.

Kept free of Streamlit imports so API/contract tests can run in a minimal Python
environment. Streamlit pages own their presentation caches.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from delay_intelligence.api.main import app

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DATA = REPO_ROOT / "artifacts" / "demo" / "demo_shipments.csv"
client = TestClient(app)

OUTCOME_OR_NONFEATURE = {
    "ID",
    "T_pred",
    "Delay_Days",
    "Delay_Flag",
    "Delivered to Client Date",
    "Delivery Recorded Date",
    "is_temporal_anomaly",
}


def load_data(limit: int = 100) -> pd.DataFrame:
    """Load the frozen real-data demo sample generated from the untouched holdout."""
    if not DEMO_DATA.exists():
        raise FileNotFoundError(
            f"Demo sample not found: {DEMO_DATA}. Run scripts/build_serving_registry.py first."
        )
    return pd.read_csv(DEMO_DATA).head(limit)


def row_to_features(row: pd.Series | dict[str, Any]) -> dict[str, Any]:
    data = row.to_dict() if hasattr(row, "to_dict") else dict(row)
    clean: dict[str, Any] = {}
    for key, value in data.items():
        if key in OUTCOME_OR_NONFEATURE:
            continue
        if pd.isna(value):
            continue
        if isinstance(value, np.generic):
            value = value.item()
        clean[str(key)] = value
    return clean


def _post(path: str, features_dict: dict[str, Any]) -> dict[str, Any]:
    res = client.post(path, json={"features": features_dict})
    res.raise_for_status()
    return res.json()


def api_predict(features_dict):
    return _post("/predict", features_dict)


def api_explain(features_dict):
    return _post("/explain", features_dict)


def api_recommend(features_dict):
    return _post("/recommend", features_dict)


def find_default_demo_shipment() -> str:
    """Find the highest-risk shipment ID for the default demo selection.

    Scores a small sample to avoid full portfolio scoring on every page load.
    Result is cached via the caller.
    """
    df = load_data()
    best_id = str(df["ID"].iloc[0]) if "ID" in df.columns else "0"
    best_prob = -1.0
    for _, row in df.iterrows():
        features = row_to_features(row)
        pred = api_predict(features)
        p = float(pred["probability_late"])
        if p > best_prob:
            best_prob = p
            best_id = str(row.get("ID", _))
    return best_id
