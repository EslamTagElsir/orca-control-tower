# ORCA Backend — Delay Intelligence Service

This directory contains the FastAPI/ML intelligence service used by the ORCA Control Tower frontend in the repository root.

The backend is intentionally deployable as an independent service while being versioned in the same monorepo as the frontend.

## Runtime API

The current frontend integration uses exactly four backend contracts:

| Endpoint | Method | Purpose |
|---|---:|---|
| `/health` | `GET` | Health, model version and serving metadata. |
| `/predict` | `POST` | Calibrated late-risk probability, classification decision, risk tier and conditional severity interval. |
| `/explain` | `POST` | Local SHAP predictive drivers plus explicitly exploratory causal candidates. |
| `/recommend` | `POST` | Decision-engine recommendation for a simulated decision scenario. |

The service does **not** require `/demo/*` routes for the current Control Tower.

## Serving Stack

The bundled `artifacts/model_registry/v2/` registry contains the serving artifacts used by the API:

- CatBoost late-risk classifier
- probability calibration metadata
- decision threshold metadata
- LightGBM q05/q50/q95 conditional severity models
- CQR/conformal calibration metadata
- feature schema and serving validation metadata

Additional decision and research configuration lives under `configs/`.

## Provenance

The API maintains explicit evidence boundaries:

- **REAL DATA** — source/holdout evidence used by the research/demo workflow
- **MODEL OUTPUT** — prediction and explanation results
- **SIMULATED SCENARIO** — recommendation/decision scenarios
- **EXPLORATORY ONLY** — causal candidates retained as hypotheses rather than identified causal effects

SHAP values explain model behavior. Exploratory graph evidence is not proof that an intervention will cause an outcome.

## Local Development

From the repository root:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment, then install the deployment runtime:

```bash
pip install -r requirements.railway.txt
```

Run the API from `backend/`:

```bash
PYTHONPATH=src uvicorn delay_intelligence.api.main:app --host 0.0.0.0 --port 8000 --reload
```

Windows PowerShell:

```powershell
$env:PYTHONPATH="src"
uvicorn delay_intelligence.api.main:app --host 0.0.0.0 --port 8000 --reload
```

Health check:

```text
http://127.0.0.1:8000/health
```

## Railway / Docker Deployment

When deploying this monorepo to Railway, configure the backend service with:

```text
Root Directory: /backend
```

The `backend/Dockerfile` then runs with `backend/` as its build context. Railway supplies `PORT`; the image uses `8000` as a local fallback.

See [`README_RAILWAY.md`](README_RAILWAY.md) for deployment-specific notes.

## Directory Layout

```text
backend/
├── src/delay_intelligence/
│   ├── api/                 # FastAPI routes and schemas
│   ├── serving/             # feature builder and model loader
│   ├── decision/            # decision engine
│   ├── causal/              # exploratory causal helpers
│   └── ...                  # research/support modules retained with the package
├── artifacts/
│   ├── model_registry/v2/   # serving model registry
│   └── causal/              # exploratory causal stability artifacts
├── configs/                 # serving, decision, model and research configuration
├── Dockerfile
├── pyproject.toml
└── requirements.railway.txt
```

Generated Python packaging metadata such as `src/delay_intelligence.egg-info/` is intentionally excluded from the monorepo.

## Scope

This remains a research-validated / demonstration-oriented decision intelligence prototype. Production use would require prospective operational validation, authentication/authorization, observability, governance, real integration contracts, and measured intervention outcomes.
