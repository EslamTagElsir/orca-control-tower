# Transportation Research Part E (TRE) Desk-Rejection Risk Audit

**Document ID**: `TRE_DESK_REJECTION_RISK_AUDIT_V1`  
**Date**: 2026-08-31  
**Target Journal**: *Transportation Research Part E: Logistics and Transportation Review*  
**Auditor**: Agent 6 (Skeptical Desk-Review Editor)  

---

## Executive Assessment
*Transportation Research Part E* (TRE) publishes high-impact research at the intersection of logistics, freight transportation, and operations research. Papers that present purely generic machine learning applications without deep logistics domain grounding, operational decision models, or structural transportation insights face high desk-rejection rates.

This audit evaluates the ORCA manuscript against TRE’s editorial standards, identifies potential desk-rejection risks, and specifies the required structural adaptations.

---

## Risk Evaluation Matrix

| Risk Dimension | Description & Potential Editorial Critique | Severity | Mitigation Strategy in TRE Adaptation Package | Residual Risk |
| :--- | :--- | :---: | :--- | :---: |
| **1. Generic ML Framing vs. Logistics Focus** | Paper perceived as an algorithmic benchmark rather than a transportation/logistics study. | **HIGH** | Frame all predictive tasks around international freight lead times, pre-outcome scheduling milestones, and transit-time variance. Position algorithms as components of an integrated logistics decision-intelligence framework. | **LOW** |
| **2. Single-Dataset Empirical Scope** | Study evaluated exclusively on the USAID SCMS global health logistics dataset ($N=10,324$). | **MEDIUM** | Justify dataset breadth: multi-year (2007–2015), multi-country (42 recipient nations), multi-modal (Air, Ocean, Truck), multi-product. Emphasize that the methodological framework (embargoes, calibration, CQR) is generic and transferable. Explicitly list dataset boundaries in Limitations. | **LOW** |
| **3. Operational Relevance & Decision Support** | Purely statistical metrics (PR-AUC, ECE) without direct operational logistics utility. | **MEDIUM** | Emphasize Stage 4: Capacity-Constrained Prioritization under inspection budgets ($K \in \{1\%, 5\%, 10\%, 20\%\}$). Demonstrate the operational trade-off between raw delay capture and catastrophic delay prevention. | **LOW** |
| **4. Temporal Validation Rigor** | Skepticism regarding why random cross-validation failure is a primary logistics contribution. | **LOW** | Motivate in-transit resolution lag: shipments in transit cannot have observed labels at prediction time without lookahead leakage. Quantify the $+26.2\%$ to $+99.7\%$ PR-AUC distortion. | **LOW** |
| **5. Claim Overstatement & Causal Leaps** | Overclaiming financial savings or asserting entity memorization as proven causation. | **LOW** | Maintain strict conservative wording: all triage analyses marked `[SIMULATED SCENARIO]`; random-split gap framed as *"consistent with temporal dependence"*; no claims of balance-sheet dollar savings. | **LOW** |
| **6. Dual-Model Transparency** | Concerns that primary model (CatBoost) was outperformed by comparator (Random Forest) on benchmark PR-AUC ($0.2709$ vs. $0.3195$). | **LOW** | Transparently report both models side-by-side without post-hoc role switching. Emphasize CatBoost as the deployment-aligned production model and Random Forest as the sensitivity baseline. | **LOW** |

---

## Summary of Required Editorial Actions for TRE Submission Package
1. **Title Alignment**: Recommend Option B: *"Temporal Evaluation, Calibrated Risk, and Conformal Delay-Severity Prediction in Pharmaceutical Logistics"*.
2. **Structural Re-organization**: Expand logistics domain motivation in Introduction and Discussion (buffer stock depletion, emergency airfreight escalation, freight mode congestion).
3. **Table Placement**: Retain core 6 operational tables in main text; package granular fold splits and reproducibility manifests in supplementary appendix.
4. **Highlights & Cover Letter**: Craft focused, evidence-based highlights and an editorial cover letter highlighting TRE fit.

---

## Desk-Review Verdict
# **APPROVED FOR TRE ADAPTATION (LOW RESIDUAL RISK)**
