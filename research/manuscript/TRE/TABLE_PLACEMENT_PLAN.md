# Table Placement & Layout Plan for Transportation Research Part E

**Document ID**: `TABLE_PLACEMENT_PLAN_TRE_V1`  
**Date**: 2026-08-31  

---

## 1. Main Manuscript Tables (6 Core Tables)
To ensure optimal readability and adherence to TRE guidelines, the main manuscript incorporates the 6 most critical operational tables:

1. **Table 1 (Chronological Partition & Protocol)**: Summarizes the 5 expanding temporal development folds, 90-day embargoes, and secondary locked benchmark.
2. **Table 2 (Temporal Classifier Benchmark & Random Optimism)**: Reports PR-AUC, ROC-AUC, Brier score, and relative PR-AUC inflation ($+26.2\%$ to $+99.7\%$).
3. **Table 3 (Probability Calibration Comparison)**: Reports Brier score, ECE across 10 bins, and rank-preserving PR-AUC for raw, Platt, and isotonic calibration.
4. **Table 4 (Conditional Severity Point Estimation)**: Compares point MAE and Median AE on delayed shipments across Conditional Median, LightGBM quantiles, and Ridge regression.
5. **Table 5 (CQR Development Coverage & Sharpness)**: Reports empirical coverage, mean/median width, and adjustment $\bar{Q}$ across 80%, 90%, and 95% nominal levels.
6. **Table 6 (Operational Capacity-Constrained Prioritization [SIMULATED SCENARIO])**: Reports delay capture, high-severity delay capture, and delay-days ratio across $K \in \{1\%, 5\%, 10\%, 20\%\}$.

---

## 2. Supplementary Appendix Tables (Moved to Online Supplementary)
To avoid cluttering the main text while preserving complete reproducibility, granular tabular evidence is placed in Supplementary Material:
- **Table S1**: *Secondary Locked Registry Benchmark Detailed Multi-Metric Classification Table* (CatBoost vs. Random Forest precision, recall, F1, balanced accuracy, predicted probabilities).
- **Table S2**: *Pre-Outcome Feature Dictionary & Schema Definitions (39 variables)*.
- **Table S3**: *Exact Hyperparameter Specifications across all 5 Model Families*.
- **Table S4**: *Benchmark Replication Audit & Cross-Contract Hash Manifest*.
