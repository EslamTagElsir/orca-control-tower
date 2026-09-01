# Internal Skeptical Peer Review Report

**Document ID**: `INTERNAL_PEER_REVIEW_V1`  
**Date**: 2026-08-31  
**Reviewer**: Agent 6 (Skeptical Peer Reviewer)  
**Manuscript Reviewed**: *Calibrated Delay Risk and Conformal Severity Prediction under Temporal Distribution Shift in Pharmaceutical Supply Chains* (Version 1.0.0)  

---

## Overall Assessment
The manuscript presents a methodologically sound, rigorously governed study. The experimental progression is reproducible, and the evidence hierarchy strictly distinguishes between primary development and secondary locked replication evidence. 

However, several areas require careful editorial and methodological calibration to avoid inadvertent overclaiming before journal submission.

---

## Detailed Review Items

### 1. Major Issues
- **Issue M1: Clarification of Random-Split Optimism Wording**:
  - *Observation*: In earlier drafts, random split optimism was occasionally linked informally to "entity memorization".
  - *Review Directive*: Ensure all instances in the abstract, introduction, results, and discussion adhere strictly to the conservative pre-registered language: *"consistent with temporal dependence and distribution structure"*, without asserting entity memorization as a proven causal fact.
  - *Status*: Addressed in Section 11.1 and Abstract.

- **Issue M2: Complete Dual Reporting of Primary vs. Sensitivity Models**:
  - *Observation*: Random Forest achieved higher PR-AUC ($0.3195$ vs. $0.2709$) and ROC-AUC ($0.7898$ vs. $0.7477$) on the locked benchmark.
  - *Review Directive*: Ensure CatBoost is never described as "the best performing model". CatBoost must be consistently termed the "deployment-aligned primary model" and Random Forest the "development PR-AUC sensitivity comparator".
  - *Status*: Verified in Tables 2, 6 and Section 12.1.

- **Issue M3: Unconditional Reporting of All Three CQR Levels**:
  - *Observation*: Avoid any tendency to focus solely on the $90\%$ nominal level.
  - *Review Directive*: Explicitly report $80\%$, $90\%$, and $95\%$ nominal coverage levels with their exact Clopper-Pearson binomial confidence intervals in the abstract, Table 5, Table 6, and Section 12.2.
  - *Status*: Fully reported across all sections.

### 2. Minor Issues
- **Issue m1: Labeling of Operational Triage**:
  - *Observation*: Operational triage numbers could be misinterpreted as measured retrospective logistics savings.
  - *Review Directive*: Enforce the mandatory label **`[SIMULATED SCENARIO]`** across Section 9, Section 13, Table 7, and Figure 7.
  - *Status*: Enforced across all headings and tables.

- **Issue m2: Tone Down Headline Percentage Claims**:
  - *Observation*: Relative percentages such as "+700%" can appear sensational in academic peer review.
  - *Review Directive*: Frame operational improvements using exact shipment counts (e.g., "high-severity capture increased from 1/15 to 8/15 at K=1%") and absolute capture ratios.
  - *Status*: Updated throughout Section 13 and Table 7.

### 3. Editorial Items
- **Issue E1: Literature Placeholder Integrity**:
  - *Observation*: Verified that no artificial author names, fake journals, or invented DOIs were inserted. All external citations are tracked as `[CITATION NEEDED: <Category>]` in `research/manuscript/references/LITERATURE_GAPS.md`.
  - *Status*: Verified.

---

## Review Recommendation
- **Verdict**: **ACCEPT WITH MINOR EDITORIAL REVISIONS** (Revisions documented in `REVISION_LOG.md`).
