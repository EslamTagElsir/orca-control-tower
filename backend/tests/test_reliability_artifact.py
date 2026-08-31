from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

REGISTRY = Path(__file__).resolve().parents[1] / "artifacts" / "model_registry" / "v2"


def _load(name: str) -> dict:
    with (REGISTRY / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _date(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_registry_and_validation_share_the_same_data_hash() -> None:
    metadata = _load("metadata.json")
    validation = _load("serving_validation.json")

    assert metadata["raw_data_sha256"] == validation["data_sha256"]
    assert re.fullmatch(r"[0-9a-fA-F]{64}", validation["data_sha256"])


def test_temporal_split_order_is_strict_and_non_overlapping() -> None:
    splits = _load("serving_validation.json")["splits"]

    train_end = _date(splits["train"]["end_exclusive"])
    calibration_start = _date(splits["calibration"]["start"])
    calibration_end = _date(splits["calibration"]["end_exclusive"])
    holdout_start = _date(splits["holdout"]["start"])
    holdout_end = _date(splits["holdout"]["end"])

    assert train_end < calibration_start
    assert calibration_start < calibration_end
    assert calibration_end <= holdout_start
    assert holdout_start < holdout_end
    assert splits["embargo_days"] >= 0


def test_classification_metrics_are_valid_probabilistic_scores() -> None:
    classification = _load("serving_validation.json")["classification"]

    for name in (
        "pr_auc",
        "roc_auc",
        "f1",
        "precision",
        "recall",
        "balanced_accuracy",
        "brier_score",
        "decision_threshold",
    ):
        assert 0.0 <= float(classification[name]) <= 1.0, name


def test_cqr_evidence_is_internally_consistent() -> None:
    validation = _load("serving_validation.json")
    severity = validation["severity_cqr"]
    holdout_rows = int(validation["splits"]["holdout"]["rows"])

    nominal = float(severity["nominal_coverage"])
    empirical = float(severity["empirical_coverage_delayed_only"])

    assert 0.0 < nominal <= 1.0
    assert 0.0 <= empirical <= 1.0
    assert 0 <= int(severity["holdout_delayed_rows"]) <= holdout_rows
    assert float(severity["mean_interval_width_delayed_only"]) >= 0.0
    assert float(severity["median_interval_width_delayed_only"]) >= 0.0
    assert severity["target"]


def test_registry_declares_prediction_contract_version() -> None:
    metadata = _load("metadata.json")

    assert metadata["prediction_contract_version"]
    assert metadata["model_version"]
    assert metadata["registry_role"]
