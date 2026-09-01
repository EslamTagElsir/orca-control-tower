"""ORCA Research Track: Machine-Readable Manuscript Table Generator.

Reads canonical CSV outputs and formats publication-ready Markdown and LaTeX tables
without retraining or modifying any canonical data.
"""

from pathlib import Path
import pandas as pd
import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[3]
TABLES_DIR = REPO_ROOT / "research" / "outputs" / "tables"
METRICS_DIR = REPO_ROOT / "research" / "outputs" / "metrics"

def generate_table1_dataset_protocol():
    """Table 1: Dataset Partition Summary and Expanding Temporal Folds."""
    manifest = pd.read_csv(METRICS_DIR / "temporal_fold_manifest.csv")
    rows = []
    for _, r in manifest.iterrows():
        f_id = int(r["fold_id"])
        tr_prev = (r["train_positive_rows"] / r["train_rows"]) * 100
        va_prev = (r["validation_positive_rows"] / r["validation_rows"]) * 100
        rows.append({
            "Split Identifier": f"Fold {f_id}: Train",
            "Temporal Window": f"T_pred <= {r['train_end']}",
            "Total Rows (N)": f"{int(r['train_rows']):,}",
            "Delayed Rows (N_pos)": f"{int(r['train_positive_rows']):,}",
            "Delay Prevalence (%)": f"{tr_prev:.2f}%",
            "Scientific Role": "Development Training Cohort",
        })
        rows.append({
            "Split Identifier": f"Fold {f_id}: Validation",
            "Temporal Window": f"{r['validation_start']} <= T_pred <= {r['validation_end']}",
            "Total Rows (N)": f"{int(r['validation_rows']):,}",
            "Delayed Rows (N_pos)": f"{int(r['validation_positive_rows']):,}",
            "Delay Prevalence (%)": f"{va_prev:.2f}%",
            "Scientific Role": f"Development Temporal Fold {f_id}",
        })
    rows.append({
        "Split Identifier": "Calibration Buffer",
        "Temporal Window": "2014-02-25 <= T_pred < 2014-08-24",
        "Total Rows (N)": "717",
        "Delayed Rows (N_pos)": "103",
        "Delay Prevalence (%)": "14.37%",
        "Scientific Role": "Platt & Conformal Calibration Split",
    })
    rows.append({
        "Split Identifier": "Locked Registry Benchmark",
        "Temporal Window": "2014-08-24 <= T_pred <= 2015-08-24",
        "Total Rows (N)": "1,013",
        "Delayed Rows (N_pos)": "61",
        "Delay Prevalence (%)": "6.02%",
        "Scientific Role": "Secondary Replication Benchmark",
    })
    return pd.DataFrame(rows)

def generate_table2_classifiers():
    """Table 2: Temporal Classifier Benchmark & Random-Split Optimism."""
    df = pd.read_csv(TABLES_DIR / "random_vs_temporal.csv")
    rows = []
    for _, r in df.iterrows():
        infl = ((r["random_PR_AUC"] - r["temporal_mean_PR_AUC"]) / r["temporal_mean_PR_AUC"]) * 100
        rows.append({
            "Classifier Architecture": r["model"],
            "Temporal Mean PR-AUC": f"{r['temporal_mean_PR_AUC']:.4f}",
            "Temporal Mean ROC-AUC": f"{r['temporal_mean_ROC_AUC']:.4f}",
            "Temporal Mean Brier": f"{r['temporal_mean_Brier']:.4f}",
            "Random-Split PR-AUC": f"{r['random_PR_AUC']:.4f}",
            "Relative PR-AUC Inflation": f"+{infl:.1f}%",
        })
    return pd.DataFrame(rows)

def generate_table3_calibration():
    """Table 3: Probability Calibration Comparison."""
    df = pd.read_csv(TABLES_DIR / "calibration_summary.csv")
    rows = []
    method_map = {
        "uncalibrated": "Raw Uncalibrated",
        "platt_scaling": "Platt / Sigmoid Scaling",
        "isotonic_regression": "Isotonic Regression",
    }
    for _, r in df.iterrows():
        rows.append({
            "Model": r["model"],
            "Calibration Strategy": method_map.get(r["calibration_method"], r["calibration_method"]),
            "Brier Score (mean +- SD)": f"{r['brier_score_mean']:.4f} +- {r['brier_score_std']:.4f}",
            "ECE 10-Bins (mean +- SD)": f"{r['expected_calibration_error_mean']:.4f} +- {r['expected_calibration_error_std']:.4f}",
            "Validation PR-AUC": f"{r['pr_auc_mean']:.4f} +- {r['pr_auc_std']:.4f}",
        })
    return pd.DataFrame(rows)

def generate_table4_severity():
    """Table 4: Conditional Delay-Severity Benchmark."""
    df = pd.read_csv(TABLES_DIR / "severity_summary.csv")
    rows = []
    for _, r in df.iterrows():
        rows.append({
            "Severity Model": r["model"],
            "Evaluated Cohort": "1,125 delays",
            "MAE (Days +- SD)": f"{r['mae_mean']:.2f} +- {r['mae_std']:.2f} d",
            "Median AE (Days +- SD)": f"{r['median_ae_mean']:.2f} +- {r['median_ae_std']:.2f} d",
            "Pinball Loss q0.50": f"{r['pinball_q50_mean']:.2f}" if pd.notna(r["pinball_q50_mean"]) else "-",
        })
    return pd.DataFrame(rows)

def generate_table5_cqr():
    """Table 5: Conformalized Quantile Regression Coverage and Sharpness."""
    df = pd.read_csv(TABLES_DIR / "conformal_summary.csv")
    rows = []
    for _, r in df.iterrows():
        nom = int(r["nominal_coverage"] * 100)
        cov = r["empirical_coverage_mean"] * 100
        cov_sd = r["empirical_coverage_std"] * 100
        err = r["coverage_error_mean"] * 100
        w_mean = r["mean_interval_width_mean"]
        w_sd = r["mean_interval_width_std"]
        w_med = r["median_interval_width_mean"]
        q_adj = r["q_adjustment_mean"]
        rows.append({
            "Nominal Coverage": f"{nom}%",
            "Empirical Coverage": f"{cov:.2f}% +- {cov_sd:.2f}%",
            "Coverage Error": f"{err:+.2f}%",
            "Mean Width (Days)": f"{w_mean:.2f} +- {w_sd:.2f} d",
            "Median Width (Days)": f"{w_med:.2f} d",
            "Mean Adjustment (Q)": f"{q_adj:.2f} d",
        })
    return pd.DataFrame(rows)

def generate_table6_locked_benchmark():
    """Table 6: Secondary Locked Registry Benchmark Classification Results."""
    df = pd.read_csv(TABLES_DIR / "locked_registry_classification.csv")
    rows = []
    for _, r in df.iterrows():
        rows.append({
            "Model": r["model"],
            "Role": r["evidence_role"],
            "Calibration": r["calibration"],
            "Threshold": f"{r['frozen_threshold']:.4f}",
            "PR-AUC": f"{r['pr_auc']:.4f}",
            "ROC-AUC": f"{r['roc_auc']:.4f}",
            "Brier Score": f"{r['brier_score']:.4f}",
            "ECE (10 Bins)": f"{r['ece_10bins']:.4f}",
            "Precision": f"{r['precision']:.4f}",
            "Recall": f"{r['recall']:.4f} ({int(r['recall']*61)}/61)",
            "F1 Score": f"{r['f1_score']:.4f}",
            "Balanced Accuracy": f"{r['balanced_accuracy']:.4f}",
        })
    return pd.DataFrame(rows)

def generate_table7_decision_utility():
    """Table 7: Operational Capacity-Constrained Prioritization."""
    df = pd.read_csv(TABLES_DIR / "locked_registry_decision_utility.csv")
    rows = []
    strat_map = {
        "Strategy_1_Risk_Only": "Strategy 1: Risk Only (p_cal)",
        "Strategy_2_Risk_x_Severity": "Strategy 2: Risk x Severity (p_cal * y_50)",
        "Strategy_3_Uncertainty_Aware": "Strategy 3: Uncertainty-Aware (p_cal * y_95)",
    }
    for _, r in df.iterrows():
        k_pct = int(r["k_fraction"] * 100)
        rows.append({
            "Capacity (K)": f"K = {k_pct}%",
            "Inspected": int(r["k_shipments"]),
            "Prioritization Strategy": strat_map.get(r["strategy"], r["strategy"]),
            "Delays Captured": f"{int(r['delayed_captured'])}/61",
            "Recall@K": f"{r['recall_at_k']*100:.1f}%",
            "High-Severity Captured": f"{int(r['high_severity_captured'])}/15",
            "High-Severity Recall@K": f"{r['high_severity_recall_at_k']*100:.1f}%",
            "Delay-Days Captured": f"{r['delay_days_captured']:.1f} d",
            "Delay-Days Ratio": f"{r['delay_days_capture_ratio']*100:.1f}%",
        })
    return pd.DataFrame(rows)

if __name__ == "__main__":
    out_dir = REPO_ROOT / "research" / "manuscript" / "tables"
    out_dir.mkdir(parents=True, exist_ok=True)
    
    t1 = generate_table1_dataset_protocol()
    t2 = generate_table2_classifiers()
    t3 = generate_table3_calibration()
    t4 = generate_table4_severity()
    t5 = generate_table5_cqr()
    t6 = generate_table6_locked_benchmark()
    t7 = generate_table7_decision_utility()
    
    t1.to_csv(out_dir / "table1_dataset_protocol.csv", index=False)
    t2.to_csv(out_dir / "table2_classifiers.csv", index=False)
    t3.to_csv(out_dir / "table3_calibration.csv", index=False)
    t4.to_csv(out_dir / "table4_severity.csv", index=False)
    t5.to_csv(out_dir / "table5_cqr.csv", index=False)
    t6.to_csv(out_dir / "table6_locked_benchmark.csv", index=False)
    t7.to_csv(out_dir / "table7_decision_utility.csv", index=False)
    
    print("Successfully generated all 7 manuscript tables from canonical CSV artifacts.")
