# ORCA Research Track

This directory contains the isolated research workflow for the study:

**"Calibrated Delay Risk and Conformal Severity Prediction under Temporal Distribution Shift in Supply Chains"**

The research code is intentionally separated from the deployed serving registry so experiments cannot silently modify production model artifacts or API behavior.

## Directory structure

- `contracts/` — machine-readable experiment contracts freezing dataset hashes, prediction boundaries, and quarantine rules.
- `configs/` — structured experiment matrices for classifiers, calibration, temporal folds, severity, uncertainty, and ablation studies.
- `experiments/` — executable experiment runners.
- `scripts/` — data, statistical, and reproducibility utilities.
- `tests/` — automated research-integrity checks.
- `outputs/` — versioned metrics, tables, figures, the locked-registry manifest, and a portable feature cache.
- `manuscript/` — manuscript sources, evidence traceability, literature audits, and TRE submission workspace.

## Evidence hierarchy

The **five expanding-origin temporal development folds** (`N = 7,306`, `1,125` delayed shipments) are the primary research evidence base. The later `N = 1,013` / `61`-delay registry cohort is a **secondary locked replication benchmark**, because the deployed serving registry had historically evaluated that period before this research track existed.

This distinction is enforced throughout the final manuscript and benchmark reports to avoid describing the registry cohort as globally unseen or newly confirmatory.

## Data portability

The raw SCMS CSV is **not bundled in this repository**. Research code no longer depends on a machine-specific Windows path.

For raw-source verification or feature regeneration, set:

```bash
ORCA_SCMS_DATA_PATH=/absolute/path/to/SCMS_Delivery_History_Dataset.csv
```

PowerShell:

```powershell
$env:ORCA_SCMS_DATA_PATH = "C:\path\to\SCMS_Delivery_History_Dataset.csv"
```

The expected canonical SHA-256 is frozen in `research/scripts/data_utils.py`. If the raw file is not available, CI and peer review use the versioned `research/outputs/scms_research_features.parquet` cache and still verify temporal quarantine, fold disjointness, required artifacts, and locked-registry manifest integrity.

## Reproduce the integrity checks

From the repository root:

```bash
python -m venv .venv
```

Activate the environment, then install research dependencies:

```bash
python -m pip install --upgrade pip
python -m pip install -r research/requirements.txt
```

Run the integrity suite:

```bash
pytest -q research/tests/test_research_pipeline.py
```

If `ORCA_SCMS_DATA_PATH` is not set and the raw source is absent, only the raw-source hash test is skipped; the versioned-cache and research-artifact checks still run.

## Safety and governance rules

1. **Quarantine final registry cohort** — the cohort beginning `2014-08-24` must not be used for model selection, threshold tuning, or conformal calibration.
2. **Production isolation** — research experiments must never overwrite `backend/artifacts/model_registry/v2/` or deployed API routes.
3. **Reproducibility** — seeds, dataset hashes, temporal folds, thresholds, model roles, and benchmark provenance are frozen in machine-readable contracts and manifests.
4. **Evidence labeling** — historical holdout evidence, research-development evidence, simulated decision utility, synthetic operations, and live production monitoring must remain explicitly separated.
5. **No overclaiming** — the locked registry set is reported as a secondary replication benchmark, not as an untouched confirmatory holdout.

## Key review documents

- `FINAL_GATE_REVIEW.md` — scientific policy freeze and evidence hierarchy.
- `LOCKED_REGISTRY_BENCHMARK_RESULTS.md` — secondary benchmark results.
- `LOCKED_REGISTRY_REPLICATION_AUDIT.md` — comparison with the historical serving registry.
- `PUBLICATION_CLAIM_FREEZE.md` — publication-safe claim boundaries.
- `manuscript/CLAIM_TRACEABILITY.md` — claim-to-evidence mapping.
- `manuscript/TRE/` — venue-adapted manuscript and submission readiness materials.
