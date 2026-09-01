# ORCA Research Track — Final Publication Gate Report

**Document ID**: `PUBLICATION_GATE_V3`  
**Date**: 2026-09-01  
**Status**: `PUBLICATION_GATE_COMPLETE_WITH_POST_FREEZE_COUNT_CORRECTION`  
**Frozen evaluation commit**: `6f71396ac38466c9d18e2706bea8688d9c2ea8ac`  
**Canonical Dataset SHA-256**: `918b992dd3e8d4b64d2a727b2c4ea607603d0c58f19484e73f7b78528c6a8673`  
**Evaluation Freeze SHA-256**: `631F1FA4241FBE697B46D9658B8720D2CE13CFB5A9F65E32C7532F8A1F6CD21A`  
**Benchmark Manifest SHA-256**: `62BE80CE9BC977767BC983EDABF61DAA23609A1801251F4E93CFA9693EBDD9AB`  

---

## 1. Evidence Integrity

The research evidence is partitioned as follows:

- **Raw standardized SCMS source population**: `N = 10,324`, `1,186` delayed shipments.
- **Strict prediction-eligible modeling cohort**: `N = 8,319`, `1,169` delayed shipments.
- **Primary development cohort**: `N = 7,306`, **`1,108` delayed shipments**, evaluated through five expanding-origin temporal folds with 90-day embargoes.
- **Secondary evidence base**: Locked Registry Evaluation Set (`N = 1,013`, `61` delayed shipments), functioning strictly as a secondary replication benchmark because it had been evaluated historically by the serving registry.

A post-freeze CI audit exposed that earlier narrative files sometimes described the development cohort as containing `1,125` delays by carrying the raw-population count through the cohort subtraction. The versioned feature cache used by `get_development_data()` establishes `1,108` as the canonical strict-development delayed count. See [`COHORT_COUNT_CORRECTION.md`](COHORT_COUNT_CORRECTION.md).

The frozen hashed contract is retained as provenance and is not silently rewritten after execution.

---

## 2. Provenance Integrity

- **Cryptographic Traceability**: The pre-registration contract [`contracts/FINAL_EVALUATION_FREEZE.json`](contracts/FINAL_EVALUATION_FREEZE.json) (SHA-256: `631F1FA4...`) was sealed and hashed before benchmark execution.
- **Benchmark Manifest**: [`outputs/LOCKED_REGISTRY_MANIFEST.json`](outputs/LOCKED_REGISTRY_MANIFEST.json) (SHA-256: `62BE80CE...`) references the frozen contract, evaluation commit, and dataset hash.
- **Post-freeze correction trail**: [`COHORT_COUNT_CORRECTION.md`](COHORT_COUNT_CORRECTION.md) records the count discrepancy without altering frozen model outputs or hashed historical artifacts.
- **Provenance Verdict**: **PASS — traceable, with explicit correction provenance**.

---

## 3. Primary Methodological Contribution

The central contribution is an integrated decision-intelligence framework for pharmaceutical supply-chain delay mitigation:

1. **Leakage-aware temporal protocol**: expanding temporal splits plus 90-day post-delivery embargoes.
2. **Calibrated probability estimation**: post-hoc Platt scaling for class-imbalanced delay risk.
3. **Conditional severity and uncertainty**: quantile models plus Split Conformalized Quantile Regression (CQR).
4. **Capacity-constrained prioritization**: simulated logistics triage under inspection bandwidths (`K ∈ {1%, 5%, 10%, 20%}`).

The five temporal validation windows contain `3,277` validation observations and **`557` delayed validation observations** in total. Fold-averaged severity metrics are therefore described as validation-fold results rather than as evaluation of every delayed row in the full development cohort.

---

## 4. Publication Novelty Assessment

- **Novelty Classification**: **MODERATE & DEFENSIBLE**.
- Individual algorithms are established methods. The contribution is the carefully governed joint evaluation of temporal leakage controls, probability calibration, conditional severity, conformal uncertainty, and constrained prioritization in pharmaceutical/global-health shipment logistics.
- Broad absolute priority claims are prohibited. The manuscript uses the qualified Level-2 wording governed by [`manuscript/priority_review/FINAL_PRIORITY_REFERENCE_INTEGRITY.md`](manuscript/priority_review/FINAL_PRIORITY_REFERENCE_INTEGRITY.md).

---

## 5. Supported Scientific Claims

1. **Random-Split Optimism (RQ1)**: Random-split evaluation produced PR-AUC estimates `+26.2%` to `+99.7%` above the corresponding temporal estimates across tested classifiers.
2. **Probability Reliability (RQ2)**: Platt scaling reduced Brier score and ECE for the selected calibration workflows while preserving continuous rank ordering.
3. **Point vs. Quantile Severity (RQ3)**: The Conditional Median baseline achieved lower point MAE than the LightGBM quantile model in the reported temporal-validation and benchmark cohorts; quantile models remain useful for asymmetric uncertainty bounds.
4. **CQR Empirical Coverage (RQ4)**: Standard split-CQR finite-sample guarantees require exchangeability. Because later cohorts may be affected by temporal distribution shift, their coverage is reported as **empirical out-of-time validation**, not as a distribution-free guarantee under arbitrary shift. On the locked benchmark, nominal 90% CQR achieved `91.80%` empirical coverage with exact 95% CI `[81.90%, 97.28%]`.
5. **Operational Triage (RQ5)**: In the explicitly **SIMULATED SCENARIO**, uncertainty-aware ranking captured more high-severity delays at tight inspection capacities than risk-only ranking (for example, `8/15` vs. `1/15` at `K=1%`).

---

## 6. Claims Requiring Cautious Wording

- **Random-split mechanism**: Do not claim entity memorization as a proven causal mechanism; describe results as consistent with temporal dependence, autocorrelation, repeated entities, and non-stationarity.
- **Model hierarchy**: Do not call CatBoost the best predictive classifier. CatBoost is the **deployment-aligned primary model**; Random Forest is a **sensitivity comparator** and achieved higher PR-AUC in some evaluations.
- **Operational benefits**: Keep all prioritization outcomes labeled **SIMULATED SCENARIO**. Do not present simulated capture rates as realized financial savings or causal intervention effects.
- **Statistical wording**: Avoid terms such as "statistically significant" unless a corresponding hypothesis test is reported.
- **Cohort terminology**: Never substitute raw source-population positive counts for strict modeling-cohort positive counts.

---

## 7. Unsupported & Prohibited Claims

- [x] Describing the Locked Registry Evaluation Set as a newly unseen or untouched confirmatory holdout.
- [x] Claiming LightGBM quantile regression is a superior point estimator to the Conditional Median baseline.
- [x] Claiming direct financial savings without prospective operational evidence.
- [x] Selectively reporting only one nominal CQR level.
- [x] Claiming formal distribution-free CQR coverage under arbitrary temporal distribution shift.
- [x] Describing the strict 7,306-row development cohort as containing 1,125 delayed rows after the CI audit established the canonical count of 1,108.

---

## 8. Key Limitations

- Single public global-health logistics dataset (USAID SCMS).
- Historical observational evaluation without prospective intervention data.
- Modest positive count in the secondary benchmark (`N=61` delayed shipments).
- Potential temporal distribution shift means out-of-time CQR coverage is empirical rather than guaranteed.
- Decision utility is simulated rather than measured in a live logistics operation.

---

## 9. Submission-Package Status

Canonical Markdown/source documentation must use the corrected cohort counts. Any generated PDF/DOCX or dated ZIP produced before this post-freeze correction and still containing `1,125` as the development-delay count is **not the final submission artifact** and must be regenerated before journal upload.

The scientific model outputs and benchmark metrics are unchanged; this is a reporting/provenance correction, not a rerun or post-hoc metric change.

---

## 10. Publication Gate Verdict

### **EVIDENCE / CLAIM GOVERNANCE**: **PASS WITH DOCUMENTED POST-FREEZE COUNT CORRECTION**
### **CANONICAL SOURCE STATUS**: **CORRECTION APPLIED / REGENERATION REQUIRED FOR PRE-CORRECTION BINARIES**

No merge or journal submission should rely on a pre-correction generated manuscript package without regenerating it from corrected canonical sources.
