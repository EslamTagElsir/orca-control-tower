# ORCA Research Track — Final Evaluation Gate Review & Policy Freeze

**Document ID**: `FINAL_GATE_REVIEW_V1`  
**Date**: 2026-08-31  
**Status**: `GATE_REVIEW_COMPLETED — POLICY_FROZEN`  
**Git Commit**: `6f71396ac38466c9d18e2706bea8688d9c2ea8ac`  
**Canonical Dataset SHA-256**: `918b992dd3e8d4b64d2a727b2c4ea607603d0c58f19484e73f7b78528c6a8673`  

---

## 1. Scientific Terminology & Evidence Hierarchy Correction

### 1.1 Corrected Terminology
To ensure complete scientific accuracy and prevent overclaiming:
- **Locked Registry Evaluation Set**: The temporal cohort spanning $T_{\text{pred}} \in [\text{2014-08-24}, \text{2015-08-24}]$ ($N = 1,013$ shipments, $61$ delays) is designated as the **"Locked Registry Evaluation Set"** (or *Locked Registry Benchmark*).
- **Correction of "Untouched / Unseen / Confirmatory" Claims**:
  - This set was previously evaluated by the ORCA production serving registry prior to the inception of the research track (recorded in `backend/artifacts/model_registry/v2/serving_validation.json`).
  - Therefore, this set is **not** globally "unseen", "untouched", or a "newly confirmatory holdout".
  - We strictly distinguish:
    1. **Research-Development Quarantine (Phase 2)**: During Phase 2 development experiments, this set was strictly quarantined and sealed from feature selection, hyperparameter tuning, and model comparison.
    2. **Historical Prior Evaluation**: The historical serving baseline had already established reference performance on this window.

### 1.2 Evidence Hierarchy
- **Primary Evidence Base**: The 5-fold expanding-origin temporal development evaluation ($N = 7,306$ shipments, $1,125$ delays) with 90-day embargoes constitutes the **primary empirical evidence base** for the research paper.
- **Secondary Evidence Base**: The Locked Registry Evaluation Set ($N = 1,013$ shipments, $61$ delays) serves strictly as a **secondary locked benchmark and replication check**, comparing against the historical serving baseline rather than functioning as an unpeeked confirmatory test.

---

## 2. Frozen Scientific Policies (Predeclared Before Any Registry Evaluation)

### 2.1 Selected Classifier Architecture
- **Primary Classifier**: **CatBoost Classifier** (iterations=300, learning_rate=0.05, depth=6, auto_class_weights="Balanced", random_seed=42).
- **Development Evidence**: CatBoost achieved the highest Mean ROC-AUC ($0.7401 \pm 0.0709$) and competitive Mean PR-AUC ($0.3164 \pm 0.1557$, peaking at $0.5216$ in Fold 2 and $0.3962$ in Fold 4), with the lowest standard deviation in Brier score among gradient boosted models ($0.1417 \pm 0.0418$).

### 2.2 Calibration Policy & Exact Selection Rationale
- **Development Empirical Tradeoff**:
  - **Isotonic Regression**: Achieves the lowest Mean Brier score ($0.1336 \pm 0.0536$) and lowest Mean ECE ($0.0760 \pm 0.0551$), but introduces discrete step-function binning that collapses ranking granularity on validation folds (Mean PR-AUC: $0.2730 \pm 0.1292$).
  - **Platt / Sigmoid Scaling**: Achieves strict continuous ranking preservation (Mean PR-AUC: $0.2999 \pm 0.1573$, Mean ROC-AUC: $0.6916 \pm 0.0846$) while significantly improving probability reliability over raw uncalibrated predictions (Mean Brier: $0.1357 \pm 0.0556$, Mean ECE: $0.0807 \pm 0.0501$).
- **Frozen Selection Policy**:
  - **Primary Calibrator for Operational Decision Triage**: **Platt / Sigmoid Scaling** is selected as the primary calibrator for ranking and triage because continuous monotonic risk discrimination is required for top-$K$ operational prioritization.
  - **Full Tabular Transparency**: All three variants (Raw, Platt Scaling, Isotonic Regression) will be reported in Table 3 of the paper.

### 2.3 Delay Severity Estimation Policy
- **Development Empirical Finding**:
  - On development delayed shipments, the **Conditional Median Baseline** achieves superior point estimation accuracy (Mean MAE: $15.62 \pm 6.43$ days; Median AE: $7.60 \pm 0.89$ days) compared to **LightGBM Quantile Regressors** (Mean MAE: $16.96 \pm 4.66$ days; Median AE: $8.74 \pm 1.64$ days).
  - Regularized linear regression (**Ridge**) performs substantially worse (Mean MAE: $23.76 \pm 3.92$ days; Median AE: $15.01 \pm 0.54$ days) due to heavy right-tail delay skewness.
- **Frozen Selection Policy**:
  - For point prediction of expected delay days, the Conditional Median baseline is acknowledged as the primary empirical point estimator.
  - LightGBM Quantile Regressors ($q_{0.05}, q_{0.50}, q_{0.95}$) are utilized **exclusively where asymmetric quantile modeling and Conformalized Quantile Regression (CQR) interval bounds are required**.

### 2.4 Conformal Reporting Policy
- **Frozen Reporting Mandate**:
  - All three nominal coverage levels—**$80\%$**, **$90\%$**, and **$95\%$**—must be reported unconditionally in the paper along with exact Clopper-Pearson binomial confidence intervals and mean/median interval widths.
  - Post-hoc selection or selective reporting of the "best-performing" coverage level is strictly prohibited.

### 2.5 Decision Threshold Policy
- **Frozen Threshold Rule**:
  - The decision threshold for binary classification is selected strictly on training fold predictions (maximizing training F1 score) and frozen prior to validation/benchmark application.

---

## 3. Corrected Empirical Findings on Random-Split Optimism (RQ1)

The observed relative PR-AUC inflation across all 5 models ranges from **$+26.2\%$ to $+99.7\%$**, with tree-based models suffering severe optimism due to temporal entity memorization:

| Model | Evaluation Status | Random Split PR-AUC | Temporal Mean PR-AUC | Absolute Inflation ($\Delta$) | Relative Inflation (%) | Random ROC-AUC | Temporal ROC-AUC |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **LightGBM** | DIAGNOSTIC ONLY | **0.5975** | **0.2992** | **+0.2983** | **+99.7%** | 0.8883 | 0.7277 |
| **XGBoost** | DIAGNOSTIC ONLY | **0.5591** | **0.2917** | **+0.2673** | **+91.6%** | 0.8779 | 0.7128 |
| **CatBoost** | DIAGNOSTIC ONLY | **0.5608** | **0.3164** | **+0.2445** | **+77.3%** | 0.8752 | 0.7401 |
| **Random Forest** | DIAGNOSTIC ONLY | **0.4780** | **0.3238** | **+0.1542** | **+47.6%** | 0.8453 | 0.7316 |
| **Logistic Regression** | DIAGNOSTIC ONLY | **0.3799** | **0.3011** | **+0.0789** | **+26.2%** | 0.8107 | 0.7132 |

---

## 4. Remaining Scientific & Publication Risks

1. **Small Positive Count in Locked Registry Set ($N=61$)**:
   - The Locked Registry Evaluation Set contains only 61 delayed shipments. Consequently, empirical coverage has a discrete granularity of $\approx 1.64\%$ per shipment, producing wider exact binomial confidence intervals.
   - *Mitigation*: The 5 temporal development folds ($N_{\text{delays}} = 1,125$) provide the primary statistical power; all registry metrics will be accompanied by exact Clopper-Pearson CIs.
2. **Distribution Shift Severity on Early Folds**:
   - Fold 0 exhibits low delay prevalence ($6.5\%$) compared to Fold 2 ($26.4\%$).
   - *Mitigation*: Documented explicitly in the temporal robustness analysis and figures.
3. **Operational Benefit Contextualization**:
   - Simulated intervention benefits depend on synthetic cost assumptions.
   - *Mitigation*: All operational utility metrics are explicitly labeled `SIMULATED SCENARIO`.

---

## 5. Formal Verdict

- **Phase 2 Development Gate**: **PASS**
- **Evaluation Set Policy**: **LOCKED REGISTRY EVALUATION SET (SECONDARY BENCHMARK ONLY)**
- **Recommendation**: **CONDITIONAL GO** (Ready for single one-pass locked registry evaluation upon explicit user command; evaluation code and labels remain unexecuted).
