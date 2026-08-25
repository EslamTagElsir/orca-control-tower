from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import catboost as cb
import lightgbm as lgb
import numpy as np
import pandas as pd


class ModelLoader:
    """Load the exact artifacts used by the v2 demo serving pipeline.

    The original v1 registry packaged a Fold-0 proxy classifier and placeholder severity
    calibration; v2 replaces both with fitted serving artifacts. v2 is deliberately explicit: real CatBoost classification,
    temporal isotonic calibration, real LightGBM quantile severity models, and
    split-CQR calibration.
    """

    _instance = None

    def __init__(self, registry_path: str | os.PathLike[str] = "artifacts/model_registry/v2"):
        self.registry_path = Path(registry_path)
        self.metadata = self._load_json("metadata.json")
        self.feature_schema = self._load_json("feature_schema.json")
        self.probability_calibration = self._load_json("probability_calibration.json")
        self.cqr_params = self._load_json("cqr_calibration.json")

        self.classifier = cb.CatBoostClassifier()
        self.classifier.load_model(str(self.registry_path / "catboost_classifier.cbm"))
        # Compatibility alias for legacy callers/tests.
        self.model = self.classifier

        self.q05 = lgb.Booster(model_file=str(self.registry_path / "lightgbm_q05.txt"))
        self.q50 = lgb.Booster(model_file=str(self.registry_path / "lightgbm_q50.txt"))
        self.q95 = lgb.Booster(model_file=str(self.registry_path / "lightgbm_q95.txt"))

        self.decision_threshold = float(self.probability_calibration["decision_threshold"])

    def _load_json(self, filename: str) -> dict[str, Any]:
        with (self.registry_path / filename).open("r", encoding="utf-8") as f:
            return json.load(f)

    def calibrated_probability(self, features: pd.DataFrame) -> float:
        raw = float(self.classifier.predict_proba(features)[0, 1])
        x = np.asarray(self.probability_calibration["x_thresholds"], dtype=float)
        y = np.asarray(self.probability_calibration["y_thresholds"], dtype=float)
        return float(np.interp(raw, x, y))

    def _as_lightgbm_frame(self, features: pd.DataFrame) -> pd.DataFrame:
        out = features.copy()
        levels = self.feature_schema.get("category_levels", {})
        for col in self.feature_schema.get("cat_cols", []):
            categories = levels.get(col)
            if categories:
                # Unknown future categories become missing rather than receiving an
                # arbitrary ordinal code; this mirrors a conservative demo policy.
                out[col] = pd.Categorical(out[col].astype(str), categories=categories)
            else:
                out[col] = out[col].astype("category")
        return out

    def severity_if_delayed(self, features: pd.DataFrame) -> dict[str, Any]:
        """Predict delay days conditional on the shipment actually being late."""
        x = self._as_lightgbm_frame(features)
        q05 = float(self.q05.predict(x)[0])
        q50 = float(self.q50.predict(x)[0])
        q95 = float(self.q95.predict(x)[0])
        adjustment = float(self.cqr_params["q_adjustment"])

        low = max(0.0, q05 - adjustment)
        median = max(0.0, q50)
        high = max(low, q95 + adjustment)
        return {
            "p50": median,
            "interval_90": [low, high],
            "raw_quantiles": {"q05": q05, "q50": q50, "q95": q95},
            "definition": "delay days conditional on the shipment being late",
        }

    def shap_explanation(self, features: pd.DataFrame, top_k: int = 5) -> list[dict[str, Any]]:
        """Return real local CatBoost SHAP contributions for the late class."""
        cat_cols = self.feature_schema.get("cat_cols", [])
        pool = cb.Pool(features, cat_features=cat_cols)
        values = np.asarray(self.classifier.get_feature_importance(pool, type="ShapValues"))

        # Binary CatBoost normally returns (n, features + expected_value). Some
        # versions may expose a class dimension, so handle both representations.
        row = values[0]
        if row.ndim > 1:
            row = row[-1]
        contributions = np.asarray(row[:-1], dtype=float)
        names = list(features.columns)
        order = np.argsort(np.abs(contributions))[::-1][: max(1, int(top_k))]
        return [
            {
                "feature": names[i],
                "shap_value": float(contributions[i]),
                "direction": "increases_late_risk" if contributions[i] > 0 else "decreases_late_risk",
            }
            for i in order
        ]

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
