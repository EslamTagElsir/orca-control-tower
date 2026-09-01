# ORCA Research Track — Final Publication Gate Report

**Document ID**: `PUBLICATION_GATE_V2`  
**Date**: 2026-09-01  
**Status**: `PUBLICATION_GATE_COMPLETE`  
**Frozen evaluation commit**: `6f71396ac38466c9d18e2706bea8688d9c2ea8ac`  
**Canonical Dataset SHA-256**: `918b992dd3e8d4b64d2a727b2c4ea607603d0c58f19484e73f7b78528c6a8673`  
**Evaluation Freeze SHA-256**: `631F1FA4241FBE697B46D9658B8720D2CE13CFB5A9F65E32C7532F8A1F6CD21A`  
**Benchmark Manifest SHA-256**: `62BE80CE9BC977767BC983EDABF61DAA23609A1801251F4E93CFA9693EBDD9AB`  

---

## 1. Evidence Integrity

The research evidence is strictly partitioned and verified:
- **Primary Evidence Base**: 5-fold expanding-origin temporal development evaluation ($N = 7,306$ shipments, $1,125$ delays) with strict 90-day embargoes enforcing post-outcome label maturity.
- **Secondary Evidence Base**: Locked Registry Evaluation Set ($N = 1,013$ shipments, $61$ delays, $T_{\text{pred}} \in [\text{2014-08-24}, \text{2015-08-24}]$), functioning strictly as a secondary replication benchmark because it had been evaluated historically by the serving registry.

---

## 2. Provenance Integrity

- **Cryptographic Traceability**: The pre-registration contract [`contracts/FINAL_EVALUATION_FREEZE.json`](contracts/FINAL_EVALUATION_FREEZE.json) (SHA-256: `631F1FA4...`) was sealed and hashed prior to benchmark execution.
- **Benchmark Manifest**: The execution output manifest [`outputs/LOCKED_REGISTRY_MANIFEST.json`](outputs/LOCKED_REGISTRY_MANIFEST.json) (SHA-256: `62BE80CE...`) references the frozen contract, evaluation commit, and dataset hash.
- **Provenance Verdict**: **PASS — traceable and internally consistent**.

---

## 3. Primary Methodological Contribution

The central contribution is an integrated decision-intelligence framework for pharmaceutical supply-chain delay mitigation:
1. **Leakage-aware temporal protocol**: expanding temporal splits plus 90-day post-delivery embargoes.
2. **Calibrated probability estimation**: post-hoc Platt scaling for class-imbalanced delay risk.
3. **Conditional severity and uncertainty**: quantile models plus Split Conformalized Quantile Regression (CQR).
4. **Capacity-constrained prioritization**: simulated logistics triage under inspection bandwidths ($K \in \{1\%, 5\%, 10\%, 20\%\}$).

---

## 4. Publication Novelty Assessment

- **Novelty Classification**: **MODERATE & DEFENSIBLE**.
- Individual algorithms are established methods. The contribution is the carefully governed joint evaluation of temporal leakage controls, probability calibration, conditional severity, conformal uncertainty, and constrained prioritization in pharmaceutical/global-health shipment logistics.
- Broad absolute priority claims are prohibited. The manuscript uses the qualified Level-2 wording governed by [`manuscript/priority_review/FINAL_PRIORITY_REFERENCE_INTEGRITY.md`](manuscript/priority_review/FINAL_PRIORITY_REFERENCE_INTEGRITY.md).

---

## 5. Supported Scientific Claims

1. **Random-Split Optimism (RQ1)**: Random-split evaluation produced PR-AUC estimates $+26.2\%$ to $+99.7\%$ above the corresponding temporal estimates across tested classifiers.
2. **Probability Reliability (RQ2)**: Platt scaling reduced Brier score and ECE for the selected calibration workflows while preserving continuous rank ordering.
3. **Point vs. Quantile Severity (RQ3)**: The Conditional Median baseline achieved lower point MAE than the LightGBM quantile model in the reported development and benchmark cohorts; quantile models remain useful for asymmetric uncertainty bounds.
4. **CQR Empirical Coverage (RQ4)**: Standard split-CQR finite-sample guarantees require exchangeability. Because later cohorts may be affected by temporal distribution shift, their coverage is reported as **empirical out-of-time validation**, not as a distribution-free guarantee under arbitrary shift. On the locked benchmark, nominal 90% CQR achieved 91.80% empirical coverage with exact 95% CI $[81.90\%, 97.28\%]$.
5. **Operational Triage (RQ5)**: In the explicitly **SIMULATED SCENARIO**, uncertainty-aware ranking captured more high-severity delays at tight inspection capacities than risk-only ranking (for example, $8/15$ vs. $1/15$ at $K=1\%$).

---

## 6. Claims Requiring Cautious Wording

- **Random-split mechanism**: Do not claim entity memorization as a proven causal mechanism; describe results as consistent with temporal dependence, autocorrelation, repeated entities, and non-stationarity.
- **Model hierarchy**: Do not call CatBoost the best predictive classifier. CatBoost is the **deployment-aligned primary model**; Random Forest is a **sensitivity comparator** and achieved higher PR-AUC in some evaluations.
- **Operational benefits**: Keep all prioritization outcomes labeled **SIMULATED SCENARIO**. Do not present simulated capture rates as realized financial savings or causal intervention effects.
- **Statistical wording**: Avoid terms such as "statistically significant" unless a corresponding hypothesis test is reported.

---

## 7. Unsupported & Prohibited Claims

- [x] Describing the Locked Registry Evaluation Set as a newly unseen or untouched confirmatory holdout.
- [x] Claiming LightGBM quantile regression is a superior point estimator to the Conditional Median baseline.
- [x] Claiming direct financial savings without prospective operational evidence.
- [x] Selectively reporting only one nominal CQR level.
- [x] Claiming formal distribution-free CQR coverage under arbitrary temporal distribution shift.

---

## 8. Required Tables & Figures

- **Tables**: dataset protocol; classifier benchmark/random-vs-temporal comparison; calibration; severity; CQR coverage/sharpness; locked benchmark; decision-utility simulation.
- **Figures**: framework; temporal protocol; random-vs-temporal PR-AUC; calibration; temporal stability; CQR coverage/width; simulated decision utility.

Canonical generated artifacts are under [`outputs/`](outputs/) and manuscript-ready materials are under [`manuscript/TRE/`](manuscript/TRE/).

---

## 9. Key Limitations

- Single public global-health logistics dataset (USAID SCMS).
- Historical observational evaluation without prospective intervention data.
- Modest positive count in the secondary benchmark ($N=61$ delayed shipments).
- Potential temporal distribution shift means out-of-time CQR coverage is empirical rather than guaranteed.
- Decision utility is simulated rather than measured in a live logistics operation.

---

## 10. Manuscript Framing

Frame the paper around **temporal evaluation discipline, calibrated risk, uncertainty-aware severity, and bounded decision-support utility**. The paper should emphasize realistic performance under temporally ordered evaluation rather than promotional model-performance language.

---

## 11. Target Venue Assessment

The current venue-adapted manuscript targets *Transportation Research Part E: Logistics and Transportation Review*. Other applied operations-research / decision-support venues may be considered if required; venue fit is distinct from scientific-integrity status.

---

## 12. Remaining Scientific Blockers

- **Unresolved evidence-integrity blockers**: **NONE IDENTIFIED**.
- Residual limitations and uncertainty remain explicitly documented and must not be converted into stronger claims.
- Final live journal-portal and Guide-for-Authors checks are procedural submission steps, not scientific evidence gates.

---

## 13. Publication Gate Verdict

### **EVIDENCE / CLAIM GOVERNANCE**: **PASS**
### **MANUSCRIPT STATUS**: **READY FOR FINAL PORTAL PRECHECK**

The dated experimental artifacts remain frozen. This gate update only aligns documentation, links, terminology, and claim boundaries with the final evidence and citation audits.
