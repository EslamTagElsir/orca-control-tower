"""Shipment Risk Explorer — detailed risk, SHAP, and causal hypotheses."""
import pandas as pd
import streamlit as st

from delay_intelligence.dashboard.api_client import (
    api_explain,
    api_predict,
    load_data,
    row_to_features,
)
from delay_intelligence.dashboard.ui import (
    disclaimer_box,
    evidence_badges,
    format_days,
    format_pct,
    kpi_row,
    risk_badge,
    section_header,
)

# ── Load data ────────────────────────────────────────────────────────────────
df = load_data()
ids = df["ID"].astype(str).tolist() if "ID" in df.columns else df.index.astype(str).tolist()

# ── Shipment selection with session state persistence ────────────────────────
default_idx = 0
if st.session_state.selected_shipment_id and st.session_state.selected_shipment_id in ids:
    default_idx = ids.index(st.session_state.selected_shipment_id)

selected = st.selectbox(
    "Select shipment",
    ids,
    index=default_idx,
    key="explorer_shipment_select",
)
st.session_state.selected_shipment_id = selected

row = df[df["ID"].astype(str) == selected].iloc[0] if "ID" in df.columns else df.iloc[int(selected)]
features = row_to_features(row)

# ── Predict & explain ────────────────────────────────────────────────────────
pred = api_predict(features)
expl = api_explain(features)

prob = pred["probability_late"]
decision = "FLAG" if pred["classification_decision"] else "NOT FLAGGED"
p50 = pred["severity_p50"]
lo, hi = pred["severity_interval_90"]

# ── Hero section ─────────────────────────────────────────────────────────────
st.markdown(f"**Shipment {selected}**")
evidence_badges("REAL DATA", "MODEL OUTPUT")

kpi_row([
    {"label": "Late probability", "value": format_pct(prob)},
    {"label": "Decision", "value": decision, "help": f"Threshold = {pred['decision_threshold']:.2f}"},
    {"label": "Expected delay if late", "value": format_days(p50)},
    {"label": "90% prediction interval if late", "value": f"{lo:.1f}–{hi:.1f} days"},
])

risk_badge(pred["risk_tier"])

disclaimer_box(
    f"{pred['severity_definition']}. Interval sharpness can degrade under distribution shift."
)

st.divider()

# ── SHAP section ─────────────────────────────────────────────────────────────
section_header("Local CatBoost SHAP", "MODEL OUTPUT")

shap_data = expl["shap_contributions"]
if shap_data:
    shap_df = pd.DataFrame(shap_data)

    # Horizontal bar chart of top SHAP contributors
    chart_df = shap_df.copy()
    chart_df["abs_shap"] = chart_df["shap_value"].abs()
    chart_df = chart_df.sort_values("abs_shap", ascending=True)

    bar_df = pd.DataFrame({
        "Feature": chart_df["feature"],
        "SHAP value (log-odds)": chart_df["shap_value"],
    }).set_index("Feature")
    st.bar_chart(bar_df, horizontal=True)

    # Color-coded direction table
    for _, srow in shap_df.iterrows():
        direction = srow["direction"]
        icon = ":red[▲ increases late risk]" if direction == "increases_late_risk" else ":green[▼ decreases late risk]"
        st.markdown(f"- **{srow['feature']}**: {srow['shap_value']:.4f} — {icon}")

    disclaimer_box("SHAP explains the model prediction; it does not establish causation.")
else:
    st.info("No SHAP contributions available for this shipment.")

st.divider()

# ── Raw feature values ───────────────────────────────────────────────────────
with st.expander("Real pre-outcome shipment features"):
    feature_display = {k: v for k, v in features.items() if pd.notnull(v)}
    feature_df = pd.DataFrame([
        {"Feature": k, "Value": str(v)} for k, v in feature_display.items()
    ])
    st.dataframe(feature_df, hide_index=True)

# ── Causal hypotheses ────────────────────────────────────────────────────────
section_header("Exploratory causal hypotheses", "EXPLORATORY ONLY")

if expl["causal_candidates"]:
    for candidate in expl["causal_candidates"]:
        st.markdown(f"- {candidate}")
else:
    st.info("No stable legacy hypothesis overlaps this shipment's top SHAP drivers.")

st.caption(
    ":material/warning: Hypothesis-generating associations; not identified intervention effects. "
    "The historical causal-discovery experiment used PC/Fisher-Z with encoded categorical variables."
)
