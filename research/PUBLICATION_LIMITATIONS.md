# ORCA Research Track — Publication Limitations

**Document ID**: `PUBLICATION_LIMITATIONS_V1`  
**Date**: 2026-08-31  
**Status**: `LIMITATIONS_FROZEN`  

---

## Comprehensive Limitations & Boundary Conditions

To maintain the highest standards of scientific integrity, the manuscript explicitly establishes the following 11 limitations:

### 1. Single Public Health Logistics Dataset
- The empirical evidence is derived exclusively from the **USAID SCMS Delivery History Dataset** ($N = 10,324$ shipments across 43 recipient countries). While this represents a large, real-world public health distribution network, findings may not directly generalize to commercial high-velocity supply chains (e.g., e-commerce next-day parcel delivery) without domain-specific re-training.

### 2. Historical Observational Data & Unobserved Counterfactuals
- The dataset comprises historical observational procurement records. We do not observe counterfactual outcomes (i.e., what delay duration would have occurred if an expediting intervention had taken place). Consequently, the predictive models estimate observational delay risk under historical operating conditions rather than causal treatment effects.

### 3. Limited Benchmark Sample Size ($N=61$ Delays)
- In the Locked Registry Evaluation Set ($N = 1,013$ shipments), only $61$ shipments experienced delay ($6.02\%$ prevalence). Because $N = 61$ is modest, empirical coverage estimates have noticeable finite-sample sampling variance ($\approx 1.64\%$ per event). All coverage metrics are reported with exact Clopper-Pearson binomial confidence intervals.

### 4. Non-Confirmatory Role of the Locked Registry Benchmark
- Because the Locked Registry window ($T_{\text{pred}} \in [\text{2014-08-24}, \text{2015-08-24}]$) was historically evaluated by the ORCA production serving registry prior to this research track, it cannot be characterized as an untouched, unseen, or confirmatory holdout. It serves strictly as a **secondary locked replication check**. The primary scientific evidence base rests on the 5-fold expanding temporal cross-validation.

### 5. Temporal Prevalence & Regime Shift
- Delay prevalence drops substantially from the early training cohorts ($15.2\%$ in 2008–2013) to the late benchmark cohort ($6.02\%$ in 2014–2015). While this reflects realistic operational evolution (e.g., maturation of supply chain infrastructure), it induces severe distribution shift that impacts uncalibrated classifier precision and threshold sensitivity.

### 6. Simulated Operational Decision Support
- Operational decision utility evaluations at inspection capacities $K \in \{1\%, 5\%, 10\%, 20\%\}$ represent **simulated operational scenarios** under synthetic capacity budgets and uniform unit inspection costs. They do not reflect real-time operational workflows or measured financial balance sheet savings.

### 7. Causal Mechanism Non-Identifiability
- Although random cross-validation exhibits massive metric inflation ($+26.2\%$ to $+99.7\%$ PR-AUC) relative to temporal validation, we do not claim that "entity memorization" is an established causal mechanism. We interpret the delta conservatively as an empirical manifestation of temporal dependence, auto-correlation, and non-stationary feature distributions.

### 8. Absence of Live Prospective Operational Trial Data
- The study has not yet undergone a randomized prospective field trial in an active logistics control tower. The findings reflect offline retrospective temporal evaluation.

### 9. Point Prediction Error on Delay Severities
- While Gradient-Boosted Quantile Regressors effectively construct asymmetric prediction intervals for CQR, they do not outperform a simple historical Conditional Median baseline on point-prediction MAE on delayed shipments ($15.62$d vs. $16.96$d on development; $9.05$d vs. $14.21$d on benchmark). Quantiles must not be marketed as superior point estimators.

### 10. Finite-Sample Calibration Assumptions
- Conformal prediction guarantees exact marginal coverage under the assumption of exchangeability between calibration and test non-conformity scores. Under strong temporal drift, empirical coverage may exhibit modest finite-sample fluctuations around nominal levels ($70.49\%$ at nominal $80\%$, $91.80\%$ at nominal $90\%$).

### 11. Scope of Methodological Novelty
- We do not claim novelty for the underlying machine learning algorithms (CatBoost, Random Forest, LightGBM, Logistic Regression), calibration techniques (Platt scaling, Isotonic regression), or conformal prediction theory (CQR). Novelty is situated in the **integrated temporal-probabilistic-conformal framework and operational prioritization methodology** applied to supply chain delay mitigation.
