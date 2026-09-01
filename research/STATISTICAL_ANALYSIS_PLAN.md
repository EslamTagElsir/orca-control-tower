# ORCA Research Track — Statistical Analysis Plan (SAP)

**Protocol Version**: `1.0.0`  
**Author**: Statistics Reviewer / Research Engineering Team  
**Date**: 2026-08-31  

---

## 1. Objective & Scope

This Statistical Analysis Plan governs the estimation of uncertainty, confidence intervals, and hypothesis evaluation for the study:
> **"Calibrated Delay Risk and Conformal Severity Prediction under Temporal Distribution Shift in Pharmaceutical Supply Chains"**

---

## 2. Prohibition of Naive I.I.D. Resampling

> [!WARNING]
> **Temporal Auto-Correlation Constraint**:
> Standard independent and identically distributed (i.i.d.) bootstrapping across time breaks temporal sequence order, distorts lead-time autocorrelation, and creates artificial optimism. Naive whole-dataset bootstrapping is strictly prohibited.

---

## 3. Approved Resampling & Estimation Methodologies

### 3.1 Metric-Level Stratified Bootstrap within Evaluation Windows
- **Applicability**: Discrimination metrics (PR-AUC, ROC-AUC), calibration metrics (Brier score, ECE), and threshold classification metrics (Precision, Recall, F1, Balanced Accuracy) evaluated on fixed temporal validation folds or the quarantined holdout.
- **Procedure**:
  1. Fix the evaluation dataset $(X_{\text{eval}}, y_{\text{eval}})$.
  2. For $b = 1, \dots, B$ (where $B = 1,000$):
     - Sample with replacement independently from Class 1 ($N_{\text{pos}}$) and Class 0 ($N_{\text{neg}}$) to preserve empirical class prevalence.
     - Recompute metric $\hat{\theta}^{(b)}$.
  3. Construct empirical percentile $95\%$ Confidence Interval:
     $$\text{CI}_{0.95} = \left[ \hat{\theta}_{(0.025)}, \hat{\theta}_{(0.975)} \right]$$

### 3.2 Exact Binomial Confidence Intervals for Conformal Coverage
- **Applicability**: Conformalized Quantile Regression (CQR) empirical coverage rates.
- **Procedure**:
  - For $n$ delayed shipments with $k$ shipments falling within $[\hat{q}_{\text{low}}, \hat{q}_{\text{high}}]$:
  - Compute exact **Clopper-Pearson** binomial confidence intervals using Beta quantiles:
    $$\text{CI}_{\text{low}} = \text{Beta}\left(\frac{\alpha}{2}; k, n - k + 1\right)$$
    $$\text{CI}_{\text{high}} = \text{Beta}\left(1 - \frac{\alpha}{2}; k + 1, n - k\right)$$

### 3.3 Temporal Stability & Distribution Shift Metrics
- Across expanding folds, report empirical **Mean**, **Standard Deviation**, **Min**, and **Max** across all 5 folds to reflect distribution-shift variability.

---

## 4. Reporting Standards & Guardrails

1. **Point Estimates with Interval Bounds**: Every headline metric must be reported in the format:
   $$\text{Estimate} \; [95\% \text{ CI Low}, \; 95\% \text{ CI High}]$$
2. **Strict Language Rule**: The phrase *"statistically significant"* must never appear in the manuscript without an explicit p-value from a pre-specified formal test (e.g., DeLong test for ROC-AUC, paired Wilcoxon signed-rank test across temporal folds) or non-overlapping $95\%$ confidence intervals.
3. **Finite-Sample Uncertainty Transparency**: For holdout severity and coverage metrics ($N_{\text{delayed}} = 61$), explicitly report that each individual miscovered shipment changes empirical coverage by $\approx 1.64\%$, and discuss finite-sample limitations.
