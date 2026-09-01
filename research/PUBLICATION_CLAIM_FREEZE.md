# ORCA Research Track — Publication Claim Freeze

**Document ID**: `PUBLICATION_CLAIM_FREEZE_V1`  
**Date**: 2026-08-31  
**Status**: `CLAIMS_FROZEN`  
**Canonical Dataset SHA-256**: `918b992dd3e8d4b64d2a727b2c4ea607603d0c58f19484e73f7b78528c6a8673`  
**Evaluation Freeze SHA-256**: `631F1FA4241FBE697B46D9658B8720D2CE13CFB5A9F65E32C7532F8A1F6CD21A`  
**Benchmark Manifest SHA-256**: `62BE80CE9BC977767BC983EDABF61DAA23609A1801251F4E93CFA9693EBDD9AB`  

---

## 1. Supported Primary Claims (Primary Evidence: 5-Fold Expanding Temporal Development)

1. **Random-Split Optimism Inflation (RQ1)**:
   - *Claim*: Random cross-validation substantially inflates predictive performance relative to temporally ordered evaluation across all tested tabular models (relative PR-AUC inflation ranging from $+26.2\%$ for Logistic Regression to $+99.7\%$ for LightGBM; $+47.6\%$ for Random Forest, $+77.3\%$ for CatBoost).
   - *Interpretation*: Phrased strictly as: *"Random splitting substantially overestimates performance relative to temporally ordered evaluation, consistent with temporal dependence and distribution structure."*
   - *Artifacts*: `research/outputs/tables/random_vs_temporal.csv`, `research/outputs/figures/temporal_pr_auc.png`.

2. **Probability Calibration for Operational Reliability (RQ2)**:
   - *Claim*: Post-hoc probability calibration significantly improves probabilistic reliability (reducing Brier score from $0.1398$ to $0.1357$ and ECE from $0.0850$ to $0.0807$ on CatBoost; reducing ECE on Random Forest from $0.2051$ to $0.0866$).
   - *Interpretation*: Platt scaling preserves strict continuous rank-ordering (PR-AUC $0.2999$ on CatBoost, $0.3296$ on RF), making it suitable for top-$K$ triage. Isotonic regression reduces ECE further ($0.0760$) but induces step-function ties that degrade PR-AUC ($0.2730$).
   - *Artifacts*: `research/outputs/tables/calibration_summary.csv`, `research/outputs/figures/calibration_reliability_catboost.png`.

3. **Conditional Severity Point Prediction Baseline (RQ3)**:
   - *Claim*: On truly delayed shipments, simple historical Conditional Median prediction achieves lower point-prediction MAE ($15.62 \pm 6.43$ days) than gradient-boosted quantile regressors ($16.96 \pm 4.66$ days).
   - *Interpretation*: Quantile models serve specifically as asymmetric interval spread estimators for conformal prediction rather than superior point estimators.
   - *Artifacts*: `research/outputs/tables/severity_summary.csv`.

4. **Valid Finite-Sample Conformal Prediction Intervals (RQ4)**:
   - *Claim*: Split Conformalized Quantile Regression (CQR) provides finite-sample valid prediction intervals under temporal shift across multiple nominal coverage levels ($80\% \to 78.33\%$, $90\% \to 85.76\%$, $95\% \to 95.84\%$ on development folds).
   - *Interpretation*: CQR exhibits an explicit coverage-versus-sharpness trade-off: higher nominal coverage guarantees require wider prediction intervals ($46.4$d at $80\%$ vs. $153.6$d at $95\%$).
   - *Artifacts*: `research/outputs/tables/conformal_summary.csv`, `research/outputs/figures/coverage_vs_width.png`.

---

## 2. Supported Secondary Claims (Secondary Evidence: Locked Registry Benchmark)

1. **Replication of Delay Discrimination under Low Prevalence**:
   - *Claim*: Both the deployment-aligned primary model (CatBoost) and the sensitivity comparator (Random Forest) demonstrate stable out-of-distribution discrimination on the locked benchmark ($T_{\text{pred}} \in [\text{2014-08-24}, \text{2015-08-24}]$, prevalence $6.02\%$), achieving PR-AUC of $0.2709$ (CatBoost) and $0.3195$ (Random Forest), and ROC-AUC of $0.7477$ and $0.7898$.
   - *Artifact*: `research/outputs/tables/locked_registry_classification.csv`.

2. **Benchmark Severity & CQR Replication**:
   - *Claim*: On the $61$ benchmark delayed shipments, Conditional Median maintained lower MAE ($9.05$ days vs. $14.21$ days), and $90\%$ CQR achieved $91.80\%$ empirical coverage ($56/61$, exact 95% CI $[81.90\%, 97.28\%]$) with a mean width of $46.27$ days.
   - *Artifacts*: `research/outputs/tables/locked_registry_severity.csv`, `research/outputs/tables/locked_registry_cqr.csv`.

---

## 3. Simulated-Scenario Claims (Operational Decision Utility)

1. **Capacity-Constrained Prioritization Trade-offs (RQ5)**:
   - *Claim*: Under simulated operational inspection constraints ($K \in \{1\%, 5\%, 10\%, 20\%\}$), prioritizing shipments using risk combined with uncertainty ($\hat{p} \times \hat{y}_{95}$) increases high-severity delay capture at low inspection capacities (capturing $8/15$ high-severity delays at $K=1\%$ and $10/15$ at $K=5\%$, compared to $1/15$ and $2/15$ for risk-only ranking).
   - *Interpretation*: Must be described as a trade-off: uncertainty-aware ranking prioritizes severe delay impact, whereas risk-only ranking may capture slightly more total low-severity delays at larger capacities ($K=20\%$).
   - *Label Requirement*: Must carry explicit label **`[SIMULATED SCENARIO]`** in all headings, tables, and figures.
   - *Prohibited Phrasing*: Do not use sensational relative claims such as "+700%". State exact shipment counts and percentage-point improvements.
   - *Artifact*: `research/outputs/tables/locked_registry_decision_utility.csv`.

---

## 4. Exploratory Observations

1. **Feature Ablation Impact**: Ablation experiments indicate that lead-time estimates and shipment line-item metadata provide the primary predictive signal, whereas aggregate origin/vendor historical frequencies provide marginal incremental gain under temporal shifts.
2. **Model Ranking Sensitivity**: While CatBoost provides native categorical splitting and deployment stability, Random Forest achieved slightly higher PR-AUC across temporal splits ($0.3238$ vs. $0.3164$ development, $0.3195$ vs. $0.2709$ benchmark).

---

## 5. Unsupported & Prohibited Claims

- [ ] **PROHIBITED**: Claiming the Locked Registry Evaluation Set is "unseen", "untouched", or a "new confirmatory holdout". (It is a secondary locked replication benchmark).
- [ ] **PROHIBITED**: Claiming "entity memorization" is an established causal mechanism for random-split optimism.
- [ ] **PROHIBITED**: Claiming LightGBM quantile regression is a superior point estimator compared to Conditional Median.
- [ ] **PROHIBITED**: Claiming CatBoost is the "best predictive classifier" (Random Forest achieved higher PR-AUC/ROC-AUC).
- [ ] **PROHIBITED**: Claiming real-world financial cost savings or direct dollar savings without prospective operational trial data.
- [ ] **PROHIBITED**: Selectively reporting only the $90\%$ CQR coverage level while omitting $80\%$ and $95\%$.
- [ ] **PROHIBITED**: Claiming universal algorithmic novelty for CatBoost, Random Forest, Platt scaling, LightGBM, or Conformal Prediction.
