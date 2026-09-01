# Supplementary Material Plan: Online Appendix

**Document ID**: `SUPPLEMENTARY_PLAN_V1`  
**Date**: 2026-08-31  

---

## Overview of Supplementary Sections

### Section S1: Dataset Features & Preprocessing Pipeline
- Complete feature schema table (26 numeric features, 13 categorical features).
- Imputation rules (median for continuous, `"Missing"` category token for nominals).
- One-Hot encoding dimensions for Linear and Random Forest models vs. Native categorical splitting for CatBoost and LightGBM.

### Section S2: Complete Expanding Temporal Fold Definitions
- Detailed tabular chronological breakdown of all 5 expanding training, validation, and embargo splits.
- Exact date timestamps and shipment counts per recipient country.

### Section S3: Model Hyperparameters & Hardware Configuration
- Full reproducible hyperparameter grids for Logistic Regression, Random Forest, XGBoost, LightGBM, and CatBoost.
- Compute environment details (Python 3.14, scikit-learn 1.6, CatBoost 1.2, LightGBM 4.5).

### Section S4: Full Calibration Reliability Tables & Per-Fold ECE
- Comprehensive fold-by-fold Brier score, ECE, PR-AUC, and ROC-AUC for Raw, Platt Scaling, and Isotonic Regression.

### Section S5: Multi-Level CQR Predictive Intervals
- Extended tabular results for Conformalized Quantile Regression across 70%, 75%, 80%, 85%, 90%, 95%, and 99% nominal coverage levels on development folds.
- Analysis of upper quantile tail behavior and extreme value bounds.

### Section S6: Complete Feature Ablation Matrix
- Full progression from baseline raw features ($A_0$) through full composite feature sets ($A_4$).

### Section S7: Cryptographic Provenance & Verification Contracts
- Full verbatim JSON copies of `FINAL_EVALUATION_FREEZE.json` and `LOCKED_REGISTRY_MANIFEST.json`.
- Complete SHA-256 hash chains for data, feature caches, models, and metric tables.
