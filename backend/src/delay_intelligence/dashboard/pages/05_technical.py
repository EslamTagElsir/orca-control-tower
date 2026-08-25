import json
from pathlib import Path

import pandas as pd
import streamlit as st

st.set_page_config(page_title="Academic Evidence", layout="wide")
st.title("Academic Evidence & Model Validation")
st.caption("Single source of truth: docs/FINAL_RESULTS_SOURCE_OF_TRUTH.md")

ROOT = Path(__file__).resolve().parents[4]
V2 = ROOT / "artifacts" / "model_registry" / "v2" / "serving_validation.json"
OLD = ROOT / "artifacts" / "final" / "final_holdout_metrics.json"
CAUSAL = ROOT / "artifacts" / "causal" / "causal_edge_stability.csv"

v2 = json.loads(V2.read_text(encoding="utf-8"))
old = json.loads(OLD.read_text(encoding="utf-8")) if OLD.exists() else {}

st.markdown("## Patched v2 serving validation — MODEL OUTPUT")
st.write(v2["evaluation_role"])
cls = v2["classification"]
c1, c2, c3, c4 = st.columns(4)
c1.metric("Holdout PR-AUC", f"{cls['pr_auc']:.3f}")
c2.metric("ROC-AUC", f"{cls['roc_auc']:.3f}")
c3.metric("Recall", f"{cls['recall']:.1%}")
c4.metric("Brier", f"{cls['brier_score']:.3f}")

sev = v2["severity_cqr"]
c1, c2, c3 = st.columns(3)
c1.metric("Delayed Holdout Rows", sev["holdout_delayed_rows"])
c2.metric("90% CQR Coverage", f"{sev['empirical_coverage_delayed_only']:.1%}")
c3.metric("Mean Interval Width", f"{sev['mean_interval_width_delayed_only']:.1f} d")
st.warning("Coverage must be interpreted together with interval width; wider intervals reduce operational sharpness.")

st.markdown("## Frozen original research artifacts — historical baseline")
if old:
    st.json(old, expanded=False)
st.caption("These original/frozen metrics are preserved for provenance and are not silently replaced by v2 serving results.")

st.markdown("## Exploratory Causal Analysis — not causal identification")
if CAUSAL.exists():
    st.dataframe(pd.read_csv(CAUSAL), use_container_width=True, hide_index=True)
st.warning(
    "PC/Fisher-Z results on encoded categorical variables are retained only as exploratory hypotheses. "
    "No intervention effect or causal ROI is claimed."
)
