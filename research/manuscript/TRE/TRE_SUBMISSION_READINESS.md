# Transportation Research Part E (TRE) Submission Readiness Report

**Document ID**: `TRE_SUBMISSION_READINESS_V3`  
**Date**: 2026-09-01  
**Target Journal**: *Transportation Research Part E: Logistics and Transportation Review*  
**Status**: **SOURCE CORRECTION APPLIED — REGENERATE SUBMISSION BINARIES BEFORE PORTAL PRECHECK**

---

## 1. Target Journal
- ***Transportation Research Part E: Logistics and Transportation Review* (Elsevier)**.

## 2. Recommended Title
**"Temporal Evaluation, Calibrated Risk, and Conformal Delay-Severity Prediction in Pharmaceutical Logistics"**

## 3. Journal / Novelty Fit
- **Journal fit**: strong alignment with freight lead-time uncertainty, shipment-delay risk, and capacity-constrained logistics decision support.
- **Novelty rating**: **moderate and defensible**.
- The approved novelty boundary is the qualified Level-2 joint-combination statement; broad absolute "first" claims are prohibited.

## 4. Canonical Evidence Hierarchy

A Research Integrity CI audit identified a post-freeze narrative count error. Canonical current counts are:

| Cohort | Rows | Delays | Role |
|---|---:|---:|---|
| Raw standardized SCMS source population | 10,324 | 1,186 | Historical source population |
| Strict prediction-eligible modeling cohort | 8,319 | 1,169 | Versioned research feature cache |
| Temporal development cohort | 7,306 | **1,108** | Primary development population |
| Locked registry benchmark | 1,013 | 61 | Secondary historical replication benchmark |

The five temporal validation windows contain `3,277` validation observations and **557 delayed validation observations** in total.

Earlier prose that described the 7,306-row development cohort as containing `1,125` delayed shipments is superseded by [`../../COHORT_COUNT_CORRECTION.md`](../../COHORT_COUNT_CORRECTION.md). Frozen hashed contracts/manifests are retained for provenance rather than silently rewritten after execution.

## 5. Scientific Boundaries

- The locked registry set is **secondary historical benchmark evidence**, not a newly untouched confirmatory holdout.
- CatBoost remains the deployment-aligned primary model; Random Forest remains the sensitivity comparator.
- The Conditional Median baseline remains the stronger point-MAE baseline where observed; LightGBM quantiles are used for asymmetric uncertainty roles.
- CQR coverage in later cohorts is empirical out-of-time validation, not a formal guarantee under arbitrary temporal shift.
- Operational prioritization remains explicitly **SIMULATED SCENARIO**.
- No realized savings or causal intervention effect is claimed.

## 6. Manuscript / Figure / Table Sources

- Canonical TRE manuscript: [`manuscript_TRE.md`](manuscript_TRE.md).
- LaTeX companion: [`manuscript_TRE.tex`](manuscript_TRE.tex).
- Figures: [`figures/`](figures/).
- Table placement: [`TABLE_PLACEMENT_PLAN.md`](TABLE_PLACEMENT_PLAN.md).
- Supplementary source: [`supplementary/supplementary_TRE.md`](supplementary/supplementary_TRE.md).

Any source that still carries the superseded `1,125` development-count wording must be corrected before regeneration.

## 7. Author Metadata / Declarations

- Author: **Eslam TagElsir**.
- Single and corresponding author.
- Affiliation: **Independent Researcher, Egypt**.
- ORCID: none supplied.
- Funding: no external funding.
- Competing interests: none declared.
- CRediT roles and AI disclosure remain finalized in the submission workspace.

## 8. Experimental Artifact Freeze

The post-freeze cohort-count correction does **not** alter model predictions, fold metrics, thresholds, temporal split dates, CQR benchmark outputs, or the locked benchmark membership. It corrects narrative cohort accounting discovered by CI.

## 9. Current Submission Verdict

# **DO NOT UPLOAD THE PRE-CORRECTION PDF/DOCX/ZIP**

The scientific evidence remains usable, but generated submission binaries created before the cohort-count correction must be regenerated from corrected canonical sources and re-previewed before journal upload.

## 10. Remaining Activity

1. Correct any remaining `1,125` development-count wording in canonical manuscript/table sources.
2. Regenerate manuscript/supplementary PDF and DOCX files.
3. Recompute package checksums and rebuild the submission ZIP.
4. Preview the regenerated files.
5. Re-check the live TRE Guide for Authors / Editorial Manager fields.
6. Only then mark the package **READY FOR FINAL PORTAL PRECHECK**.
