# Literature Gap Tracking & Citation Verification Plan

**Document ID**: `LITERATURE_GAPS_V1`  
**Date**: 2026-08-31  
**Status**: `TRACKING_FOR_SUBMISSION`  

To maintain strict scientific integrity, no artificial citations, fake author names, or invented DOIs have been introduced into the manuscript. All external bibliographic references are denoted with explicit bracketed placeholders `[CITATION NEEDED: <Category>]`.

Before formal journal submission, an external literature indexing pass should map these placeholders to verified, peer-reviewed publications.

---

## Required Citation Categories & Literature Scope

| Placeholder Tag | Topical Category | Target Scholarly Scope & Representative Venue Areas |
| :--- | :--- | :--- |
| `[CITATION NEEDED: pharmaceutical supply chain vulnerability]` | Global health logistics, essential medicine stockouts, antiretroviral therapy supply chains | *Bulletin of the WHO*, *The Lancet Global Health*, *Journal of Operations Management* |
| `[CITATION NEEDED: supply chain delay prediction]` | Supervised machine learning, tree ensembles, and deep learning applied to freight, shipping, and port delay forecasting | *Transportation Research Part E*, *Computers & Industrial Engineering*, *Decision Support Systems* |
| `[CITATION NEEDED: temporal evaluation leakage in ML]` | Data leakage, future lookahead bias, cross-validation over-optimism under non-stationary distributions and time series | *Journal of Machine Learning Research*, *Machine Learning*, *IEEE TKDE*, *Nature Machine Intelligence* |
| `[CITATION NEEDED: temporal embargoes and purging]` | Purging, embargoing, and combinatorial purged cross-validation in financial and temporal forecasting | Advances in Financial Machine Learning, *Quantitative Finance*, *Journal of Financial Data Science* |
| `[CITATION NEEDED: probability calibration fundamentals]` | Post-hoc probability calibration, Platt scaling (logistic sigmoid), and isotonic regression under class imbalance | *ICML*, *NeurIPS*, *Machine Learning*, *Biometrika* |
| `[CITATION NEEDED: expected calibration error]` | Brier score decomposition, reliability diagrams, uniform vs. adaptive Expected Calibration Error (ECE) | *PMLR (Guo et al. on modern calibration)*, *Electronic Journal of Statistics* |
| `[CITATION NEEDED: conformalized quantile regression]` | Conformal prediction theory, Split Conformalized Quantile Regression (CQR), finite-sample distribution-free validity | *NeurIPS (Romano et al.)*, *Journal of the Royal Statistical Society: Series B*, *Annals of Statistics* |
| `[CITATION NEEDED: quantile regression in operations]` | Asymmetric pinball loss, conditional quantile regression for lead-time and demand uncertainty in inventory control | *Management Science*, *Operations Research*, *Manufacturing & Service Operations Management* |
| `[CITATION NEEDED: capacity-constrained operational triage]` | Decision prioritization under inspection capacity, risk-based auditing, selective queue management in logistics | *European Journal of Operational Research*, *IISE Transactions*, *Production and Operations Management* |
| `[CITATION NEEDED: USAID SCMS program]` | President's Emergency Plan for AIDS Relief (PEPFAR), USAID Supply Chain Management System (SCMS) delivery history dataset background | USAID Technical Reports, Supply Chain Public Documentation |

---

## Verification Protocol for Final Submission
1. Search bibliographic databases (Google Scholar, Web of Science, Scopus, Semantic Scholar) using the scope descriptors above.
2. Select seminal and recent (2018–2025) peer-reviewed papers for each category.
3. Replace bracketed placeholders with standard BibTeX keys and compile a `references.bib` file.
4. Verify all DOIs and author lists for authenticity.
