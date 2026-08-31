from __future__ import annotations

import json
from pathlib import Path

from delay_intelligence.monitoring.readiness import validate_production_drift_artifact

MODEL = "v2.0.0-demo"
CONTRACT = "v1.0"
HASH_A = "a" * 64
HASH_B = "b" * 64


def _artifact() -> dict:
    return {
        "contract_version": "1.0",
        "evidence_label": "PRODUCTION MONITORING",
        "generated_utc": "2026-08-31T10:00:00+00:00",
        "model_version": MODEL,
        "prediction_contract_version": CONTRACT,
        "reference_window": {
            "start": "2026-01-01T00:00:00+00:00",
            "end": "2026-03-01T00:00:00+00:00",
            "rows": 500,
            "data_sha256": HASH_A,
        },
        "detection_window": {
            "start": "2026-03-01T00:00:00+00:00",
            "end": "2026-08-30T00:00:00+00:00",
            "rows": 750,
            "data_sha256": HASH_B,
        },
        "drift": {
            "overall_status": "GREEN",
            "feature_status": "GREEN",
            "prediction_status": "GREEN",
            "target_status": None,
            "uncertainty_status": None,
            "trigger_recalibration": False,
            "trigger_reasons": [],
        },
        "source": {
            "pipeline_run_id": "prod-drift-20260831-001",
            "producer": "orca-monitoring-pipeline",
        },
    }


def _write(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_missing_artifact_is_not_connected(tmp_path: Path) -> None:
    result = validate_production_drift_artifact(tmp_path / "missing.json")

    assert result["valid"] is False
    assert result["artifact_present"] is False
    assert result["errors"]


def test_valid_artifact_matches_active_registry(tmp_path: Path) -> None:
    path = tmp_path / "latest.json"
    _write(path, _artifact())

    result = validate_production_drift_artifact(
        path,
        expected_model_version=MODEL,
        expected_prediction_contract_version=CONTRACT,
    )

    assert result["valid"] is True
    assert result["errors"] == []
    assert result["summary"]["overall_status"] == "GREEN"
    assert result["summary"]["pipeline_run_id"] == "prod-drift-20260831-001"


def test_model_or_prediction_contract_mismatch_blocks_connection(tmp_path: Path) -> None:
    path = tmp_path / "latest.json"
    _write(path, _artifact())

    result = validate_production_drift_artifact(
        path,
        expected_model_version="different-model",
        expected_prediction_contract_version="different-contract",
    )

    assert result["valid"] is False
    assert any("model_version" in error for error in result["errors"])
    assert any("prediction_contract_version" in error for error in result["errors"])


def test_overlapping_windows_are_rejected(tmp_path: Path) -> None:
    payload = _artifact()
    payload["detection_window"]["start"] = "2026-02-15T00:00:00+00:00"
    path = tmp_path / "latest.json"
    _write(path, payload)

    result = validate_production_drift_artifact(path)

    assert result["valid"] is False
    assert any("must not overlap" in error for error in result["errors"])
