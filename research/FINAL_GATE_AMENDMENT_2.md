# ORCA Research Track — Final Evaluation Gate Amendment 2

**Document ID**: `FINAL_GATE_AMENDMENT_2_V1`  
**Date**: 2026-08-31  
**Status**: `GATE_AMENDMENT_2_FROZEN`  
**Git Commit**: `6f71396ac38466c9d18e2706bea8688d9c2ea8ac`  
**Canonical Dataset SHA-256**: `918b992dd3e8d4b64d2a727b2c4ea607603d0c58f19484e73f7b78528c6a8673`  

---

## 1. Task 1: Random Forest Sensitivity Comparator Calibration Policy

Using **Development Data Only** (5 expanding temporal folds, $N = 7,306$ rows, 1,125 delayed shipments), Random Forest was benchmarked across three calibration strategies:

| Calibration Strategy | Development Mean PR-AUC | PR-AUC SD | Mean ROC-AUC | ROC-AUC SD | Mean Brier Score | Brier SD | Mean ECE (10 Bins) | ECE SD |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Platt / Sigmoid Scaling** | **0.3296** | 0.1797 | **0.7269** | 0.1120 | **0.1317** | 0.0566 | **0.0866** | 0.0553 |
| **Isotonic Regression** | 0.2904 | 0.1467 | 0.6985 | 0.1015 | **0.1316** | 0.0536 | **0.0774** | 0.0538 |
| **Raw Uncalibrated** | **0.3296** | 0.1797 | **0.7269** | 0.1120 | 0.1797 | 0.0469 | 0.2051 | 0.1059 |

### Selection Decision & Rationale:
- **Predeclared Primary Calibration Method for RF**: **Platt / Sigmoid Scaling**.
- **Rationale**: Platt scaling achieves virtually identical Brier score to Isotonic regression ($0.1317$ vs. $0.1316$) while cutting ECE by over $57\%$ compared to raw probabilities ($0.0866$ vs. $0.2051$). Crucially, Platt scaling preserves strict continuous rank ordering and PR-AUC ($0.3296$), whereas Isotonic regression creates discrete step-function ties that degrade validation PR-AUC to $0.2904$.

---

## 2. Task 2: Random Forest Binary Threshold Policy

- **Derivation Data**: Pooled development out-of-fold (OOF) validation predictions across all 5 temporal folds ($N = 3,277$ observations, $479$ delayed shipments).
- **Optimization Rule**: Maximize pooled development OOF $F_1$ score over $\tau \in [0.05, 0.95]$ with step size $0.005$.
- **Frozen RF Threshold**:
  $$\mathbf{\tau^*_{\text{RF}} = 0.1050} \quad (\text{Development OOF } F_1 = \mathbf{0.3989})$$
- Applied directly as a fixed scalar to the locked registry benchmark without post-hoc tuning.

---

## 3. Task 3: Predeclared Benchmark Reporting for Both Classifiers

Both classifiers are evaluated side-by-side on the Locked Registry Evaluation Set under their respective frozen development protocols:

| Classifier | Evidence Role | Calibration Method | Frozen Threshold ($\tau^*$) | Development OOF $F_1$ | Development Mean PR-AUC | Development Mean ROC-AUC |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **CatBoost** | **Deployment-Aligned Primary Model** | Platt / Sigmoid | **0.1000** | **0.3786** | 0.3164 | 0.7401 |
| **Random Forest** | **Development PR-AUC Sensitivity Comparator** | Platt / Sigmoid | **0.1050** | **0.3989** | 0.3238 | 0.7269 |

### Predeclared Metrics to Report on Benchmark:
- **Threshold-Independent Metrics**: PR-AUC, ROC-AUC, Brier Score, ECE (10 uniform bins).
- **Threshold-Dependent Metrics**: Precision, Recall, F1 Score, Balanced Accuracy (at $\tau^* = 0.1000$ for CatBoost; $\tau^* = 0.1050$ for Random Forest).

---

## 4. Task 4: Conformal Uncertainty (CQR) Policy Confirmation

The Conformalized Quantile Regression procedure is precomputed and frozen independently across all three nominal coverage levels:

| Nominal Level ($1-\alpha$) | Calibration Alpha ($\alpha$) | Lower Quantile ($q_{\text{low}}$) | Upper Quantile ($q_{\text{high}}$) | Finite-Sample Adjustment Formula |
| :---: | :---: | :---: | :---: | :--- |
| **80%** | $\alpha = 0.20$ | $q_{0.10}$ | $q_{0.90}$ | $Q_{0.80} = \text{Quantile}\left(\text{scores}, \min(1.0, 0.80(1 + 1/n_{\text{cal}})), \text{method}='higher'\right)$ |
| **90%** | $\alpha = 0.10$ | $q_{0.05}$ | $q_{0.95}$ | $Q_{0.90} = \text{Quantile}\left(\text{scores}, \min(1.0, 0.90(1 + 1/n_{\text{cal}})), \text{method}='higher'\right)$ |
| **95%** | $\alpha = 0.05$ | $q_{0.025}$ | $q_{0.975}$ | $Q_{0.95} = \text{Quantile}\left(\text{scores}, \min(1.0, 0.95(1 + 1/n_{\text{cal}})), \text{method}='higher'\right)$ |

- Non-conformity score definition: $E_i = \max(\hat{q}_{\text{low}}(x_i) - y_i, y_i - \hat{q}_{\text{high}}(x_i))$.
- All three nominal levels will be reported unconditionally with exact Clopper-Pearson binomial confidence intervals.

---

## 5. Non-Access Affirmation & Verification

> [!IMPORTANT]
> **Locked Registry Benchmark Quarantine Confirmation**:
> - Confirmed: Zero labels, features, or predictions from the Locked Registry Evaluation Set ($N=1,013$ rows, 61 delayed shipments, $T_{\text{pred}} \ge \text{2014-08-24}$) have been accessed or processed during this amendment.
> - All parameters ($\tau^*_{\text{CatBoost}} = 0.1000$, $\tau^*_{\text{RF}} = 0.1050$, calibration models, quantile models, and CQR adjustments) are 100% frozen from development data.

---

## 6. Gate Verdict
- **Status**: **CONDITIONAL GO** (Protocol completely frozen and pre-registered; awaiting explicit user instruction to run benchmark evaluation).
