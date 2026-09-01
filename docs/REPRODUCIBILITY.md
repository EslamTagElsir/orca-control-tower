# ORCA Reproducibility Guide

This document explains how to reproduce and review ORCA's deployed serving-registry checks and its isolated research-integrity checks without mixing production evidence with experimental evaluation.

## 1. Sources of truth

### Deployed serving registry

The currently packaged production-style model evidence lives under:

```text
backend/artifacts/model_registry/v2/
```

Key artifacts include:

- `metadata.json` — model version, registry role, prediction contract, source-data hash, and evidence labels.
- `serving_validation.json` — frozen historical evaluation metrics and chronology.
- model/calibration artifacts used by the serving pipeline.
- production-monitoring artifacts only when they satisfy the explicit monitoring contract.

Historical registry evidence must not be presented as live production drift.

### Research track

The isolated research workflow lives under:

```text
research/
```

Its sources of truth include frozen experiment contracts, temporal-fold outputs, benchmark manifests, versioned tables/figures, and the manuscript claim-traceability documents. Research experiments must never overwrite the serving registry.

## 2. Deployment architecture

The monorepo has two independently deployable services:

- frontend at repository root (`/`) — TanStack Start / React / TypeScript, deployed to Vercel;
- backend at `/backend` — FastAPI, deployed to Railway.

The frontend calls the backend through the same-origin allow-listed `/api/orca/*` proxy, with the backend base URL supplied server-side through `ORCA_API_INTERNAL_URL`.

## 3. Main CI gates

`.github/workflows/ci.yml` validates the deployable product through three jobs:

1. **Frontend lint, build, and container smoke**
   - frozen Bun install;
   - Lovable build/runtime dependency guard;
   - Vercel deployment-contract check;
   - targeted ORCA lint;
   - full production build;
   - Vercel-target build;
   - standalone frontend Docker HTTP smoke test.

2. **Backend contracts and artifact integrity**
   - Railway deployment-contract check;
   - Python compilation;
   - API schema checks;
   - serving-registry reliability checks;
   - drift/production-monitoring contract checks.

3. **Full-stack Docker runtime and proxy smoke**
   - builds backend and frontend containers together;
   - verifies backend `/health`, `/reliability`, and `/monitoring-readiness`;
   - verifies the same responses through the frontend `/api/orca/*` proxy.

## 4. Research CI gate

`.github/workflows/research-ci.yml` runs when research or relevant backend-contract files change. It:

- installs `research/requirements.txt`;
- compiles the research source;
- executes `research/tests/test_research_pipeline.py`;
- checks the versioned feature cache;
- checks temporal quarantine and fold disjointness;
- checks required research artifacts and the locked-registry manifest;
- confirms the research tree and production registry remain separate.

The raw SCMS CSV is intentionally not required in GitHub Actions. Raw-source verification can be run locally by setting `ORCA_SCMS_DATA_PATH`; CI uses the versioned research feature cache for portable integrity checks.

## 5. Reproduce product checks locally

### Frontend

```bash
bun install --frozen-lockfile
bun run build
```

Optional targeted lint equivalent to CI:

```bash
bunx eslint \
  src/components/orca/AppShell.tsx \
  src/lib/orca/reliability.ts \
  src/lib/orca/monitoring.ts \
  src/routes/model-monitor.tsx \
  src/routes/monitoring-readiness.tsx \
  src/routes/reports.tsx \
  src/routes/settings.tsx \
  'src/routes/api/orca/$.ts' \
  --rule 'prettier/prettier: off'
```

### Backend

```bash
python -m pip install --upgrade pip pytest pydantic PyYAML
python -m compileall -q backend/src
```

Linux/macOS:

```bash
PYTHONPATH=backend/src pytest -q \
  backend/tests/test_api_schemas.py \
  backend/tests/test_reliability_artifact.py \
  backend/tests/test_drift_readiness_contract.py \
  backend/tests/test_production_monitoring_contract.py
```

PowerShell:

```powershell
$env:PYTHONPATH = "backend/src"
pytest -q backend/tests/test_api_schemas.py backend/tests/test_reliability_artifact.py backend/tests/test_drift_readiness_contract.py backend/tests/test_production_monitoring_contract.py
```

## 6. Reproduce research-integrity checks locally

Create/activate a Python 3.11 environment, then:

```bash
python -m pip install --upgrade pip
python -m pip install -r research/requirements.txt
pytest -q research/tests/test_research_pipeline.py
```

To verify or regenerate from the canonical raw SCMS source, set:

```bash
ORCA_SCMS_DATA_PATH=/absolute/path/to/SCMS_Delivery_History_Dataset.csv
```

PowerShell:

```powershell
$env:ORCA_SCMS_DATA_PATH = "C:\path\to\SCMS_Delivery_History_Dataset.csv"
```

The expected raw-data SHA-256 is frozen in the research data utility. If the raw file is absent, the raw-source test skips while the versioned-cache and artifact-integrity checks still run.

## 7. Interpretation boundary

Passing these checks verifies code integration, deployment contracts, leakage guards, versioned artifact consistency, and research provenance. It does **not** prove:

- future production reliability under arbitrary distribution shift;
- live production drift when no production monitoring artifact is connected;
- causal effectiveness of an intervention;
- realized financial savings from simulated decision scenarios;
- universal generalization beyond the evaluated historical logistics dataset.

Those claims require separately collected, versioned, real-world evidence.
