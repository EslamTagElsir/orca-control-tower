# ORCA Research Preflight

**Study Direction**: *"Calibrated Delay Risk and Conformal Severity Prediction under Temporal Distribution Shift in Supply Chains"*  
**Repository**: `orca-control-tower` (Local Branch: `research/paper-experiments-v1`)  
**Audit Date**: 2026-08-31  
**Teamwork Mode**: Coordinated Multi-Agent Scientific & Engineering Preflight  

---

## 1. Executive Recommendation

**Verdict**: `CONDITIONAL PASS`

### Consensus Summary
The ORCA repository demonstrates exceptional software and data engineering discipline, including rigorous machine-readable prediction contracts, strict temporal separation, zero forbidden-feature leakage, and frozen evidence artifacts. The technical core is completely sound and ready for research experimentation.

However, moving from a production decision-intelligence prototype to a top-tier peer-reviewed publication requires meeting four non-negotiable scientific conditions:
1. **Quarantine Final Holdout**: The final holdout window (2014-08-24 to 2015-08-24) must remain strictly quarantined for final one-shot reporting; all model selection and hyperparameter exploration must occur strictly across historical expanding-origin validation folds.
2. **Explicit Sample-Size Framing**: Acknowledge that the final holdout contains only $N=61$ delayed shipments, which introduces wide finite-sample uncertainty for severity and conformal coverage metrics ($95\%$ binomial CI: $[86.3\%, 99.0\%]$).
3. **Simulated Decision Claims**: Operational utility and financial savings must be explicitly designated as *Simulated Scenarios* rather than empirical observational savings, given synthetic intervention efficacy assumptions.
4. **Comprehensive Baseline Suite**: Benchmark against standard baselines (Logistic Regression, Random Forest, XGBoost, LightGBM, Empirical Median) under identical temporal validation protocols.

---

## 2. Proposed Paper

### Working Title
**"Calibrated Delay Risk and Conformal Severity Prediction under Temporal Distribution Shift in Supply Chains"**

### Core Research Questions (RQs)
- **RQ1 (Evaluation Protocol)**: How does leakage-safe expanding-origin temporal evaluation differ from standard random-split cross-validation in estimating shipment delay risk, and what is the magnitude of optimistic bias introduced by temporal leakage?
- **RQ2 (Risk Calibration)**: Does post-hoc probability calibration (Platt scaling vs. Isotonic regression) improve the reliability (Brier score, ECE, reliability diagrams) of tree-based delay classifiers under extreme temporal class imbalance?
- **RQ3 (Conditional Severity & Conformal Uncertainty)**: Can conditional delay severity (delay days given late delivery) be estimated with distribution-free finite-sample coverage guarantees using Split Conformalized Quantile Regression (CQR)?
- **RQ4 (Temporal Robustness & Distribution Shift)**: How resilient are calibrated risk scores and conformal prediction intervals under rolling temporal distribution shift, and can adaptive recalibration restore target coverage?
- **RQ5 (Operational Decision Utility)**: Does integrating calibrated risk probability, conditional severity, and conformal uncertainty improve Top-$K$ operational prioritization (Recall@$K$, high-severity delay-days captured) compared to standard risk-probability ranking alone?

---

## 3. Verified Repository Evidence

All evidence below is verified directly from repository artifacts and source code:

| Component | Repository Path | Verified Status / Checksum | Scientific Role |
|---|---|---|---|
| **Raw Dataset** | `E:/delay_intelligence_system/data/raw/SCMS_Delivery_History_Dataset.csv` | SHA-256: `918b992dd3e8d4b64d2a727b2c4ea607603d0c58f19484e73f7b78528c6a8673` | Canonical primary dataset (10,324 rows, 33 columns) |
| **Prediction Contract** | `backend/configs/prediction_contract.yaml` | Version `1.0.0` | Machine-enforced prediction boundary ($T_{\text{pred}}$) & forbidden features |
| **Feature Config** | `backend/configs/features.yaml` | Version `1.0.0` | Feature definitions, transformations, and point-in-time rules |
| **Model Config** | `backend/configs/models.yaml` | Present | Hyperparameters for CatBoost, LightGBM, Logistic Regression |
| **Evaluation Config** | `backend/configs/evaluation.yaml` | Present | 5-fold expanding temporal validation, 90-day embargo, 365-day holdout |
| **Serving Metadata** | `backend/artifacts/model_registry/v2/metadata.json` | Model `v2.0.0-demo`, Contract `v1.0` | Active serving model registry metadata |
| **Serving Validation** | `backend/artifacts/model_registry/v2/serving_validation.json` | Validated, SHA-256 matching | Frozen temporal holdout evaluation artifact |
| **Classifier Artifact** | `backend/artifacts/model_registry/v2/catboost_classifier.cbm` | Serialized CatBoost model | Frozen production classifier |
| **Calibration Artifact**| `backend/artifacts/model_registry/v2/probability_calibration.json`| Method: `isotonic`, 24 threshold pairs | Frozen probability calibration mapping |
| **CQR Artifact** | `backend/artifacts/model_registry/v2/cqr_calibration.json` | $Q = 2.3532$, $N_{\text{calib}}=103$ | Frozen CQR adjustment factor |
| **Quantile Models** | `backend/artifacts/model_registry/v2/lightgbm_q{05,50,95}.txt` | Serialized LightGBM models | Frozen conditional severity regressors |
| **Feature Schema** | `backend/artifacts/model_registry/v2/feature_schema.json` | 26 numeric, 13 categorical | 39 total input features |

---

## 4. Data Audit

The canonical dataset is the USAID Global Health Supply Chain Program (SCMS) Delivery History Dataset:

### Distribution & Prevalence
- **Total Raw Records**: $10,324$ rows, $33$ columns.
- **Primary Key**: `ID` (100% unique, non-null, integer).
- **Target Distribution (`Delay_Flag`)**:
  - Class 0 (On-Time / Early): $9,138$ records ($88.51\%$).
  - Class 1 (Delayed): $1,186$ records ($11.49\%$).
  - Target Prevalence: $\mathbf{11.488\%}$ (Substantial class imbalance).
- **Continuous Severity (`Delay_Days` when delayed)**:
  - Count: $1,186$ delayed shipments.
  - Mean: $21.37$ days ($\text{std} = 28.50$).
  - Median: $12.0$ days ($\text{IQR} = [5.0, 24.75]$).
  - Min / Max: $1.0$ day to $192.0$ days.

### Chronological Span & Milestones
- **Scheduled Delivery Dates**: `2006-05-02` to `2015-12-31`.
- **Actual Delivered Dates**: `2006-05-02` to `2015-09-14`.
- **Order Commitment (PO Sent Dates)**: `2006-04-19` to `2015-08-24`.
- **Temporal Inversion Anomalies**: $8$ historical records audited and flagged via `is_temporal_anomaly == 1` (cleanly isolated from modeling population).

### Split Sizes in Frozen Registry v2
- **Training Set** ($T_{\text{pred}} < \text{2013-11-27}$): $6,312$ rows ($959$ delayed).
- **Embargo Window** ($\Delta = 90\text{ days}$): $\text{2013-11-27}$ to $\text{2014-02-25}$.
- **Calibration Set** ($\text{2014-02-25} \le T_{\text{pred}} < \text{2014-08-24}$): $717$ rows ($103$ delayed).
- **Quarantined Final Holdout** ($\text{2014-08-24} \le T_{\text{pred}} \le \text{2015-08-24}$): $1,013$ rows ($\mathbf{61\text{ delayed}}$).

---

## 5. Temporal Integrity Audit

### Chronological Verification
- **Dual-Channel Operational Milestone Anchor ($T_{\text{pred}}$)**:
  - *Direct Drop*: $T_{\text{pred}} = \text{PO Sent to Vendor Date}$ (Milestone M2).
  - *From RDC*: $T_{\text{pred}} = \text{PQ First Sent to Client Date}$ (Milestone M1).
  - Mathematical Invariant: $T_{\text{pred}} \le \text{Delivered to Client Date}$ is strictly satisfied across $100\%$ of modeled rows.
- **Split Isolation**:
  $$\max(T_{\text{outcome}}^{\text{train}}) < T_{\text{cutoff}} \le \min(T_{\text{pred}}^{\text{eval}})$$
  Enforced by `RollingOriginSplitter` with a 90-day label-maturity embargo gap to ensure no in-flight shipment outcomes leak into prior training folds.
- **Entity Clustered Temporal Overlap**:
  Repeating entities (`Vendor`, `Country`, `Manufacturing Site`) span across time windows. Point-in-time historical aggregates in `TemporalFeatureBuilder` strictly query $T_{\text{outcome}} < T_{\text{pred}}$, preventing future aggregation leakage while maintaining real-world operational predictive signal.

---

## 6. Leakage Audit

### Forbidden Feature Enforcements
The repository contains formal, tested assertions (in `backend/tests/test_api_schemas.py` and `PredictionContractValidator`) that actively reject post-prediction and post-outcome variables:
1. `Delivered to Client Date` (Target outcome timestamp — $100\%$ leakage).
2. `Delivery Recorded Date` (Post-delivery ERP commit timestamp — $100\%$ leakage).
3. `Delay_Days` & `Delay_Flag` (Target labels).
4. `is_temporal_anomaly` (Target-derived cohort filter).
5. `Weight (Kilograms)` (Warehouse scale gross weight measured at physical dispatch; contains composite string references).
6. `Freight Cost (USD)` (Post-dispatch invoice actuals including demurrage / expedited air surcharges).
7. `ASN/DN #` (Post-PO consignment packing number).
8. `ID` (Surrogate database key).

**Leakage Verdict**: **PASS** (Zero leakage detected in feature schemas, adapters, and serving pipeline).

---

## 7. Existing Model Pipeline

The active serving pipeline (`v2.0.0-demo`) implements:
- **Classifier**: CatBoostClassifier (`depth=6`, `learning_rate=0.05`, `iterations=100`, `auto_class_weights=Balanced`).
- **Probability Calibration**: 1D Isotonic Regression fit on $N=717$ temporal calibration observations. Selected decision threshold: $\tau^* = 0.2300$.
- **Severity Estimators**: 3 separate LightGBM quantile regressors trained on delayed shipments ($q_{0.05}, q_{0.50}, q_{0.95}$).
- **Uncertainty Layer**: Split Conformalized Quantile Regression (CQR) with finite-sample correction $(1-\alpha)(1+1/n)$ at nominal $\alpha = 0.10$ ($90\%$ coverage). Empirical adjustment: $Q = 2.3532$ days.
- **Explainability**: Local tree SHAP values generated natively by CatBoost at inference time.
- **Decision Engine**: Rule-based decision triage combining risk tier, $90\%$ interval width ($>14$ days triggers `HUMAN_REVIEW`), and simulated action cost-benefit optimization.

---

## 8. Existing Evaluation Evidence

Locked temporal holdout results from `backend/artifacts/model_registry/v2/serving_validation.json`:

### Classification Performance (Holdout: $N=1,013$, Positives: $N=61$)
- **PR-AUC**: $0.2696$ (vs. baseline prevalence of $0.0602$, a $4.48\times$ lift).
- **ROC-AUC**: $0.8330$.
- **Brier Score**: $0.04997$.
- **At Operating Threshold $\tau^* = 0.2300$**:
  - Precision: $0.2710$ ($29/107$).
  - Recall: $0.4754$ ($29/61$).
  - F1-Score: $0.3452$.
  - Balanced Accuracy: $0.6967$.

### Severity & Conformal Performance (Holdout Delayed Only: $N=61$)
- **Nominal Coverage**: $90.0\%$.
- **Empirical Coverage**: $95.08\%$ ($58/61$ delayed shipments inside interval).
- **Mean Interval Width**: $54.92$ days.
- **Median Interval Width**: $37.78$ days.
- **Median Prediction Mean ($q_{50}$)**: $24.45$ days.

---

## 9. Reusable Scientific Assets

| Asset | Source Location | Reusability in Paper Track |
|---|---|---|
| Ingestion & Schema Adapter | `backend/src/delay_intelligence/data/adapters/scms.py` | **100% Reusable** |
| Prediction Contract Validator | `backend/src/delay_intelligence/validation/contract_validator.py` | **100% Reusable** |
| Point-in-Time Feature Builder | `backend/src/delay_intelligence/features/builder.py` | **100% Reusable** |
| Expanding Temporal Splitter | `backend/src/delay_intelligence/evaluation/splitter.py` | **100% Reusable** |
| Conformal CQR Engine | `backend/src/delay_intelligence/uncertainty/conformal.py` | **100% Reusable** |
| Drift & Readiness Schemas | `backend/src/delay_intelligence/drift/` | **100% Reusable** |
| Cost-Sensitive Backtester | `backend/src/delay_intelligence/cost_sensitive/` | **100% Reusable for Simulated Utility** |

---

## 10. Missing Experiments

To support a rigorous academic publication, the following experiments must be conducted in Phase 2:
1. **Classification Baseline Suite**: Benchmark CatBoost against Logistic Regression, Random Forest, XGBoost, and LightGBM under the exact same expanding-origin folds.
2. **Leakage Quantification Diagnostic**: Run standard 5-fold stratified random CV vs. expanding temporal CV to quantify the exact degree of optimistic bias in random splitting.
3. **Calibration Comparison**: Compare Uncalibrated vs. Platt Scaling (Sigmoid) vs. Isotonic Regression across Brier score, ECE, and reliability curve preservation.
4. **Severity Baselines**: Compare LightGBM Quantile Regressors against Conditional Historical Median and Ridge Regression.
5. **Multi-Level Conformal Study**: Evaluate empirical coverage, sharpness, and efficiency across $80\%$, $90\%$, and $95\%$ nominal coverage levels.
6. **Multi-Fold Temporal Robustness**: Report mean $\pm$ std across all 5 expanding folds to show temporal stability.
7. **Operational Prioritization Curves**: Generate Recall@$K$ and Delay-Days Captured@$K$ for $K \in \{10, 25, 50, 100, 200\}$.
8. **Stepwise Ablation Study**: Quantify the marginal contribution of stages $M_0 \to M_1 \to M_2 \to M_3 \to M_4$.

---

## 11. Experiment Matrix

Configured in `research/configs/experiment_matrix.yaml`:
- **Classifiers ($5$)**: Logistic Regression, Random Forest, XGBoost, LightGBM, CatBoost.
- **Calibration Methods ($3$)**: None (Uncalibrated), Platt (Sigmoid), Isotonic Regression.
- **Evaluation Protocols ($2$)**: 5-Fold Expanding Temporal CV (Primary), 5-Fold Stratified Random CV (Diagnostic Leakage Baseline).
- **Severity Regressors ($3$)**: Conditional Median Baseline, Ridge Regression, LightGBM Quantile Regressors.
- **Nominal Coverage Levels ($3$)**: $80\%$, $90\%$, $95\%$.
- **Decision Utility Capacities ($5$)**: $K \in \{10, 25, 50, 100, 200\}$ across 3 prioritization strategies.
- **Ablation Levels ($5$)**: $M_0$ (Raw) $\to M_1$ (+Calib) $\to M_2$ (+Severity) $\to M_3$ (+CQR) $\to M_4$ (+Decision Layer).

---

## 12. Statistical Validity Requirements

### Resampling & Confidence Intervals
- **Do Not Blindly Bootstrap Time Series**: Standard i.i.d. bootstrap violates temporal auto-correlation.
- **Recommended Resampling**:
  - For holdout performance metrics (PR-AUC, Brier, F1): **Stratified bootstrap** ($B=1,000$ replicates) within the holdout window to compute $95\%$ percentile confidence intervals.
  - For conformal coverage: **Exact Clopper-Pearson Binomial Confidence Intervals**.
  - For cross-fold stability: Report mean, standard deviation, min, and max across the 5 expanding temporal folds.
- **Rule of Language**: Never write "statistically significant" without explicitly citing p-values or non-overlapping bootstrap confidence intervals.

---

## 13. Sample Size Limitations

### Critical Severity & Uncertainty Vulnerability
- The final frozen holdout has $1,013$ total records, but only **$61$ delayed shipments**.
- Because conditional severity models and CQR uncertainty calibration evaluate *only on delayed shipments*, the effective test sample size is $N=61$.
- **Statistical Implications**:
  - Each miscovered shipment changes empirical coverage by $\frac{1}{61} \approx 1.64\%$.
  - The empirical coverage of $95.08\%$ ($58/61$) has an exact $95\%$ Clopper-Pearson confidence interval of $[86.3\%, 99.0\%]$.
  - This confidence interval encompasses the nominal $90\%$ target. It is statistically consistent with $90\%$ coverage, but the sample size is insufficient to prove superior calibration precision over simpler methods.
- **Paper Framing Requirement**: This limitation must be explicitly highlighted in the Methodology and Limitations sections of the paper.

---

## 14. Novelty Assessment

### Overall Novelty: `MODERATE`

#### Novelty Breakdown
- **Individual Algorithms**: **Zero Novelty**. CatBoost, LightGBM, Isotonic regression, Conformal Quantile Regression (Romano et al., 2019), and SHAP (Lundberg & Lee, 2017) are established methods.
- **Methodological Integration**: **STRONG NOVELTY**. The paper's contribution lies in the *systematic, end-to-end operational decision framework* tailored for high-stakes supply chain risk under temporal distribution shift:
  1. Formal dual-channel operational anchoring ($T_{\text{pred}}$) coupled with label-maturity embargo periods.
  2. Integrated two-stage architecture: calibrated classification for rare delay risk + conditional quantile regression for delay severity.
  3. Finite-sample conformal uncertainty bounds applied directly to conditional logistics delay distributions.
  4. Decision utility analysis demonstrating how uncertainty intervals prevent costly automated interventions on highly uncertain shipments.

---

## 15. Publication Blocker Audit

| Issue | Severity | Status / Mitigation Strategy |
|---|---|---|
| **Single-Dataset External Validity** | `MAJOR` | SCMS is a public health supply chain. If Olist/DataCo cannot be validated before submission, frame explicitly as a deep empirical case study on pharmaceutical logistics. |
| **Small Holdout Positive Count ($N=61$)** | `MAJOR` | Report exact Clopper-Pearson CIs; evaluate coverage stability across all 5 expanding training folds ($N_{\text{calib}} > 100$). |
| **Synthetic Financial Claims** | `MAJOR` | Bar all claims of "verified dollar savings"; label all cost evaluations as "Simulated Operational Scenarios". |
| **Temporal Evaluation Leakage** | `NOT PRESENT` | Verified zero leakage; 90-day embargo and strict $T_{\text{pred}}$ boundaries enforced. |
| **Forbidden Feature Leakage** | `NOT PRESENT` | Verified zero post-outcome fields in feature schema. |
| **Model Selection Leakage** | `NOT PRESENT` | Holdout strictly quarantined in research contracts. |
| **Hard-Coded / Fabricated Metrics**| `NOT PRESENT` | All reported metrics verified against immutable registry JSONs. |
| **Non-Reproducible Environment** | `NOT PRESENT` | Deterministic seeds, Python 3.11, standard ML stack verified. |

---

## 16. Reproducibility Assessment

- **Execution Environment**: Python 3.11/3.12 running on local Windows workstation.
- **Key Verified Libraries**: `catboost` 1.2.10, `lightgbm` 4.7.0, `xgboost` 3.2.0, `scikit-learn` 1.8.0, `pandas` 2.3.3, `numpy` 2.4.6, `shap` 0.51.0, `pyarrow` 24.0.0, `pytest` 9.0.3.
- **Tests Status**: $18/18$ backend tests passing ($100\%$ pass rate).
- **Determinism**: Random seeds fixed to `42` across all configs and runners.

---

## 17. Compute Requirements

- **Workstation Feasibility**: $100\%$ CPU-executable.
- **Dataset Size**: $10,324$ rows (Lightweight tabular dataset).
- **Estimated Full Matrix Training Time**:
  - 5 Classifier Baselines $\times$ 5 Folds: $\approx 2.5$ minutes.
  - Probability Calibration Suite: $\approx 15$ seconds.
  - LightGBM Quantiles (3 models) $\times$ 5 Folds: $\approx 45$ seconds.
  - Conformal CQR Evaluation: $\approx 10$ seconds.
  - Bootstrap Resampling ($1,000$ iterations): $\approx 1.5$ minutes.
  - **Total Expected Compute Time**: $< 6$ minutes on standard multi-core CPU.
- **GPU Requirement**: None required.

---

## 18. Files That Must Remain Frozen

To protect production integrity and prevent evaluation leakage, the following files must never be modified during research experimentation:

1. `backend/artifacts/model_registry/v2/*` (Serving production model registry).
2. `backend/artifacts/model_registry/v2/serving_validation.json` (Frozen validation baseline).
3. `E:/delay_intelligence_system/data/raw/SCMS_Delivery_History_Dataset.csv` (Raw canonical data).
4. `backend/configs/prediction_contract.yaml` (Production contract definition).
5. `backend/src/delay_intelligence/api/*` (Production FastAPI endpoints).
6. `src/*` (Production frontend routes and components).
7. `railway.json` & `vercel.json` (Deployment configurations).

---

## 19. Exact Phase-2 Execution Sequence

When Phase 2 execution is explicitly approved by the user, run the following sequential commands:

### Step 1: Run Classification Baselines & Diagnostic Leakage Evaluation
```bash
python research/experiments/exp_classification_baselines.py --config research/configs/experiment_matrix.yaml
```
*Outputs*: `research/outputs/metrics/classification_baselines.json`, `research/outputs/tables/tab_baselines_vs_random.tex`

### Step 2: Run Probability Calibration Study
```bash
python research/experiments/exp_calibration_study.py --config research/configs/experiment_matrix.yaml
```
*Outputs*: `research/outputs/metrics/calibration_comparison.json`, `research/outputs/figures/fig_reliability_diagrams.png`

### Step 3: Run Severity Quantiles & Multi-Level Conformal Study
```bash
python research/experiments/exp_severity_and_conformal.py --config research/configs/experiment_matrix.yaml
```
*Outputs*: `research/outputs/metrics/conformal_coverage.json`, `research/outputs/figures/fig_cqr_intervals.png`

### Step 4: Run Expanding Temporal Robustness & Ablation Study
```bash
python research/experiments/exp_temporal_ablation.py --config research/configs/experiment_matrix.yaml
```
*Outputs*: `research/outputs/metrics/temporal_folds.json`, `research/outputs/tables/tab_ablation_stages.tex`

### Step 5: Run Operational Decision Utility Simulation
```bash
python research/experiments/exp_decision_utility.py --config research/configs/experiment_matrix.yaml
```
*Outputs*: `research/outputs/metrics/decision_utility.json`, `research/outputs/figures/fig_prioritization_frontier.png`

### Step 6: Generate Full Statistical Evidence Pack & Bootstrap CIs
```bash
python research/scripts/bootstrap_inference.py --metrics-dir research/outputs/metrics --out-dir research/outputs/tables
```
*Outputs*: `research/outputs/tables/tab_main_results_with_ci.tex`

---

## 20. Final Recommendation

The research team recommends **CONDITIONAL PASS**.

The repository is fully verified, the contracts are frozen, the research scaffold is in place, and all lightweight tests have passed. Phase 2 experiment runners can be constructed and executed safely without any risk to the production application.
