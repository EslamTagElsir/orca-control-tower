# ORCA Research Track — Manuscript Figure Plan

**Document ID**: `MANUSCRIPT_FIGURE_PLAN_V1`  
**Date**: 2026-08-31  
**Status**: `FIGURE_PLAN_FROZEN`  

---

## Overview of Manuscript Figures

| Figure Number | Title | Purpose & Visual Type | Underlying Artifact / Source File |
| :---: | :--- | :--- | :--- |
| **Figure 1** | **ORCA Methodological Framework & Pipeline Architecture** | Conceptual schematic showing the 4-stage pipeline: (1) Leakage-safe feature extraction, (2) Calibrated delay risk classification, (3) Conformal delay severity intervals, (4) Capacity-constrained operational triage. | Conceptual Diagram (Vector / TikZ / High-Res PNG) |
| **Figure 2** | **Chronological Splitting & Embargo Protocol** | Timeline schematic illustrating expanding-origin development folds, 90-day post-outcome embargoes, 6-month calibration buffer, and locked registry window. | Timeline Graphic / `research/outputs/metrics/temporal_fold_manifest.csv` |
| **Figure 3** | **Random Cross-Validation vs. Expanding Temporal Evaluation (RQ1)** | Grouped bar chart comparing PR-AUC under random 5-fold CV vs. 5-fold temporal CV across all 5 model families, highlighting optimism inflation. | `research/outputs/figures/temporal_pr_auc.png` |
| **Figure 4** | **Probability Calibration Reliability Curves (RQ2)** | Multi-panel reliability diagrams (Raw, Platt Scaling, Isotonic Regression) with 10 uniform probability bins and ECE annotations for CatBoost and Random Forest. | `research/outputs/figures/calibration_reliability_catboost.png`, `research/outputs/figures/locked_registry_calibration_catboost.png`, `locked_registry_calibration_rf.png` |
| **Figure 5** | **Temporal Metric Stability Across Development Folds** | Line chart showing PR-AUC, ROC-AUC, and Brier score trajectories across the 5 expanding temporal folds, showing resilience to prevalence shifts. | `research/outputs/figures/temporal_brier.png`, `research/outputs/figures/temporal_pr_auc.png` |
| **Figure 6** | **Conformal Prediction Interval Coverage vs. Sharpness Trade-off (RQ4)** | Dual-axis / two-panel plot displaying empirical coverage with exact 95% Clopper-Pearson error bars alongside mean and median interval width across 80%, 90%, and 95% nominal levels. | `research/outputs/figures/coverage_vs_width.png`, `research/outputs/figures/locked_registry_coverage_vs_width.png` |
| **Figure 7** | **Operational Decision Utility Across Inspection Capacities [SIMULATED SCENARIO] (RQ5)** | Comparative line curves of High-Severity Recall@K and Delay-Days Captured across $K \in \{1\%, 5\%, 10\%, 20\%\}$ comparing Risk-Only, Expected Severity, and Uncertainty-Aware triage. | `research/outputs/figures/decision_utility_at_k.png` |

---

## Detailed Figure Specifications & Design Guidelines

### Figure 1: Methodological Architecture
- **Visual Style**: Clean, publication-ready vector block diagram.
- **Key Elements**: Input shipment request $\to$ Temporal split filter $\to$ Platt-calibrated CatBoost / RF $\to$ LightGBM Quantile regressors with Conformal Adjustment $Q$ $\to$ Operational Priority Queue under capacity budget $K$.

### Figure 2: Chronological Timeline
- **Visual Style**: Horizontal Gantt-style timeline chart.
- **Key Elements**: Highlight the critical 90-day embargo periods preventing information leakage from delayed shipments whose delivery outcomes have not yet resolved at prediction time.

### Figure 3: Random vs. Temporal Evaluation
- **Visual Style**: High-contrast grouped bar chart with error bars.
- **Key Elements**: Clear visual delta highlighting that random CV overestimates PR-AUC by $+26.2\%$ to $+99.7\%$.

### Figure 4: Calibration Reliability Diagrams
- **Visual Style**: 3-panel horizontal grid per classifier.
- **Key Elements**: Diagonal dashed line $(y=x)$ representing perfect calibration; plotted empirical bin frequencies; inset ECE metric values.

### Figure 6: CQR Coverage and Sharpness
- **Visual Style**: Two-panel side-by-side plot.
- **Panel A**: Nominal vs. Empirical Coverage with exact 95% Clopper-Pearson error bars.
- **Panel B**: Mean and Median prediction interval width in days.

### Figure 7: Operational Decision Utility `[SIMULATED SCENARIO]`
- **Visual Style**: High-visibility multi-curve line plots.
- **Key Elements**: Prominent caption label `[SIMULATED SCENARIO]`. Clear visual separation between naive risk ranking and uncertainty-aware prioritization.
