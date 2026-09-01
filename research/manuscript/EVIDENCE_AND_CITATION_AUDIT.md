# Manuscript Evidence & Citation Audit Report

**Document ID**: `EVIDENCE_AND_CITATION_AUDIT_V2`  
**Date**: 2026-09-01  
**Evaluation Scope**: Canonical manuscript sources, generated tables/figures, provenance artifacts, canonical BibTeX, closest-prior-art review, and claim-governance documents.

---

## 1. Executive Verdict

# **PASS — EVIDENCE / CITATION INTEGRITY**

The manuscript evidence has been checked against canonical machine-readable outputs and the bibliography has passed a two-layer review: the foundational/domain bibliography audit plus the final closest-prior-art audit. Quantitative claims remain tied to frozen research outputs, while later temporal cohorts are described with empirical rather than overbroad theoretical guarantees.

This document records evidence/citation integrity. Current journal-submission status is governed by [`TRE/README.md`](TRE/README.md) and [`TRE/TRE_SUBMISSION_READINESS.md`](TRE/TRE_SUBMISSION_READINESS.md).

---

## 2. Numerical Artifact Audit

- Manuscript metrics were checked against canonical CSV artifacts under `research/outputs/tables/`.
- The audit registry is documented in [`EVIDENCE_AUDIT.csv`](EVIDENCE_AUDIT.csv).
- Important corrections made during the audit history include temporal-fold sample sizes, classifier Brier values, CQR interval widths, and the recipient-country count.

The purpose of this layer is to prevent narrative values from drifting away from generated artifacts.

---

## 3. Conformal Prediction / Temporal-Shift Boundary

Standard Split CQR provides finite-sample marginal coverage guarantees under exchangeability. Because the study evaluates temporally later cohorts under potential distribution shift, later-cohort coverage is treated as **empirical out-of-time validation**, not as a formal distribution-free guarantee under arbitrary shift.

For the 61-delay locked benchmark cohort, the exact 95% Clopper-Pearson intervals for empirical coverage are reported for all predeclared levels, including nominal 90% coverage of **91.80%** with CI **[81.90%, 97.28%]**.

---

## 4. Statistical Wording Governance

The final manuscript policy requires:

- no use of "statistically significant" unless an actual corresponding hypothesis test is reported;
- no "state-of-the-art" language unsupported by a direct benchmark against the relevant literature;
- transparent reporting that Random Forest achieved higher PR-AUC than CatBoost in some evaluations, while CatBoost remains the deployment-aligned primary model;
- transparent reporting that the Conditional Median baseline achieved lower point MAE than the LightGBM quantile model in the reported cohorts;
- decision-utility results labeled **SIMULATED SCENARIO** rather than realized operational or financial impact.

---

## 5. Bibliography Status

The canonical bibliography is [`references/references.bib`](references/references.bib).

Its current composition is **41 records**: 28 core/foundational/domain references plus 13 closest-prior-art records incorporated during the final priority review. Older intermediate narrative counts of 25 or 32 are superseded by [`references/FINAL_BIBLIOGRAPHY_INTEGRITY_REPORT.md`](references/FINAL_BIBLIOGRAPHY_INTEGRITY_REPORT.md).

The final closest-prior-art integrity report is [`priority_review/FINAL_PRIORITY_REFERENCE_INTEGRITY.md`](priority_review/FINAL_PRIORITY_REFERENCE_INTEGRITY.md). It clearly marks the retained Faulkner et al. 2026 item as a preprint rather than peer-reviewed evidence.

---

## 6. Citation Mapping

Historical placeholder/citation resolution is documented in [`references/CITATION_MAP.md`](references/CITATION_MAP.md).

Major scientific claims and their allowed/prohibited wording are mapped in [`CLAIM_TRACEABILITY.md`](CLAIM_TRACEABILITY.md). Those governance files, rather than stale prose summaries, are the preferred source when reconciling a manuscript statement with its evidence.

---

## 7. Novelty Boundary After Final Prior-Art Review

The final novelty assessment is **moderate and defensible**, not an unrestricted "first" claim.

The review explicitly identified prior work on pharmaceutical lead-time/delay prediction, occurrence-plus-duration models, conformal logistics uncertainty, and capacity-constrained decision frameworks. Therefore, broad claims such as "first ML study of pharmaceutical delays" or "first conformal prediction in logistics" are prohibited.

Approved Level-2 wording:

> **To the best of our knowledge, this is the first study to jointly evaluate, in pharmaceutical shipment logistics, a leakage-aware temporally ordered delay-risk pipeline with post-delivery embargoes, post-hoc probability calibration, conditional delay-severity modeling, conformalized quantile uncertainty, and capacity-constrained shipment prioritization.**

This wording is bounded by the documented literature search cutoff and must remain qualified.

---

## 8. Domain / Dataset Scope

The research uses the USAID SCMS Delivery History Dataset and remains bounded to historical global-health/pharmaceutical logistics. Generalization to other commercial supply chains requires local validation and calibration.

The canonical raw-data SHA-256 remains:

`918b992dd3e8d4b64d2a727b2c4ea607603d0c58f19484e73f7b78528c6a8673`

---

## 9. Residual Scientific Risks / Limitations

No unresolved **integrity blocker** was identified by this audit, but scientific limitations remain and must stay visible:

- one historical public logistics dataset;
- observational rather than prospective intervention evidence;
- only 61 delayed shipments in the secondary benchmark;
- temporal distribution shift limits formal coverage interpretations;
- simulated rather than realized decision utility.

"No integrity blocker" must not be rewritten as "no scientific risk."

---

## 10. Submission Readiness

# **EVIDENCE / CITATION AUDIT: PASS**

The canonical TRE workspace is **READY FOR FINAL PORTAL PRECHECK**. Live journal requirements, final rendered files, and portal metadata must still be checked immediately before submission as documented in the TRE workspace.
