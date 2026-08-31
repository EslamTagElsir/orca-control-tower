# ORCA Research Track

This directory contains the isolated, research-only experimentation scaffold for the study:

**"Calibrated Delay Risk and Conformal Severity Prediction under Temporal Distribution Shift in Supply Chains"**

## Directory Structure

- `contracts/`: Machine-readable experiment contracts freezing dataset hashes, prediction boundaries, and quarantine rules.
- `configs/`: Structured experimental matrix configurations (classifiers, calibration methods, temporal folds, severity models, uncertainty levels, ablation stages).
- `experiments/`: Experiment execution runners and documentation.
- `scripts/`: Modular evaluation, metric calculation, and visualization scripts.
- `notebooks/`: Exploratory analysis and paper figure generation notebooks.
- `tests/`: Automated contract and regression tests for research pipelines.
- `outputs/`: Generated metrics, tables, and figures (isolated from production model registry).
  - `metrics/`: JSON metric summaries.
  - `tables/`: LaTeX and Markdown evaluation tables.
  - `figures/`: High-resolution figures for publication.

## Safety & Governance Rules

1. **Quarantine Final Holdout**: The final frozen holdout (2014-08-24 -> 2015-08-24) is strictly quarantined and must never be used for model selection, threshold tuning, or CQR calibration.
2. **Production Isolation**: Experimental runs must never overwrite `backend/artifacts/model_registry/v2/` or modify deployed API routes.
3. **Reproducibility**: All experiments must run with explicit seeds, recorded environment dependencies, and SHA-256 data verification.
