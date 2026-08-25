# ORCA FastAPI — Railway deployment

This package is a deployment-only packaging pass over the existing ORCA backend.
No ML logic, thresholds, model artifacts, API contracts, SHAP logic, or decision
engine behavior has been changed.

## Runtime API

- GET /health
- POST /predict
- POST /explain
- POST /recommend

The current API loads:
- artifacts/model_registry/v2
- configs/decision.yaml
- artifacts/causal/causal_edge_stability.csv (optional exploratory hypotheses)

## Why this package differs from the old Dockerfile

The old Dockerfile copied model_registry/v1 even though the current API resolves
artifacts/model_registry/v2. This deployment package copies v2 and sets
PYTHONPATH=/app/src explicitly.

## Deploy to Railway

1. Create a new GitHub repository.
2. Upload the CONTENTS of this `orca-backend` folder to the repository root.
3. In Railway: New Project -> Deploy from GitHub Repo -> select the repository.
4. Railway should automatically detect the root `Dockerfile`.
5. In the Railway service Settings:
   - Healthcheck Path: /health
   - Public Networking: Generate Domain
6. In Variables, add:
   - RAILWAY_HEALTHCHECK_TIMEOUT_SEC=300
7. Deploy.

No custom Start Command is required; the Dockerfile reads Railway's PORT.

After deployment, open:

    https://YOUR-RAILWAY-DOMAIN/health

Expected shape:

    {
      "status": "ok",
      "model_version": "...",
      "registry_role": "...",
      "evidence_labels": [...]
    }

## Connect Lovable

Once /health works publicly, set this in the Lovable server environment:

    ORCA_API_INTERNAL_URL=https://YOUR-RAILWAY-DOMAIN

Use the base URL only (do not append /health).

Then redeploy/publish Lovable. The frontend server proxy will call:

    /api/orca/health
    /api/orca/predict
    /api/orca/explain
    /api/orca/recommend

and the OFFLINE FIXTURE DATA banner should disappear when /health is reachable.

## Provenance

Publishing the API does not change evidence semantics:
- REAL DATA remains REAL DATA
- model predictions/SHAP/recommendations remain MODEL OUTPUT
- frontend operational animation remains SYNTHETIC LIVE OPERATIONS
