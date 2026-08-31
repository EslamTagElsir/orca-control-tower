# Cover Letter for Submission to Transportation Research Part E

**Date**: August 31, 2026  

**To**:  
The Editors-in-Chief and Editorial Board  
*Transportation Research Part E: Logistics and Transportation Review*  
Elsevier Science  

**Subject**: Submission of Original Research Article  

**Manuscript Title**:  
*Temporal Evaluation, Calibrated Risk, and Conformal Delay-Severity Prediction in Pharmaceutical Logistics*  

Dear Editors,

We are pleased to submit our original research manuscript titled above for consideration for publication in *Transportation Research Part E: Logistics and Transportation Review*.

### Problem and Logistics Relevance
In global health and essential medicine distribution networks, delivery delays lead to stockouts, treatment interruptions, and costly emergency airfreight interventions. While predictive machine learning models are increasingly deployed in logistics control towers to anticipate disruptions, standard evaluation protocols in the literature frequently rely on random cross-validation. This practice introduces lookahead leakage from in-transit shipments and masks severe performance degradation under temporal distribution shift.

### Main Methodological and Empirical Contributions
This study develops and evaluates an integrated decision-intelligence framework that addresses four core challenges in logistics disruption management:
1. **Leakage-Safe Temporal Evaluation**: Using an 8-year dataset from the USAID Supply Chain Management System ($N = 10,324$ shipments across 42 countries), we demonstrate that standard random cross-validation overestimates precision-recall area under the curve (PR-AUC) by $+26.2\%$ to $+99.7\%$ relative to expanding temporal evaluation with 90-day post-delivery embargoes.
2. **Probability Calibration for Operational Triage**: We show that post-hoc Platt scaling improves risk probability calibration (reducing Expected Calibration Error from $0.2051$ to $0.0866$ on Random Forest) while strictly preserving continuous risk rankings.
3. **Decoupled Severity Modeling and Conformal Uncertainty**: We decouple delay occurrence from magnitude, showing that a simple conditional median baseline achieves superior point MAE ($15.62$ days) compared to gradient-boosted quantiles ($16.96$ days), while multi-quantile regressors enable Split Conformalized Quantile Regression (CQR) to provide finite-sample prediction intervals under temporal shifts ($91.80\%$ empirical coverage at $90\%$ nominal level on a secondary locked benchmark).
4. **Capacity-Constrained Operational Prioritization**: Under simulated inspection budgets ($K \in \{1\%, 5\%, 10\%, 20\%\}$), uncertainty-aware prioritization increases high-severity delay capture at tight capacities ($1/15 \to 8/15$ at $K=1\%$) relative to naive risk-only ranking.

### Fit with Transportation Research Part E
Our work directly aligns with the scope of *Transportation Research Part E* by addressing freight transportation reliability, lead-time uncertainty, logistics control tower decision support, and the operational trade-offs of capacity-constrained inspection. Rather than treating machine learning as a black box, the paper provides practical methodologies for evaluating and deploying predictive algorithms under real-world non-stationary logistics conditions.

### Declarations & Originality Statements
- **Originality**: This manuscript represents original research and has not been published previously.
- **No Simultaneous Submission**: The manuscript is not under consideration for publication elsewhere.
- **Data & Code Transparency**: The canonical dataset is publicly accessible via the USAID Open Data repository, and all replication scripts, temporal splits, and evaluation contracts are available in the research repository under cryptographic provenance hashes.
- **Ethics & Conflicts**: The authors declare no competing financial or commercial interests.

We thank you and the reviewers for your time and consideration of our work.

Sincerely,

`[AUTHOR INFORMATION REQUIRED: Corresponding Author Name]`  
`[AUTHOR INFORMATION REQUIRED: Academic Title & Department]`  
`[AUTHOR INFORMATION REQUIRED: Institution / University]`  
`[AUTHOR INFORMATION REQUIRED: Email Address]`  
`[AUTHOR INFORMATION REQUIRED: Physical Address & Phone]`  
