import pandas as pd
import streamlit as st

from delay_intelligence.dashboard.api_client import api_explain, api_predict, load_data, row_to_features

st.set_page_config(page_title="Shipment Risk Explorer", layout="wide")
st.title("Shipment Risk Explorer")
st.caption("REAL DATA record | MODEL OUTPUT prediction & SHAP | EXPLORATORY ONLY causal hypotheses")

df = load_data()
ids = df["ID"].astype(str).tolist() if "ID" in df.columns else df.index.astype(str).tolist()
selected = st.selectbox("Select shipment", ids)
row = df[df["ID"].astype(str) == selected].iloc[0] if "ID" in df.columns else df.iloc[int(selected)]
features = row_to_features(row)

with st.expander("REAL DATA — pre-outcome feature values"):
    st.json({k: v for k, v in features.items() if pd.notnull(v)})

pred = api_predict(features)
expl = api_explain(features)

st.markdown("### MODEL OUTPUT — calibrated risk and conditional severity")
c1, c2, c3, c4 = st.columns(4)
c1.metric("Late Probability", f"{pred['probability_late']:.1%}")
c2.metric("Decision", "FLAG" if pred["classification_decision"] else "NOT FLAGGED")
c2.caption(f"Threshold = {pred['decision_threshold']:.2f}")
c3.metric("Delay P50 if Late", f"{pred['severity_p50']:.1f} d")
lo, hi = pred["severity_interval_90"]
c4.metric("90% CQR if Late", f"{lo:.1f}–{hi:.1f} d")
st.caption(pred["severity_definition"] + ". Interval sharpness can degrade under distribution shift.")

st.markdown("### MODEL OUTPUT — real local CatBoost SHAP")
shap_df = pd.DataFrame(expl["shap_contributions"])
st.dataframe(shap_df, use_container_width=True, hide_index=True)
st.caption("SHAP explains the model prediction; it does not establish causation.")

st.markdown("### EXPLORATORY ONLY — causal hypotheses")
if expl["causal_candidates"]:
    for candidate in expl["causal_candidates"]:
        st.write(f"- {candidate}")
else:
    st.info("No stable legacy hypothesis overlaps this shipment's top SHAP drivers.")
st.warning(
    "The historical causal-discovery experiment used PC/Fisher-Z with encoded categorical variables. "
    "These edges are hypothesis-generating only and are not identified intervention effects."
)
