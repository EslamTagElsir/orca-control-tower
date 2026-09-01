# ORCA Research Track — Manuscript Blueprint

**Document ID**: `MANUSCRIPT_BLUEPRINT_V1`  
**Date**: 2026-08-31  
**Status**: `BLUEPRINT_FROZEN`  

---

## Section-by-Section Manuscript Plan

### Section 1: Abstract
- **Purpose**: Provide a self-contained 250-word synthesis of the problem, methodological framework, empirical findings, and operational implications.
- **Evidence Used**: 5-fold expanding temporal development summary and locked registry replication benchmark.
- **Claims Allowed**: Quantitative random-split inflation ($+26.2\%$ to $+99.7\%$), calibrated delay discrimination (PR-AUC $0.2709$ to $0.3238$), valid 90% CQR coverage ($85.8\%$ development, $91.8\%$ benchmark), and operational high-severity prioritization under capacity constraints.
- **Tables/Figures Referenced**: High-level synthesis.

### Section 2: Introduction
- **Purpose**: Motivate the critical nature of global health supply chains, explain the risks of uncalibrated delay models, formalize the core research questions (RQ1–RQ5), and articulate the four-stage framework contribution.
- **Evidence Used**: Global health logistics context (USAID SCMS antiretroviral distribution).
- **Claims Allowed**: Need for temporal evaluation discipline, probability calibration, and uncertainty-aware operational support.
- **Tables/Figures Referenced**: Figure 1 (ORCA Architectural Framework).

### Section 3: Related Work
- **Purpose**: Situate the study within the literature on: (1) Machine learning for supply chain delay prediction, (2) Temporal distribution shift and evaluation leakage, (3) Post-hoc probability calibration in class-imbalanced settings, and (4) Conformalized quantile regression for prediction uncertainty.
- **Evidence Used**: Published literature in operations management, applied ML, and conformal inference.
- **Claims Allowed**: Methodological synthesis of existing components; absence of integrated temporal-conformal operational systems in prior supply chain delay literature.
- **Tables/Figures Referenced**: None.

### Section 4: Data and Prediction-Time Problem Formulation
- **Purpose**: Define the prediction point $T_{\text{pred}}$, mathematically define the binary delay label $Y \in \{0, 1\}$ and continuous severity $S \in \mathbb{R}_{\ge 0}$, and define the pre-outcome feature space $\mathcal{X}$.
- **Evidence Used**: USAID SCMS Delivery History dataset ($N = 10,324$ shipments, 39 pre-outcome features).
- **Claims Allowed**: Strict pre-outcome feature cutoff; elimination of post-delivery leakage variables.
- **Tables/Figures Referenced**: Table 1 (Dataset Summary).

### Section 5: Leakage and Temporal Evaluation Protocol
- **Purpose**: Formulate the expanding-origin temporal validation design, explain the post-outcome delivery delay lag, and mathematically define the 90-day temporal embargo buffer.
- **Evidence Used**: 5 temporal development folds ($N = 7,306$) and the 90-day embargo schedule.
- **Claims Allowed**: Random splitting causes artificial optimism due to temporal dependence and future leakage; temporal splits with embargoes provide realistic out-of-distribution evaluation.
- **Tables/Figures Referenced**: Table 1 (Split Protocol), Figure 2 (Temporal Timeline).

### Section 6: Delay-Risk Classification
- **Purpose**: Present candidate classifier architectures (Logistic Regression, Random Forest, LightGBM, XGBoost, CatBoost) and define the primary evaluation metrics (PR-AUC, ROC-AUC, Brier score).
- **Evidence Used**: Development fold results (`classification_fold_results.csv`).
- **Claims Allowed**: Relative performance across tabular architectures under expanding temporal evaluation. CatBoost as deployment-aligned primary model; Random Forest as sensitivity comparator.
- **Tables/Figures Referenced**: Table 2 (Classifier Benchmark), Figure 3 (Random vs. Temporal PR-AUC).

### Section 7: Probability Calibration
- **Purpose**: Address probability unreliability in tree ensembles under class imbalance. Present Platt scaling (logistic sigmoid) and Isotonic regression fitted on temporal calibration buffers.
- **Evidence Used**: Calibration study results (`calibration_results.csv`).
- **Claims Allowed**: Platt scaling reduces Brier score and ECE while strictly preserving continuous risk ranking (PR-AUC) for operational triage.
- **Tables/Figures Referenced**: Table 3 (Calibration Comparison), Figure 4 (Reliability Diagrams).

### Section 8: Conditional Delay-Severity Modeling
- **Purpose**: Formulate the severity prediction problem conditional on delay ($Y=1$). Benchmark Conditional Median Baseline against Gradient-Boosted Quantile Regressors and Ridge regression.
- **Evidence Used**: Severity benchmark on delayed training cohorts (`severity_results.csv`).
- **Claims Allowed**: Conditional Median Baseline achieves superior point MAE; quantile regressors capture asymmetric tail distribution for interval construction.
- **Tables/Figures Referenced**: Table 4 (Severity Benchmark).

### Section 9: Conformal Prediction Intervals
- **Purpose**: Formulate Split Conformalized Quantile Regression (CQR). Define non-conformity scores, finite-sample adjustment quantile $Q$, and unconditional evaluation across 80%, 90%, and 95% nominal levels.
- **Evidence Used**: Conformal development results (`conformal_results.csv`).
- **Claims Allowed**: Valid empirical coverage guarantees under temporal shift; coverage-sharpness trade-off.
- **Tables/Figures Referenced**: Table 5 (CQR Benchmark), Figure 6 (Coverage vs. Width).

### Section 10: Capacity-Constrained Decision Prioritization [SIMULATED SCENARIO]
- **Purpose**: Simulate operational triage under fixed inspection bandwidths $K \in \{1\%, 5\%, 10\%, 20\%\}$. Formulate naive risk, expected severity, and uncertainty-aware priority scores.
- **Evidence Used**: Decision utility simulation (`decision_utility.csv`).
- **Claims Allowed**: Trade-off between total delay capture and high-severity delay capture. Significant improvement in high-severity capture at low capacity ($K=1\%, 5\%$).
- **Tables/Figures Referenced**: Table 7 (Decision Utility), Figure 7 (Decision Utility Curves).

### Section 11: Experimental Results
- **Purpose**: Synthesize all development experiments answering RQ1–RQ5 with statistical confidence intervals and ablation analyses.
- **Evidence Used**: Primary 5-fold temporal development results (`development_metrics_with_ci.csv`, `ablation_summary.csv`).
- **Claims Allowed**: Primary research claims supported by expanding temporal development distributions.
- **Tables/Figures Referenced**: Tables 2–5, Figures 3–6.

### Section 12: Secondary Locked Registry Benchmark
- **Purpose**: Present the single one-pass secondary evaluation on the historically evaluated Locked Registry Evaluation Set ($N = 1,013$, 61 delays).
- **Evidence Used**: `locked_registry_classification.csv`, `locked_registry_cqr.csv`, `LOCKED_REGISTRY_REPLICATION_AUDIT.md`.
- **Claims Allowed**: Secondary replication check confirming out-of-distribution discrimination, calibration gains, and valid CQR coverage under low delay prevalence.
- **Tables/Figures Referenced**: Table 6 (Locked Registry Benchmark).

### Section 13: Discussion
- **Purpose**: Contextualize findings for operations researchers, supply chain managers, and applied machine learning practitioners. Contrast empirical realities with optimistic literature claims.
- **Evidence Used**: All experimental outputs.
- **Claims Allowed**: Operational implications, trade-offs between risk and severity prioritization, and governance principles for decision-support systems.
- **Tables/Figures Referenced**: Cross-referencing all tables and figures.

### Section 14: Limitations
- **Purpose**: Rigorously document empirical, methodological, and domain boundaries.
- **Evidence Used**: Audit of dataset, sample sizes, and simulation assumptions.
- **Claims Allowed**: Explicit disclosure of single-dataset scope, small benchmark delay count ($N=61$), and absence of live operational trial data.
- **Tables/Figures Referenced**: Reference to `PUBLICATION_LIMITATIONS.md`.

### Section 15: Reproducibility and Evidence Governance
- **Purpose**: Provide full provenance documentation: cryptographic hashes, pre-registration contracts, random seeds, and artifact manifests.
- **Evidence Used**: `FINAL_EVALUATION_FREEZE.json`, `LOCKED_REGISTRY_MANIFEST.json`, test suite results.
- **Claims Allowed**: Verifiable end-to-end reproducibility and strict separation of primary development from secondary replication evidence.
- **Tables/Figures Referenced**: Manifest and contract hashes.

### Section 16: Conclusion
- **Purpose**: Summarize key insights and propose future research directions (prospective field trials, multi-enterprise federated logistics).
- **Evidence Used**: Overall study synthesis.
- **Claims Allowed**: Concluding summary of the four-stage framework and empirical findings.
- **Tables/Figures Referenced**: None.
