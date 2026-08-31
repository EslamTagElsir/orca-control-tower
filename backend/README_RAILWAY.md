# ORCA FastAPI — Railway deployment

The canonical ORCA backend lives in the `backend/` directory of the `orca-control-tower` monorepo. Railway should deploy this directory directly; do not create or maintain a second copy of the backend source.

## Runtime API

The FastAPI service exposes six frontend-facing contracts:

- `GET /health` — service/model health and serving metadata.
- `GET /reliability` — frozen serving-registry temporal-holdout evidence.
- `GET /monitoring-readiness` — drift-engine and production-monitoring evidence readiness.
- `POST /predict` — calibrated late-risk probability and severity uncertainty.
- `POST /explain` — local SHAP drivers plus explicitly exploratory causal candidates.
- `POST /recommend` — decision-engine recommendation for a simulated decision request.

`/reliability` is **not** live production telemetry. `/monitoring-readiness` is designed to remain `NOT_CONNECTED` until a valid production monitoring artifact exists.

## Runtime assets

The service uses:

- `artifacts/model_registry/v2/`
- `configs/decision.yaml`
- `configs/drift.yaml`
- `artifacts/causal/causal_edge_stability.csv` when available for exploratory hypotheses
- `artifacts/monitoring/latest.json` only when a real production monitoring pipeline has produced one

A missing production monitoring artifact does not block prediction serving. It only prevents ORCA from making a live production-drift claim.

## Railway configuration

Use the same GitHub repository for both deployable services.

For the backend service configure Railway **Root Directory** as:

```text
/backend
```

Railway then builds the `Dockerfile` located inside that directory.

Recommended backend settings:

- Root Directory: `/backend`
- Dockerfile: `Dockerfile`
- Healthcheck Path: `/health`
- Public Networking: enabled / generated domain
- Variable: `RAILWAY_HEALTHCHECK_TIMEOUT_SEC=300`

No custom start command is required. The Dockerfile starts FastAPI on Railway's injected `PORT`.

## Deployment verification

After Railway deploys, verify the public backend base URL directly.

### 1. Health

```text
https://YOUR-RAILWAY-DOMAIN/health
```

Expected shape:

```json
{
  "status": "ok",
  "model_version": "v2.0.0-demo",
  "registry_role": "...",
  "evidence_labels": ["REAL DATA", "MODEL OUTPUT", "SIMULATED SCENARIO"]
}
```

`/health` loads the packaged serving registry, so a successful response is a model-runtime check rather than a static liveness placeholder.

### 2. Frozen reliability evidence

```text
https://YOUR-RAILWAY-DOMAIN/reliability
```

Verify that the response includes the active model version, prediction contract version, temporal split, classification evidence, CQR evidence, and evaluation-data SHA-256.

### 3. Monitoring readiness

```text
https://YOUR-RAILWAY-DOMAIN/monitoring-readiness
```

A valid response may legitimately report:

```json
{
  "status": "NOT_CONNECTED",
  "production_monitoring_connected": false
}
```

That is the correct state until `artifacts/monitoring/latest.json` exists and passes production monitoring contract `1.0` for the active serving model.

Do not replace this state with fabricated drift values.

## Connect the standalone frontend

The frontend is independently deployable from the repository root with its own Dockerfile. It does not require Lovable.

For the frontend service use repository root `/` and configure the backend **base URL only** as a server-side environment variable:

```text
ORCA_API_INTERNAL_URL=https://YOUR-RAILWAY-DOMAIN
```

`ORCA_API_URL` is supported as a fallback, but `ORCA_API_INTERNAL_URL` is preferred for the server-side proxy.

The frontend's allow-listed same-origin proxy exposes:

```text
/api/orca/health
/api/orca/reliability
/api/orca/monitoring-readiness
/api/orca/predict
/api/orca/explain
/api/orca/recommend
```

When `/api/orca/health` is reachable through the frontend, the application should leave the offline fixture connection state. Reliability and monitoring surfaces still keep their own evidence boundaries.

## Full-stack runtime proof in CI

GitHub Actions builds the actual backend production Dockerfile, starts it on an isolated Docker network, and verifies:

- `/health` loads the active serving model;
- `/reliability` returns the registry-backed evidence contract;
- `/monitoring-readiness` returns a valid truthful readiness state.

The workflow then builds and starts the standalone frontend production container with:

```text
ORCA_API_INTERNAL_URL=http://orca-backend-ci:8000
```

and verifies that the same three responses are available through `/api/orca/*` and are semantically identical to the direct backend responses.

CI run **#44** passed this complete backend-to-frontend Docker runtime/proxy smoke test.

This proves the repository deployment shape before external hosting. It does **not** by itself prove that a particular Railway deployment is current; the public hosted service must still be checked after deploy.

## Production monitoring promotion rule

Live production drift is considered connected only when:

1. the packaged chronological drift engine/config is available;
2. `artifacts/monitoring/latest.json` exists;
3. the artifact satisfies the production monitoring contract and runtime validator;
4. reference and detection windows are versioned, non-overlapping, and carry SHA-256 provenance;
5. the artifact's `model_version` and `prediction_contract_version` match the active serving registry.

See [`../docs/MONITORING.md`](../docs/MONITORING.md) for the full evidence-layer policy.

## Provenance

Publishing the API does not change evidence semantics:

- **REAL DATA** remains source/holdout evidence.
- **MODEL OUTPUT** remains model-derived prediction or explanation.
- **SIMULATED SCENARIO** remains a what-if input/context.
- Historical development drift is not production drift.
- Production monitoring must come from its own validated production artifact.

## Legacy backend repository

The monorepo `backend/` directory is the canonical source. Keep the legacy `EslamTagElsir/orca-backend` repository only as temporary rollback/reference material until the monorepo Railway deployment and external frontend integration have been verified. Archive it after that verification rather than maintaining two divergent backends.
