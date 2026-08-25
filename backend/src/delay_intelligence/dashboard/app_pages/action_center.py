"""Decision & Action Center — scenario economics and policy recommendations."""
import streamlit as st

from delay_intelligence.dashboard.api_client import (
    api_predict,
    api_recommend,
    load_data,
    row_to_features,
)
from delay_intelligence.dashboard.ui import (
    disclaimer_box,
    evidence_badges,
    format_currency,
    format_days,
    format_pct,
    kpi_row,
    risk_badge,
    section_header,
    simulated_warning,
)

# ── Load data & select shipment ──────────────────────────────────────────────
df = load_data()
ids = df["ID"].astype(str).tolist() if "ID" in df.columns else df.index.astype(str).tolist()

default_idx = 0
if st.session_state.selected_shipment_id and st.session_state.selected_shipment_id in ids:
    default_idx = ids.index(st.session_state.selected_shipment_id)

selected = st.selectbox(
    "Select shipment for scenario review",
    ids,
    index=default_idx,
    key="action_shipment_select",
)
st.session_state.selected_shipment_id = selected

row = df[df["ID"].astype(str) == selected].iloc[0] if "ID" in df.columns else df.iloc[int(selected)]
features = row_to_features(row)

pred = api_predict(features)
rec = api_recommend(features)

prob = pred["probability_late"]
p50 = pred["severity_p50"]
lo, hi = pred["severity_interval_90"]

# ── A. Model assessment ─────────────────────────────────────────────────────
section_header("Model assessment", "MODEL OUTPUT")

kpi_row([
    {"label": "Late probability", "value": format_pct(prob)},
    {"label": "Risk tier", "value": pred["risk_tier"].replace("_", " ")},
    {"label": "Conditional delay P50", "value": format_days(p50)},
    {"label": "90% uncertainty interval", "value": f"{lo:.1f}–{hi:.1f} days"},
])

risk_badge(pred["risk_tier"])

st.divider()

# ── B. Scenario assumptions ─────────────────────────────────────────────────
section_header("Scenario assumptions", "SIMULATED SCENARIO")
simulated_warning()

col1, col2, col3 = st.columns(3)
with col1:
    delay_cost_per_day = st.slider(
        "Assumed delay cost / day (USD)",
        min_value=0, max_value=1000, value=150, step=10,
    )
with col2:
    intervention_cost = st.slider(
        "Assumed intervention cost (USD)",
        min_value=0, max_value=3000, value=500, step=50,
    )
with col3:
    efficacy_days = st.slider(
        "Assumed delay reduction if action works (days)",
        min_value=0.0, max_value=20.0, value=5.0, step=0.5,
    )

st.divider()

# ── C. Scenario economics ───────────────────────────────────────────────────
section_header("Scenario-based estimated economic impact", "SIMULATED SCENARIO")

avoided_days = min(float(p50), float(efficacy_days))
expected_avoided_cost = float(prob) * avoided_days * float(delay_cost_per_day)
scenario_net_benefit = expected_avoided_cost - float(intervention_cost)

kpi_row([
    {"label": "Estimated avoidable delay cost", "value": format_currency(expected_avoided_cost)},
    {"label": "Intervention cost", "value": format_currency(intervention_cost)},
    {"label": "Scenario net benefit", "value": format_currency(scenario_net_benefit)},
])

disclaimer_box(
    "These values are scenario estimates under configured assumptions. "
    "They are not realized savings or accounting facts."
)

st.divider()

# ── D. Policy recommendation ────────────────────────────────────────────────
section_header("Policy recommendation", "SIMULATED SCENARIO")

recommendation = rec["recommendation"].replace("_", " ")

# Visual recommendation with appropriate emphasis
if rec["recommendation"] in {"EXPEDITE", "SUPPLIER_ESCALATION", "TRANSPORT_MODE_REVIEW"}:
    st.warning(f":material/priority_high: **{recommendation}**")
elif rec["recommendation"] == "HUMAN_REVIEW":
    st.info(f":material/person_search: **{recommendation}**")
elif rec["recommendation"] == "NO_ACTION":
    st.success(f":material/check_circle: **{recommendation}**")
else:
    st.info(f":material/info: **{recommendation}**")

for reason in rec["decision_reason"]:
    st.markdown(f"- {reason}")

col1, col2 = st.columns(2)
col1.markdown(f"**Robustness:** {rec['robustness']}")
col2.markdown(f"**Human review required:** {'Yes' if rec['human_approval_required'] else 'No'}")

st.caption(rec["impact_disclaimer"])

st.divider()

# ── Record demo decision ────────────────────────────────────────────────────
if st.button(
    ":material/task_alt: Record scenario decision",
    help="UI-only demonstration; does not execute an operational action.",
):
    st.success(
        f"Demo decision recorded for shipment {selected}: {recommendation}. "
        "No operational action has been executed."
    )
