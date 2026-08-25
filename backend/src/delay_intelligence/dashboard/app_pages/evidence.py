"""Model Evidence — academic validation, calibration, uncertainty, and limitations."""
import json
from pathlib import Path

import pandas as pd
import streamlit as st

from delay_intelligence.dashboard.ui import (
    disclaimer_box,
    evidence_badges,
    format_pct,
    section_header,
)

ROOT = Path(__file__).resolve().parents[4]
V2_PATH = ROOT / "artifacts" / "model_registry" / "v2" / "serving_validation.json"
OLD_PATH = ROOT / "artifacts" / "final" / "final_holdout_metrics.json"
CAUSAL_PATH = ROOT / "artifacts" / "causal" / "causal_edge_stability.csv"
SOT_PATH = ROOT / "docs" / "FINAL_RESULTS_SOURCE_OF_TRUTH.md"


def _load_json(path: Path) -> dict | None:
    """Safely load a JSON artifact."""
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


# ── Load artifacts ───────────────────────────────────────────────────────────
v2 = _load_json(V2_PATH)
old = _load_json(OLD_PATH)

if v2 is None:
    st.error("Serving validation artifact not found. Cannot display model evidence.")
    st.stop()

cls = v2["classification"]
sev = v2["severity_cqr"]

evidence_badges("MODEL OUTPUT")
st.caption(f"Source of truth: [FINAL_RESULTS_SOURCE_OF_TRUTH.md]({SOT_PATH.name})")

# ── Tabs ─────────────────────────────────────────────────────────────────────
tab1, tab2, tab3, tab4, tab5 = st.tabs([
    ":material/bar_chart: Predictive Performance",
    ":material/tune: Calibration",
    ":material/emergency: Uncertainty",
    ":material/verified: Validation Design",
    ":material/warning: Limitations",
])

# ── Tab 1: Predictive Performance ────────────────────────────────────────────
with tab1:
    section_header("Holdout predictive performance", "MODEL OUTPUT")
    st.caption(v2["evaluation_role"])

    col1, col2, col3 = st.columns(3)
    col1.metric("PR-AUC", f"{cls['pr_auc']:.4f}")
    col2.metric("ROC-AUC", f"{cls['roc_auc']:.4f}")
    col3.metric("F1", f"{cls['f1']:.4f}")

    col1, col2, col3 = st.columns(3)
    col1.metric("Precision", format_pct(cls["precision"]))
    col2.metric("Recall", format_pct(cls["recall"]))
    col3.metric("Threshold", f"{cls['decision_threshold']:.2f}")

    st.divider()

    st.markdown("##### Interpretation")
    # Compute prevalence from holdout data
    holdout_rows = v2["splits"]["holdout"]["rows"]
    delayed_rows = sev["holdout_delayed_rows"]
    prevalence = delayed_rows / holdout_rows if holdout_rows > 0 else None

    if prevalence is not None:
        st.markdown(
            f"- **Holdout class prevalence (late):** {format_pct(prevalence)} "
            f"({delayed_rows} delayed out of {holdout_rows} holdout rows)"
        )
        st.markdown(
            f"- **Random PR baseline:** {format_pct(prevalence)} — "
            f"PR-AUC of {cls['pr_auc']:.4f} represents a "
            f"{cls['pr_auc']/prevalence:.1f}× improvement over random ranking."
        )

    st.markdown(
        "- PR-AUC should be interpreted relative to class prevalence. "
        "With low prevalence, even moderate PR-AUC indicates meaningful discrimination."
    )

# ── Tab 2: Calibration ──────────────────────────────────────────────────────
with tab2:
    section_header("Probability calibration", "MODEL OUTPUT")

    st.metric("Brier score", f"{cls['brier_score']:.5f}")
    st.markdown(
        "Brier score measures the mean squared error between predicted probabilities "
        "and actual outcomes. Lower is better (perfect = 0.0)."
    )

    st.markdown("##### Calibration method")
    st.markdown(
        "- **Isotonic regression** fitted on the calibration partition "
        f"({v2['splits']['calibration']['rows']} rows, "
        f"{v2['splits']['calibration']['start']} to {v2['splits']['calibration']['end_exclusive']})"
    )
    st.markdown(
        "- Calibration was fitted **before** the holdout was touched — "
        "no information from the holdout leaked into calibration."
    )

    st.divider()

    st.markdown("##### Balanced accuracy")
    st.metric("Balanced accuracy", format_pct(cls["balanced_accuracy"]))

# ── Tab 3: Uncertainty ───────────────────────────────────────────────────────
with tab3:
    section_header("Conformal Quantile Regression (CQR)", "MODEL OUTPUT")

    st.markdown(
        "Severity is defined as **delay days conditional on the shipment actually being late**."
    )

    col1, col2, col3 = st.columns(3)
    col1.metric("Nominal coverage target", format_pct(sev["nominal_coverage"]))
    col2.metric("Observed empirical coverage", format_pct(sev["empirical_coverage_delayed_only"]))
    col3.metric("Delayed holdout rows", str(sev["holdout_delayed_rows"]))

    col1, col2, col3 = st.columns(3)
    col1.metric("Mean interval width", f"{sev['mean_interval_width_delayed_only']:.1f} days")
    col2.metric("Median interval width", f"{sev['median_interval_width_delayed_only']:.1f} days")
    col3.metric("Mean P50 prediction", f"{sev['median_prediction_mean']:.1f} days")

    st.divider()

    st.warning(
        ":material/balance: **Sharpness trade-off:** Higher empirical coverage (95.1% vs 90% nominal) "
        "was achieved with wide intervals (mean 54.9 days), reducing operational sharpness. "
        "This demonstrates uncertainty quantification with a substantial precision trade-off."
    )

# ── Tab 4: Validation Design ────────────────────────────────────────────────
with tab4:
    section_header("Temporal validation design", "MODEL OUTPUT")

    st.markdown("##### Holdout isolation guarantees")
    st.markdown(
        f"- **Training:** {v2['splits']['train']['rows']:,} rows, "
        f"ending before {v2['splits']['train']['end_exclusive']}"
    )
    st.markdown(f"- **Embargo:** {v2['splits']['embargo_days']} days (no data used)")
    st.markdown(
        f"- **Calibration:** {v2['splits']['calibration']['rows']:,} rows, "
        f"{v2['splits']['calibration']['start']} to {v2['splits']['calibration']['end_exclusive']}"
    )
    st.markdown(
        f"- **Untouched holdout:** {v2['splits']['holdout']['rows']:,} rows, "
        f"{v2['splits']['holdout']['start']} to {v2['splits']['holdout']['end']}"
    )

    st.divider()

    st.markdown("##### What the holdout was NOT used for")
    st.markdown("""
- No model fitting on holdout data
- No probability calibration on holdout data
- No threshold selection on holdout data
- No CQR calibration on holdout data
- No hyperparameter tuning on holdout data
""")

    st.markdown("##### Leakage controls")
    st.markdown("""
- Point-in-time feature construction ensures no future information leaks
- Temporal embargo prevents train/calibration boundary leakage
- Post-outcome features are blocked at the API level
- Feature contract enforces pre-outcome-only inputs
""")

    st.success(
        ":material/verified: This temporal holdout design is a major academic strength. "
        "The holdout was genuinely untouched for all fitting, calibration, and threshold decisions."
    )

# ── Tab 5: Limitations ──────────────────────────────────────────────────────
with tab5:
    section_header("Known limitations", None)

    st.markdown("""
- **Historical dataset age:** SCMS data is from 2006–2015; distribution shift is expected
  with current-year shipment patterns.
- **Sample size:** 1,013 holdout rows, including only 61 delayed shipments for severity evaluation.
- **Distribution shift:** Model was trained on historical patterns that may not generalize
  to current pharmaceutical supply chain dynamics.
- **Wide prediction intervals:** Mean 90% CQR interval width is 54.9 days — operationally
  wide, reducing actionable precision.
- **Simulated economics:** All cost/benefit analyses use configurable assumptions, not
  measured operational outcomes.
- **Exploratory causal analysis:** PC/Fisher-Z edges are hypothesis-generating only.
  No causal intervention effect has been identified or validated.
- **No external validation:** DataCo and Olist adapter protocols exist but no empirical
  external-validation metrics have been produced. Cross-domain generalization is not claimed.
- **Research prototype:** This system has not undergone prospective operational deployment,
  production security review, or real-world intervention measurement.
""")

    st.info(
        ":material/science: Academic credibility requires transparent disclosure of limitations. "
        "These do not diminish the methodological contribution — they define the scope."
    )

# ── Historical baseline (in expander) ────────────────────────────────────────
st.divider()

with st.expander("Historical / Frozen research baseline"):
    st.caption("Frozen original research artifacts — preserved for provenance.")

    if old:
        st.markdown("##### Original v1 holdout metrics")
        col1, col2, col3 = st.columns(3)
        old_cls = old.get("classification", {})
        col1.metric("PR-AUC (v1)", f"{old_cls.get('pr_auc', 0):.4f}")
        col2.metric("ROC-AUC (v1)", f"{old_cls.get('roc_auc', 0):.4f}")
        col3.metric("Brier (v1)", f"{old_cls.get('brier_score', 0):.4f}")

        old_sev = old.get("severity", {})
        col1, col2 = st.columns(2)
        col1.metric("Coverage (v1)", format_pct(old_sev.get("empirical_coverage", 0)))
        col2.metric("Mean width (v1)", f"{old_sev.get('mean_interval_width', 0):.1f} days")

        st.caption(
            "These original/frozen metrics are preserved for provenance. "
            "They are from a different model packaging and must not be mixed "
            "with v2 serving metrics."
        )
    else:
        st.info("Historical baseline artifact not found.")

# ── Causal stability (in expander) ──────────────────────────────────────────
with st.expander("Exploratory causal edge stability"):
    if CAUSAL_PATH.exists():
        try:
            causal_df = pd.read_csv(CAUSAL_PATH)
            st.dataframe(causal_df, hide_index=True)
        except Exception:
            st.info("Could not load causal stability data.")
    else:
        st.info("Causal edge stability artifact not found.")

    st.caption(
        "PC/Fisher-Z results on encoded categorical variables are retained only as "
        "exploratory hypotheses. No intervention effect or causal ROI is claimed."
    )
