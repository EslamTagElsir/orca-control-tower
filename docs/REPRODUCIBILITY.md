# ORCA Reproducibility Guide

This document defines the minimum evidence required to reproduce and review the ORCA serving-registry evaluation without turning the production UI into a second evaluation pipeline.

## Source of truth

The serving registry under `backend/artifacts/model_registry/v2/` is the source of truth for the currently packaged model version and its frozen validation evidence.

Key files include:

- `metadata.json` — model version, registry role, prediction contract, raw-data hash, evidence labels, and registry creation metadata.
- `serving_validation.json` — untouched temporal holdout metrics, temporal split chronology, evaluation role, and evaluation data hash.
- calibration and model artifacts used by the serving pipeline.

## Temporal evaluation contract

The validation artifact must preserve an ordered train → embargo → calibration → holdout chronology. The holdout is not used for fitting, threshold calibration, or conformal calibration.

Automated tests verify that:

- train ends before calibration begins;
- calibration ends no later than holdout begins;
- embargo duration is non-negative;
- classification metrics and decision threshold are in valid probability-score ranges;
- CQR coverage and interval widths are internally consistent;
- the registry and validation artifacts refer to the same source-data SHA-256;
- model and prediction-contract versions are declared.

## CI gates

Pull requests run two focused CI jobs:

1. Frontend targeted lint plus a full production build.
2. Backend source compilation plus API leakage-contract and registry-integrity tests.

The frontend lint is intentionally targeted because the repository contains pre-existing generated/legacy formatting debt outside the ORCA reliability surface. The full build still validates integration across the application.

## Reproducing the current checks locally

Frontend:

```bash
bun install --frozen-lockfile
bunx eslint src/lib/orca/reliability.ts src/routes/model-monitor.tsx src/routes/reports.tsx 'src/routes/api/orca/$.ts' --rule 'prettier/prettier: off'
bun run build
```

Backend contract checks:

```bash
python -m pip install --upgrade pip pytest pydantic PyYAML
python -m compileall -q backend/src
PYTHONPATH=backend/src pytest -q backend/tests/test_api_schemas.py backend/tests/test_reliability_artifact.py
```

On PowerShell, set `PYTHONPATH` with `$env:PYTHONPATH = "backend/src"` before running pytest.

## Interpretation boundary

Passing these checks verifies code integration, leakage guards, artifact consistency, and the integrity of the frozen evidence contract. It does not prove live production reliability, absence of distribution drift, or causal effectiveness after deployment. Those require separately collected and versioned production evidence.
