import numpy as np
import pandas as pd
import streamlit as st

from delay_intelligence.dashboard.api_client import api_predict, api_recommend, load_data, row_to_features

st.set_page_config(page_title="Executive Control Tower", layout="wide")
st.title("Executive Control Tower")
st.caption("REAL DATA sample → MODEL OUTPUT risk scores → SIMULATED SCENARIO recommendations")


def score_portfolio(df: pd.DataFrame):
    rows = []
    for _, row in df.iterrows():
        features = row_to_features(row)
        pred = api_predict(features)
        rec = api_recommend(features)
        rows.append({**pred, **rec})
    return rows


df = load_data()
with st.spinner("Scoring the frozen real-data demo sample..."):
    results = score_portfolio(df)

if not results:
    st.error("No model outputs returned.")
    st.stop()

total = len(results)
mean_risk = float(np.mean([r["probability_late"] for r in results]))
flagged = sum(bool(r["classification_decision"]) for r in results)
high_or_critical = sum(r["risk_tier"] in {"HIGH_RISK", "CRITICAL"} for r in results)
median_severity = float(np.median([r["severity_p50"] for r in results]))
human_reviews = sum(bool(r["human_approval_required"]) for r in results)

st.markdown("### MODEL OUTPUT — portfolio view")
c1, c2, c3, c4 = st.columns(4)
c1.metric("Real Holdout Shipments", total)
c2.metric("Mean Calibrated Late Risk", f"{mean_risk:.1%}")
c3.metric("Above Decision Threshold", flagged)
c4.metric("High/Critical Tier", high_or_critical)

c1, c2 = st.columns(2)
c1.metric("Conditional Delay P50", f"{median_severity:.1f} days")
c1.caption("Severity means delay days *if the shipment is late*.")
c2.metric("Human Reviews Suggested", human_reviews)
c2.caption("SIMULATED SCENARIO decision policy; no action is executed.")

st.warning(
    "No realized ROI is claimed on this page. Recommendations use modeled cost/efficacy assumptions and are decision-support scenarios only."
)
