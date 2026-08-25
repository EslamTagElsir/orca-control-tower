import streamlit as st

from delay_intelligence.dashboard.api_client import api_predict, api_recommend, load_data, row_to_features

st.set_page_config(page_title="Action Center", layout="wide")
st.title("Recommendation / Action Center")
st.caption("SIMULATED SCENARIO — configurable economics; no realized savings and no ERP execution")

df = load_data()
ids = df["ID"].astype(str).tolist() if "ID" in df.columns else df.index.astype(str).tolist()
selected = st.selectbox("Select shipment for scenario review", ids)
row = df[df["ID"].astype(str) == selected].iloc[0] if "ID" in df.columns else df.iloc[int(selected)]
features = row_to_features(row)

pred = api_predict(features)
rec = api_recommend(features)

st.markdown("### MODEL OUTPUT")
c1, c2, c3 = st.columns(3)
c1.metric("Late Probability", f"{pred['probability_late']:.1%}")
c2.metric("Risk Tier", pred["risk_tier"])
c3.metric("Delay P50 if Late", f"{pred['severity_p50']:.1f} days")

st.markdown("### SIMULATED SCENARIO — economics")
st.write("Adjust assumptions to stress-test an intervention. These are not accounting facts.")
delay_cost_per_day = st.slider("Assumed delay cost / day (USD)", 0, 1000, 150, 10)
intervention_cost = st.slider("Assumed intervention cost (USD)", 0, 3000, 500, 50)
efficacy_days = st.slider("Assumed delay reduction if action works (days)", 0.0, 20.0, 5.0, 0.5)

avoided_days = min(float(pred["severity_p50"]), float(efficacy_days))
expected_avoided_cost = float(pred["probability_late"]) * avoided_days * float(delay_cost_per_day)
scenario_net_benefit = expected_avoided_cost - float(intervention_cost)

c1, c2, c3 = st.columns(3)
c1.metric("Expected Avoided Delay Cost", f"${expected_avoided_cost:,.0f}")
c2.metric("Intervention Cost", f"${intervention_cost:,.0f}")
c3.metric("Scenario Net Benefit", f"${scenario_net_benefit:,.0f}")

st.markdown("### SIMULATED SCENARIO — policy recommendation")
st.subheader(rec["recommendation"])
for reason in rec["decision_reason"]:
    st.write(f"- {reason}")
st.write(f"**Robustness:** {rec['robustness']}")
st.write(f"**Human approval required:** {'Yes' if rec['human_approval_required'] else 'No'}")
st.warning(rec["impact_disclaimer"])
st.button("Record Demo Approval", help="UI-only demonstration; does not execute an operational action.")
