"""Landing page — Delay Intelligence."""
import streamlit as st

from delay_intelligence.dashboard.ui import evidence_badges

# ── Hero ─────────────────────────────────────────────────────────────────────
st.markdown("")  # spacing
st.title("Delay Intelligence")
st.subheader("Uncertainty-Aware Pharmaceutical Supply Chain Decision Intelligence")
st.markdown(
    "Research-validated prototype connecting predictive risk, uncertainty, "
    "explanation and decision-support scenarios."
)

st.divider()

# ── Evidence taxonomy ────────────────────────────────────────────────────────
evidence_badges("REAL DATA", "MODEL OUTPUT", "SIMULATED SCENARIO")

st.markdown("")  # spacing

# ── Pipeline summary ─────────────────────────────────────────────────────────
with st.container(border=True):
    st.markdown("#### Inference pipeline")
    st.markdown(
        "Calibrated CatBoost → Conditional Severity LightGBM Quantiles → "
        "Conformal Quantile Regression → Real Local SHAP → "
        "Decision-Support Scenario Layer"
    )

st.markdown("")

# ── Positioning ──────────────────────────────────────────────────────────────
st.info(
    ":material/info: **Research / Demo Prototype — Not a Production Control Tower**\n\n"
    "Historical SCMS records are real; predictions and SHAP values are model outputs; "
    "recommendations and financial impacts are scenario simulations based on "
    "configurable assumptions.",
    icon=":material/science:",
)

# ── CTA ──────────────────────────────────────────────────────────────────────
st.markdown("")
if st.button(
    ":material/monitoring: Open Executive Control Tower",
    type="primary",
):
    st.switch_page("app_pages/executive.py")
