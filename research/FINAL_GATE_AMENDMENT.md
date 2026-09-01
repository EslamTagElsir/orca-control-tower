# ORCA Research Track — Final Evaluation Gate Amendment

**Document ID**: `FINAL_GATE_AMENDMENT_V1`  
**Date**: 2026-08-31  
**Status**: `GATE_AMENDMENT_FROZEN`  
**Git Commit**: `6f71396ac38466c9d18e2706bea8688d9c2ea8ac`  
**Canonical Dataset SHA-256**: `918b992dd3e8d4b64d2a727b2c4ea607603d0c58f19484e73f7b78528c6a8673`  

---

## 1. Audit & Resolution of Methodological Issues

### 1.1 Issue 1: Classifier Selection Consistency (Option C Resolution)
- **Contract Audit**:
  - The Phase-2 protocol (`research/contracts/research_experiment_contract.yaml`) designated **PR-AUC** as the primary classification metric.
  - Development evaluation across the 5 expanding temporal folds yielded:
    - **Random Forest**: Temporal Mean PR-AUC = $\mathbf{0.3238 \pm 0.1786}$ (Min: $0.0777$, Max: $0.5148$), Mean ROC-AUC = $0.7316 \pm 0.1174$.
    - **CatBoost**: Temporal Mean PR-AUC = $\mathbf{0.3164 \pm 0.1557}$ (Min: $0.1077$, Max: $0.5216$), Mean ROC-AUC = $\mathbf{0.7401 \pm 0.0709}$.
  - *Audit Finding*: Selecting CatBoost over Random Forest based on secondary metrics (ROC-AUC, Brier score stability) was a post-hoc deviation from the single-metric PR-AUC rule, as no formal multi-objective composite formula was mathematically predeclared in Phase 2.
- **Scientific Resolution (Option C)**:
  - Because the difference in temporal mean PR-AUC is small ($0.3238$ vs. $0.3164$, $\Delta = 0.0074$) with substantially overlapping fold standard deviations ($\pm 0.1786$ vs. $\pm 0.1557$), we formally predeclare both models prior to benchmark evaluation:
    1. **Primary Model**: **CatBoost Classifier** (aligning with the serving registry architecture, end-to-end native categorical splitting, and highest Mean ROC-AUC $0.7401$).
    2. **Predeclared Sensitivity Comparator**: **Random Forest** (the empirical development winner on the primary metric PR-AUC $0.3238$).
  - Both architectures will be evaluated on the locked registry benchmark under the identical frozen protocol and reported side-by-side in the paper.

---

### 1.2 Issue 2: Rigorous Out-Of-Fold Threshold Derivation
- **Audit Finding**: In-sample fitted-model training threshold tuning is rejected to prevent in-sample overfitting and artificial optimism.
- **Predeclared Out-Of-Fold (OOF) Derivation Procedure**:
  - **Data Used**: Pooled out-of-fold validation predictions across all 5 expanding temporal development folds ($N = 3,277$ shipments, $479$ delayed observations; Fold 0: 598, Fold 1: 618, Fold 2: 738, Fold 3: 606, Fold 4: 717). Zero locked registry benchmark data used.
  - **Optimization Objective**: Maximize pooled OOF classification $F_1$ score on calibrated probabilities ($\hat{p}_{\text{cal}}$) over a discrete grid $\tau \in [0.05, 0.95]$ with step size $0.005$.
  - **Empirically Derived & Frozen Benchmark Threshold**:
    $$\mathbf{\tau^* = 0.1000} \quad (\text{Development OOF } F_1 = 0.3786)$$
  - This single scalar threshold $\mathbf{\tau^* = 0.1000}$ is frozen and will be applied directly to the locked registry benchmark without further adjustment.

---

### 1.3 Wording Audit on Random-Split Optimism (RQ1)
- **Conservative Empirical Interpretation**:
  - The phrase *"tree-based models suffer optimism due to temporal entity memorization"* is replaced with the scientifically rigorous formulation:
  > *"Random splitting substantially overestimates performance relative to temporally ordered evaluation across all tested models (relative PR-AUC inflation from $+26.2\%$ to $+99.7\%$), consistent with temporal dependence and distribution structure."*
- Causal mechanisms (such as entity memorization) will only be discussed as potential hypotheses rather than established causal facts.

---

## 2. Frozen Scientific Protocol Matrix

| Policy Dimension | Predeclared Frozen Protocol | Development Rationale / Reference Value |
| :--- | :--- | :--- |
| **Primary Classifier** | **CatBoost** (iter=300, lr=0.05, depth=6, auto_class_weights='Balanced') | Production registry alignment; Mean ROC-AUC: $0.7401$, PR-AUC: $0.3164$ |
| **Sensitivity Classifier** | **Random Forest** (n_est=300, depth=8, min_samples_leaf=5) | Development Primary Metric Winner (Mean PR-AUC: $0.3238$) |
| **Calibration Method** | **Platt / Sigmoid Scaling** (Primary Triage Calibrator) | Preserves continuous monotonic risk ranking (PR-AUC: $0.2999$) while reducing ECE to $0.0807$ (Isotonic and Raw reported as baselines) |
| **Binary Threshold** | **Fixed Scalar $\mathbf{\tau^* = 0.1000}$** | Derived by maximizing pooled development out-of-fold $F_1$ ($0.3786$) |
| **Severity Estimation** | **Conditional Median Baseline** (Point Prediction) & **LightGBM Quantiles** ($q_{0.05}, q_{0.50}, q_{0.95}$) | Conditional Median has better development MAE ($15.62$d vs. $16.96$d); Quantiles used strictly for CQR intervals |
| **CQR Coverage Reporting** | **Unconditional 80%, 90%, and 95%** | All three levels reported with exact Clopper-Pearson binomial CIs; no post-hoc selection |
| **Evidence Hierarchy** | **Development Folds (Primary) vs. Locked Registry Benchmark (Secondary)** | 5 temporal folds ($N=7,306$) form primary evidence; Registry ($N=1,013$) is a secondary replication check |

---

## 3. Quarantine & Non-Peeking Affirmation

> [!IMPORTANT]
> **Pre-Evaluation Integrity Affirmation**:
> - Zero labels, features, or predictions from the Locked Registry Evaluation Set ($N=1,013$, $T_{\text{pred}} \ge \text{2014-08-24}$) have been read, queried, or accessed during this gate amendment.
> - All parameters ($\tau^* = 0.1000$, model hyperparameters, calibration mappings, quantile loss settings) are 100% frozen on development data.

---

## 4. Gate Verdict
- **Status**: **CONDITIONAL GO** (Protocol fully frozen; awaiting user command to execute the single one-pass locked registry benchmark evaluation).
