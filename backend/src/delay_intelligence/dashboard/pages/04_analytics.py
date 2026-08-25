import pandas as pd
import streamlit as st

from delay_intelligence.dashboard.api_client import api_predict, load_data, row_to_features

st.set_page_config(page_title="Portfolio Analytics", layout="wide")
st.title("Portfolio Analytics")
st.caption("REAL DATA feature sample + MODEL OUTPUT analytics")

df = load_data()
records = []
for _, row in df.iterrows():
    features = row_to_features(row)
    pred = api_predict(features)
    records.append(
        {
            "Risk Tier": pred["risk_tier"],
            "Late Probability": pred["probability_late"],
            "Severity P50 if Late": pred["severity_p50"],
            "Fulfillment Channel": features.get("Fulfill Via", "Unknown"),
            "Shipment Mode": features.get("Shipment Mode", "Unknown"),
        }
    )

res = pd.DataFrame(records)
if res.empty:
    st.warning("No results available.")
    st.stop()

st.subheader("Risk Tier by Fulfillment Channel")
st.bar_chart(res.groupby(["Fulfillment Channel", "Risk Tier"]).size().unstack(fill_value=0))

st.subheader("Mean Calibrated Late Probability by Shipment Mode")
st.bar_chart(res.groupby("Shipment Mode")["Late Probability"].mean())

st.subheader("Conditional Severity Summary")
st.dataframe(res["Severity P50 if Late"].describe().to_frame("days"), use_container_width=True)

st.info("Predicted portfolio states are model outputs. The page does not present them as observed future outcomes.")
