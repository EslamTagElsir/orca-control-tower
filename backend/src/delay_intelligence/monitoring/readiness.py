from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

_HASH_RE = re.compile(r"^[0-9a-fA-F]{64}$")
_ALLOWED_STATUSES = {"GREEN", "YELLOW", "RED", "INSUFFICIENT_SAMPLE"}


def _timestamp(value: Any, field: str, errors: list[str]) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{field} must be a non-empty ISO-8601 timestamp.")
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(f"{field} must be a valid ISO-8601 timestamp.")
        return None
    if parsed.tzinfo is None:
        errors.append(f"{field} must include a timezone offset.")
        return None
    return parsed


def _window(payload: Any, field: str, errors: list[str]) -> tuple[datetime | None, datetime | None]:
    if not isinstance(payload, dict):
        errors.append(f"{field} must be an object.")
        return None, None

    start = _timestamp(payload.get("start"), f"{field}.start", errors)
    end = _timestamp(payload.get("end"), f"{field}.end", errors)

    rows = payload.get("rows")
    if not isinstance(rows, int) or isinstance(rows, bool) or rows <= 0:
        errors.append(f"{field}.rows must be a positive integer.")

    data_hash = payload.get("data_sha256")
    if not isinstance(data_hash, str) or not _HASH_RE.fullmatch(data_hash):
        errors.append(f"{field}.data_sha256 must be a 64-character SHA-256 hex digest.")

    if start is not None and end is not None and start >= end:
        errors.append(f"{field}.start must be earlier than {field}.end.")

    return start, end


def validate_production_drift_artifact(
    path: str | Path,
    *,
    expected_model_version: str | None = None,
    expected_prediction_contract_version: str | None = None,
) -> dict[str, Any]:
    """Validate the minimum evidence needed for a production drift claim.

    This function does not calculate drift. It verifies a separately produced,
    versioned monitoring artifact so the serving API cannot promote historical
    holdout/CV evidence into live production status by accident.
    """
    artifact_path = Path(path)
    errors: list[str] = []

    if not artifact_path.exists():
        return {
            "valid": False,
            "artifact_present": False,
            "errors": ["Production drift artifact is not present."],
            "summary": None,
        }

    try:
        payload = json.loads(artifact_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {
            "valid": False,
            "artifact_present": True,
            "errors": [f"Production drift artifact could not be read as JSON: {exc}"],
            "summary": None,
        }

    if not isinstance(payload, dict):
        return {
            "valid": False,
            "artifact_present": True,
            "errors": ["Production drift artifact must contain a JSON object."],
            "summary": None,
        }

    if payload.get("contract_version") != "1.0":
        errors.append("contract_version must be 1.0.")
    if payload.get("evidence_label") != "PRODUCTION MONITORING":
        errors.append('evidence_label must be "PRODUCTION MONITORING".')

    model_version = payload.get("model_version")
    if not isinstance(model_version, str) or not model_version:
        errors.append("model_version must be a non-empty string.")
    elif expected_model_version and model_version != expected_model_version:
        errors.append("model_version does not match the active serving registry.")

    prediction_contract = payload.get("prediction_contract_version")
    if not isinstance(prediction_contract, str) or not prediction_contract:
        errors.append("prediction_contract_version must be a non-empty string.")
    elif expected_prediction_contract_version and prediction_contract != expected_prediction_contract_version:
        errors.append("prediction_contract_version does not match the active serving registry.")

    generated = _timestamp(payload.get("generated_utc"), "generated_utc", errors)
    ref_start, ref_end = _window(payload.get("reference_window"), "reference_window", errors)
    det_start, det_end = _window(payload.get("detection_window"), "detection_window", errors)

    if ref_end is not None and det_start is not None and ref_end > det_start:
        errors.append("reference_window and detection_window must not overlap.")
    if generated is not None and det_end is not None and generated < det_end:
        errors.append("generated_utc cannot be earlier than detection_window.end.")

    drift = payload.get("drift")
    if not isinstance(drift, dict):
        errors.append("drift must be an object.")
        drift = {}

    overall_status = drift.get("overall_status")
    if overall_status not in _ALLOWED_STATUSES:
        errors.append("drift.overall_status is not a recognized drift status.")

    for name in ("feature_status", "prediction_status"):
        if drift.get(name) not in _ALLOWED_STATUSES:
            errors.append(f"drift.{name} is not a recognized drift status.")

    for name in ("target_status", "uncertainty_status"):
        value = drift.get(name)
        if value is not None and value not in _ALLOWED_STATUSES:
            errors.append(f"drift.{name} is not a recognized drift status.")

    if not isinstance(drift.get("trigger_recalibration"), bool):
        errors.append("drift.trigger_recalibration must be boolean.")
    reasons = drift.get("trigger_reasons")
    if not isinstance(reasons, list) or not all(isinstance(item, str) for item in reasons):
        errors.append("drift.trigger_reasons must be an array of strings.")

    source = payload.get("source")
    if not isinstance(source, dict):
        errors.append("source must be an object.")
        source = {}
    if not isinstance(source.get("pipeline_run_id"), str) or not source.get("pipeline_run_id"):
        errors.append("source.pipeline_run_id must be a non-empty string.")
    if not isinstance(source.get("producer"), str) or not source.get("producer"):
        errors.append("source.producer must be a non-empty string.")

    summary = {
        "contract_version": payload.get("contract_version"),
        "generated_utc": payload.get("generated_utc"),
        "model_version": model_version,
        "prediction_contract_version": prediction_contract,
        "overall_status": overall_status,
        "reference_window": payload.get("reference_window"),
        "detection_window": payload.get("detection_window"),
        "pipeline_run_id": source.get("pipeline_run_id"),
    }

    return {
        "valid": not errors,
        "artifact_present": True,
        "errors": errors,
        "summary": summary,
    }
