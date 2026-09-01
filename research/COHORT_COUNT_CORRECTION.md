# ORCA Research — Cohort Count Correction Note

**Date:** 2026-09-01  
**Status:** Documentation / reporting correction; frozen model outputs and experiment metrics are unchanged.

## Why this note exists

A new portable Research Integrity CI check read the versioned `research/outputs/scms_research_features.parquet` cache and exposed a reporting inconsistency in several narrative research files.

Earlier prose sometimes carried the raw SCMS delayed-shipment count into the strict modeling cohort by subtraction, describing the 7,306-row development cohort as containing **1,125 delays**. That count does not match the versioned feature cache actually used by `get_development_data()` and the temporal experiments.

## Canonical count hierarchy

| Cohort | Rows | Delays | Role |
|---|---:|---:|---|
| Raw standardized SCMS source population | 10,324 | 1,186 | Historical source population before strict prediction eligibility |
| Strict prediction-eligible modeling cohort | 8,319 | 1,169 | Versioned `scms_research_features.parquet` |
| Temporal development cohort (`T_pred < 2014-08-24`) | 7,306 | 1,108 | Primary model-development population |
| Locked registry benchmark | 1,013 | 61 | Secondary historical replication benchmark |

The 17-delay difference between the raw source population and the strict modeling cohort arises before modeling, through the prediction-eligibility / temporal-anchor / anomaly filtering path used to build the research feature cache.

## Temporal-fold evaluation counts

The five temporal validation windows in `research/outputs/metrics/temporal_fold_manifest.csv` contain:

- 3,277 validation observations in total; and
- **557 delayed validation observations** in total (`39 + 99 + 195 + 121 + 103`).

Therefore fold-averaged severity metrics should be described as results across the **five delayed validation subsets (557 delayed validation observations in total)**, not as if all 1,108 delayed development rows were independently evaluated once.

## What is unchanged

This correction does **not** change:

- the canonical source-data SHA-256;
- temporal split dates;
- the 90-day embargo policy;
- model training or predictions;
- calibration methods or frozen thresholds;
- recorded fold metrics;
- locked benchmark membership (`N=1,013`, `61` delays);
- benchmark PR-AUC/ROC-AUC/Brier/recall values;
- CQR benchmark coverage results;
- simulated decision-utility outputs.

## Frozen-contract handling

Historical freeze/manifests that already contain the earlier narrative `1,125` count are retained byte-for-byte when their hashes are part of the provenance record. They should be interpreted together with this correction note rather than silently rewritten after the fact.

Canonical current documentation should use **1,108 delayed rows for the 7,306-row development cohort** and should distinguish raw-population counts from strict modeling-cohort counts.

## Submission-package implication

Any generated manuscript PDF/DOCX or dated submission archive created before this correction should be regenerated from corrected canonical sources before journal submission if it contains the superseded `1,125` development-count wording. The numerical model-performance artifacts themselves are not invalidated by this reporting correction.
