# Reproducibility Statement & Artifact Governance

**Document ID**: `REPRODUCIBILITY_STATEMENT_TRE_V1`  
**Date**: 2026-08-31  

---

## 1. Canonical Dataset Provenance
- **Dataset Title**: USAID Supply Chain Management System (SCMS) Delivery History Dataset.
- **Data Repository**: U.S. President's Emergency Plan for AIDS Relief (PEPFAR) / USAID Open Data (`https://data.usaid.gov`).
- **Canonical Raw CSV SHA-256**:
  `918b992dd3e8d4b64d2a727b2c4ea607603d0c58f19484e73f7b78528c6a8673`
- **Total Transactions**: $N = 10,324$ shipment records (2007–2015).
- **Delayed Transactions**: $1,186$ shipments ($11.488\%$ delay prevalence).

---

## 2. Research Code & Environment
- **Programming Language**: Python 3.11+ / 3.14 compatible.
- **Core Dependencies**: `pandas`, `numpy`, `scikit-learn`, `catboost`, `lightgbm`, `xgboost`, `scipy`.
- **Reproducibility Guarantee**: Pre-registered execution contracts (`FINAL_EVALUATION_FREEZE.json`, SHA-256: `631F1FA4241FBE697B46D9658B8720D2CE13CFB5A9F65E32C7532F8A1F6CD21A`).
- **Secondary Benchmark Manifest**: `LOCKED_REGISTRY_MANIFEST.json` (SHA-256: `62BE80CE9BC977767BC983EDABF61DAA23609A1801251F4E93CFA9693EBDD9AB`).

---

## 3. Automated Test Suite
- **Test Harness**: `pytest` running across 26 automated unit and integration tests (`backend/tests`, `research/tests`).
- **Verification Properties**: Feature schema validation, temporal fold disjointness, post-delivery embargo compliance, exact Clopper-Pearson CI computation, ECE mathematical bounded bounds, and artifact provenance hashing.
- **Test Result**: **26 / 26 PASSED (100%)**.
