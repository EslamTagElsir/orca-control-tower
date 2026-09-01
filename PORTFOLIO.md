# ORCA Control Tower — Portfolio Overview

**Operational Risk & Cost Analytics (ORCA)** is a deployed AI/ML decision-intelligence prototype for logistics and supply-chain operations.

It is designed around the operational sequence:

**Sense → Predict → Explain → Simulate → Decide**

Instead of stopping at descriptive dashboards, ORCA combines calibrated delay-risk prediction, conditional severity estimation, uncertainty intervals, explainability, what-if simulation, and operator-facing prioritization in one full-stack system.

## Live product

- **Application:** https://orca-control-tower.vercel.app
- **Frontend:** React 19, TypeScript, TanStack Start, Vite/Nitro
- **Backend:** FastAPI, Python
- **Deployment:** Vercel frontend + Railway backend
- **Architecture:** one monorepo with independently deployable frontend (`/`) and backend (`/backend`)

## What the system does

ORCA supports:

- calibrated shipment delay-risk scoring;
- delay-severity estimation;
- conformalized quantile uncertainty intervals;
- SHAP-based local explanations;
- operational decision recommendations;
- what-if scenario re-scoring;
- evidence-backed model reliability views;
- drift/monitoring readiness diagnostics;
- responsive control-tower, shipment, exception, network-map, simulator, and governance interfaces.

The browser communicates with the ML API through a same-origin allow-listed proxy rather than exposing arbitrary backend routing directly to the client.

## Machine-learning layer

The current decision-intelligence stack includes:

- **CatBoost** for calibrated late-risk classification;
- **Random Forest** as a sensitivity comparator in the research track;
- **LightGBM quantile models** for asymmetric delay-severity bounds;
- **Platt / sigmoid calibration** for probability reliability while preserving ranking;
- **Conformalized Quantile Regression (CQR)** for uncertainty intervals;
- **SHAP** for local predictive explanations;
- explicit frozen thresholds and model-registry contracts.

## Research validation

The public SCMS source population contains **10,324 shipments / 1,186 delayed shipments**. After the predeclared prediction-eligibility, temporal-anchor, and anomaly rules, the versioned strict modeling cohort contains **8,319 shipments / 1,169 delays**.

That strict cohort is partitioned into:

- **development:** `N = 7,306`, `1,108` delays, used for five expanding-origin temporal folds with 90-day embargoes;
- **secondary locked benchmark:** `N = 1,013`, `61` delays, historically evaluated by the serving registry and therefore not described as a newly untouched confirmatory holdout.

The five temporal validation windows contain **3,277 validation observations / 557 delayed validation observations** in total. Severity metrics are fold-level validation results over those delayed validation subsets rather than results over every delayed row in the full development cohort.

Selected documented findings:

| Evaluation | Result |
|---|---:|
| Random-split PR-AUC optimism vs temporal evaluation | **+26.2% to +99.7%** across tested classifiers |
| Locked benchmark CatBoost PR-AUC | **0.2709** |
| Locked benchmark CatBoost ROC-AUC | **0.7477** |
| Locked benchmark CatBoost recall at frozen research threshold | **73.8% (45/61)** |
| Nominal 90% CQR empirical coverage on locked benchmark | **91.8% (56/61)** |
| Nominal 90% CQR exact 95% CI | **81.9%–97.3%** |

In the **simulated decision-utility scenario**, uncertainty-aware ranking captured `53.3%` of high-severity delays at a `1%` inspection capacity versus `6.7%` for risk-only ranking. This is explicitly labeled simulated decision support, not realized business impact.

## Trust and evidence boundaries

ORCA deliberately separates:

- historical source-population counts;
- strict modeling/evaluation cohorts;
- model outputs;
- simulated what-if scenarios;
- synthetic live-operation/map demonstrations;
- production monitoring evidence.

The system does **not** present synthetic activity as real telemetry and does **not** label historical holdout metrics as live production drift. Until a valid production monitoring artifact is connected, monitoring readiness remains `NOT_CONNECTED` by design.

## Engineering and reproducibility

The repository contains:

- frontend production builds and container smoke tests;
- backend API, registry, reliability, and monitoring-contract tests;
- full-stack Docker proxy/runtime validation;
- research-specific cohort, quarantine, fold, artifact, and manifest integrity tests;
- versioned model/evidence contracts;
- portable research dependency and data-path configuration;
- reproducible figures, tables, benchmark outputs, and manuscript traceability.

Useful starting points:

- [`README.md`](README.md) — product and architecture overview
- [`docs/EVIDENCE_POLICY.md`](docs/EVIDENCE_POLICY.md) — evidence boundaries
- [`docs/REPRODUCIBILITY.md`](docs/REPRODUCIBILITY.md) — reproducibility workflow
- [`research/README.md`](research/README.md) — research workflow
- [`research/COHORT_COUNT_CORRECTION.md`](research/COHORT_COUNT_CORRECTION.md) — raw-vs-modeling cohort correction discovered by CI audit
- [`research/LOCKED_REGISTRY_BENCHMARK_RESULTS.md`](research/LOCKED_REGISTRY_BENCHMARK_RESULTS.md) — benchmark evidence
- [`research/manuscript/CLAIM_TRACEABILITY.md`](research/manuscript/CLAIM_TRACEABILITY.md) — scientific claim-to-evidence mapping

## Project team

**Eslam TagElsir Ali — Team Leader**

- Ahmed Shehta
- Mohamed Hassan
- Ahmed Ibrahim
- Osama Mohamed

## Current maturity

ORCA is a **deployed, technically validated prototype** intended for pilot-stage decision support and research validation. Real TMS/ERP/GPS/IoT integrations, organization-level authentication, and live production-drift evidence remain roadmap work until they are actually connected and validated.
