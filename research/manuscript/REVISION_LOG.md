# Manuscript Revision Log

**Document ID**: `REVISION_LOG_V1`  
**Date**: 2026-08-31  

---

## Log of Revisions Addressed

| Revision ID | Addressed Review Item | Section Changed | Specific Action Taken |
| :--- | :--- | :--- | :--- |
| **REV-01** | **Issue M1: Random-Split Optimism Wording** | Abstract, Section 11.1, Section 14 | Standardized explanation to: *"consistent with temporal dependence and distribution structure"*, removing speculative causal claims. |
| **REV-02** | **Issue M2: Dual Reporting of Classifiers** | Abstract, Section 11.1, Section 12.1, Tables 2 & 6 | Standardized nomenclature: CatBoost as *deployment-aligned primary model* and Random Forest as *development PR-AUC sensitivity comparator*. Transparently reported Random Forest's higher benchmark PR-AUC ($0.3195$ vs. $0.2709$) and ROC-AUC ($0.7898$ vs. $0.7477$). |
| **REV-03** | **Issue M3: Unconditional CQR Reporting** | Abstract, Section 11.4, Section 12.2, Table 5 | Included all three nominal levels ($80\%$, $90\%$, $95\%$) with exact Clopper-Pearson 95% binomial confidence intervals. |
| **REV-04** | **Issue m1: Simulated Scenario Labeling** | Section 9, Section 13, Table 7 | Explicitly added **`[SIMULATED SCENARIO]`** tag to all operational triage headings, tables, and discussions. |
| **REV-05** | **Issue m2: Operational Headline Framing** | Section 13, Table 7 | Replaced relative percentage claims (+700%) with exact shipment counts ($1/15 \to 8/15$ at $K=1\%$) and absolute delay-day capture ratios. |
| **REV-06** | **Issue E1: Literature Placeholder Integrity** | References, `LITERATURE_GAPS.md` | Verified that all external bibliographic citations use explicit `[CITATION NEEDED: ...]` tags without any fabricated citations. |
