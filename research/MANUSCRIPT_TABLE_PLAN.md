# ORCA Research Track — Manuscript Table Plan

**Document ID**: `MANUSCRIPT_TABLE_PLAN_V1`  
**Date**: 2026-08-31  
**Status**: `TABLE_PLAN_FROZEN`  

---

## Overview of Manuscript Tables

| Table Number | Title | Primary Purpose | Underlying Data / Artifact Source |
| :---: | :--- | :--- | :--- |
| **Table 1** | **Dataset Summary & Temporal Split Protocol** | Define USAID SCMS cohort statistics, expanding temporal development folds, 90-day embargoes, calibration buffers, and locked registry window. | `research/outputs/metrics/temporal_fold_manifest.csv` |
| **Table 2** | **Temporal Classifier Benchmark & Random-Split Optimism** | Report 5-fold temporal development mean/SD metrics (PR-AUC, ROC-AUC, Brier) vs. random-split estimates across 5 models, documenting relative PR-AUC inflation. | `research/outputs/tables/classification_summary.csv`, `research/outputs/tables/random_vs_temporal.csv` |
| **Table 3** | **Probability Calibration Comparison** | Compare Raw, Platt Scaling, and Isotonic Regression across CatBoost and Random Forest on development folds (Brier, ECE, PR-AUC). | `research/outputs/tables/calibration_summary.csv` |
| **Table 4** | **Conditional Delay-Severity Benchmark** | Evaluate point-prediction MAE and Median AE on truly delayed shipments (Conditional Median vs. LightGBM Quantiles vs. Ridge). | `research/outputs/tables/severity_summary.csv` |
| **Table 5** | **Conformalized Quantile Regression (CQR) Coverage & Sharpness** | Present empirical coverage, exact Clopper-Pearson 95% CIs, and mean/median prediction interval widths across 80%, 90%, and 95% nominal levels. | `research/outputs/tables/conformal_summary.csv` |
| **Table 6** | **Secondary Locked Registry Benchmark Evaluation** | Side-by-side reporting of CatBoost (Primary Model) and Random Forest (Sensitivity Comparator) on the Locked Registry Evaluation Set ($N=1,013$). | `research/outputs/tables/locked_registry_classification.csv`, `research/outputs/tables/development_vs_registry.csv` |
| **Table 7** | **Operational Capacity-Constrained Prioritization [SIMULATED SCENARIO]** | Compare Risk-Only, Risk $\times$ Severity, and Uncertainty-Aware triage across $K \in \{1\%, 5\%, 10\%, 20\%\}$ inspection bandwidths. | `research/outputs/tables/locked_registry_decision_utility.csv` |

---

## Detailed Table Schemas & Captions

### Table 1: Dataset Summary & Temporal Split Protocol
- **Caption**: *Chronological structure of the USAID SCMS Delivery History dataset ($N=10,324$), detailing the 5 expanding-origin development folds, 90-day temporal embargoes, 6-month calibration buffer, and the secondary locked registry benchmark.*
- **Columns**: Split Identifier, Temporal Window ($T_{\text{pred}}$ Range), Total Shipments ($N$), Delayed Shipments ($N_{\text{pos}}$), Delay Prevalence (%), Scientific Function.

### Table 2: Temporal Classifier Benchmark & Random-Split Optimism (RQ1)
- **Caption**: *Performance of candidate delay-risk classifiers under 5-fold expanding temporal cross-validation versus standard 5-fold random cross-validation. Relative PR-AUC inflation measures the degree of performance overestimation induced by random splitting.*
- **Columns**: Classifier Architecture, Temporal Mean PR-AUC ($\pm$ SD), Temporal Mean ROC-AUC ($\pm$ SD), Temporal Mean Brier Score, Random-Split PR-AUC, Relative PR-AUC Inflation ($\Delta\%$).

### Table 3: Probability Calibration Comparison (RQ2)
- **Caption**: *Comparison of probability calibration methods on temporal validation folds. Platt scaling reduces calibration error while preserving continuous ranking (PR-AUC), whereas Isotonic regression achieves lower ECE at the expense of discrete score quantization.*
- **Columns**: Model, Calibration Strategy, Brier Score ($\pm$ SD), Expected Calibration Error (ECE 10-bins, $\pm$ SD), Validation PR-AUC.

### Table 4: Conditional Delay-Severity Benchmark (RQ3)
- **Caption**: *Point-prediction error for delay duration (in days) evaluated exclusively on delayed shipments ($N_{\text{del}}$) across temporal folds. Lower MAE indicates superior expected point estimation.*
- **Columns**: Severity Model, Evaluated Cohort ($N_{\text{del}}$), Mean Absolute Error (MAE, days $\pm$ SD), Median Absolute Error (MedAE, days $\pm$ SD), Pinball Loss $q_{0.50}$.

### Table 5: Conformalized Quantile Regression (CQR) Coverage & Sharpness (RQ4)
- **Caption**: *Empirical coverage and predictive interval sharpness for split Conformalized Quantile Regression (CQR) across 80%, 90%, and 95% nominal confidence levels on temporal development folds.*
- **Columns**: Nominal Coverage ($1-\alpha$), Empirical Coverage Rate ($\pm$ SD), Coverage Error ($\Delta$), Mean Prediction Interval Width (Days $\pm$ SD), Median Interval Width (Days), Mean Conformal Adjustment ($\bar{Q}$).

### Table 6: Secondary Locked Registry Benchmark Evaluation
- **Caption**: *Secondary replication benchmark on the historically evaluated Locked Registry Evaluation Set ($N=1,013$, $T_{\text{pred}} \in [\text{2014-08-24}, \text{2015-08-24}]$, delay prevalence $6.02\%$). CatBoost represents the deployment-aligned production architecture; Random Forest represents the pre-registered development PR-AUC sensitivity comparator.*
- **Columns**: Model, Predeclared Role, Calibration, Frozen Threshold ($\tau^*$), PR-AUC, ROC-AUC, Brier Score, ECE (10-bins), Precision, Recall, F1 Score, Balanced Accuracy.

### Table 7: Operational Capacity-Constrained Prioritization `[SIMULATED SCENARIO]` (RQ5)
- **Caption**: *Simulated operational triage performance under constrained inspection capacity ($K \in \{1\%, 5\%, 10\%, 20\%\}$) on the locked benchmark ($N=1,013$, $61$ delays, $15$ high-severity delays $>14$ days). Prioritization strategies compare naive risk, expected severity, and uncertainty-aware scoring.*
- **Columns**: Inspection Capacity ($K$), Inspected Shipments, Prioritization Strategy, Delayed Captured ($/61$), Recall@K (%), High-Severity Captured ($/15$), High-Severity Recall@K (%), Delay-Days Captured, Delay-Days Capture Ratio (%).
