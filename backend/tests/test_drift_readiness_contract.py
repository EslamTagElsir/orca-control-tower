from __future__ import annotations

from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
DRIFT_PACKAGE = BACKEND / "src" / "delay_intelligence" / "drift"
DRIFT_CONFIG = BACKEND / "configs" / "drift.yaml"
DRIFT_ARTIFACTS = BACKEND / "artifacts" / "drift"

EXPECTED_ENGINE_FILES = {
    "detector.py",
    "metrics.py",
    "policy.py",
    "runner.py",
    "schemas.py",
}
EXPECTED_HISTORICAL_ARTIFACTS = {
    "drift_metrics.csv",
    "feature_drift_summary.csv",
    "drift_triggers.json",
    "cv_drift_summary.json",
}


def test_drift_engine_and_configuration_are_present() -> None:
    assert DRIFT_CONFIG.exists()
    assert EXPECTED_ENGINE_FILES <= {path.name for path in DRIFT_PACKAGE.iterdir() if path.is_file()}


def test_runner_is_explicitly_historical_and_quarantines_final_holdout() -> None:
    text = (DRIFT_PACKAGE / "runner.py").read_text(encoding="utf-8").lower()

    assert "historical development drift evaluation" in text
    assert "final holdout" in text
    assert "strictly excludes" in text or "strict quarantine" in text


def test_any_packaged_drift_artifacts_follow_the_historical_contract() -> None:
    if not DRIFT_ARTIFACTS.exists():
        return

    present = {path.name for path in DRIFT_ARTIFACTS.iterdir() if path.is_file()}
    assert EXPECTED_HISTORICAL_ARTIFACTS <= present
