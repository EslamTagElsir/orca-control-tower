# ORCA Monitoring Evidence Layers

ORCA separates model validation, historical drift evaluation, and live production monitoring so evidence from one layer is never silently promoted into another.

## 1. Serving-registry reliability

Source: `backend/artifacts/model_registry/v2/serving_validation.json`

This layer reports locked temporal-holdout discrimination, calibration-oriented metrics, and severity CQR coverage. It is exposed through `GET /reliability` and the Model Monitor / Reports UI.

It is **not** live production telemetry.

## 2. Historical development drift

Source code: `backend/src/delay_intelligence/drift/`

The chronological drift engine supports feature, prediction, target, and uncertainty drift using PSI, Wasserstein, KS/FDR, JSD, chi-square, and trigger policy logic. `DriftRunner` is explicitly a development-CV evaluation runner and quarantines the final holdout by design.

Expected historical outputs, when generated, are:

- `artifacts/drift/drift_metrics.csv`
- `artifacts/drift/feature_drift_summary.csv`
- `artifacts/drift/drift_triggers.json`
- `artifacts/drift/cv_drift_summary.json`

These artifacts remain historical/development evidence and are not sufficient for a production-drift claim.

## 3. Live production drift

The production monitoring gateway is `artifacts/monitoring/latest.json`.

ORCA only reports production monitoring as `CONNECTED` when this file passes contract `1.0` and matches the active serving registry model and prediction-contract versions.

The formal JSON Schema is:

`backend/contracts/production_drift_artifact.schema.json`

The runtime validator is:

`backend/src/delay_intelligence/monitoring/readiness.py`

Required evidence includes:

- production evidence label;
- generation timestamp with timezone;
- active model version;
- active prediction contract version;
- versioned reference and detection windows;
- positive sample counts;
- SHA-256 provenance for both windows;
- feature and prediction drift statuses;
- optional target and uncertainty drift statuses;
- recalibration trigger decision and reasons;
- producer and pipeline run identifier.

Reference and detection windows must not overlap. An artifact generated for another model or prediction contract is rejected.

## Readiness endpoint

`GET /monitoring-readiness` reports:

- whether the drift engine is packaged;
- whether historical development artifacts are packaged;
- whether a valid production monitoring artifact is present;
- whether the live production claim is connected;
- explicit blockers when it is not connected.

Absence or invalidity is reported as `NOT_CONNECTED`. ORCA does not invent substitute drift values from fixtures, holdout metrics, or historical CV results.

## Operational promotion rule

A deployment may promote monitoring to `CONNECTED` only after its monitoring pipeline writes a valid `artifacts/monitoring/latest.json` for the same active model and prediction contract. The artifact should be immutable at the pipeline-run level even if `latest.json` is a pointer/copy of the most recent validated run.

A production implementation should also retain prior monitoring artifacts under a versioned/run-specific path for auditability.
