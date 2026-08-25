"""Portfolio Intelligence — aggregate model-output views and operational storytelling."""
import numpy as np
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
    section_header,
)

# ── Data loading ─────────────────────────────────────────────────────────────

@st.cache_data(show_spinner=False)
def _build_portfolio():
    """Build portfolio analytics from real model predictions."""
    df = load_data()
    records = []
    shap_accum = {}
    for _, row in df.iterrows():
        features = row_to_features(row)
        pred = api_predict(features)
        records.append({
            "Shipment ID": str(row.get("ID", "")),
            "Risk Tier": pred["risk_tier"],
            "Late Probability": pred["probability_late"],
            "Severity P50 if Late": pred["severity_p50"],
            "Severity Lo": pred["severity_interval_90"][0],
            "Severity Hi": pred["severity_interval_90"][1],
            "Fulfillment Channel": features.get("Fulfill Via", "Unknown"),
            "Shipment Mode": features.get("Shipment Mode", "Unknown"),
        })
    return pd.DataFrame(records)


@st.cache_data(show_spinner=False)
def _build_portfolio_shap():
    """Aggregate SHAP across top-10 highest-risk shipments for portfolio drivers."""
    df = load_data()
    # Score just to find top-risk shipments
    scored = []
    for _, row in df.iterrows():
        features = row_to_features(row)
        pred = api_predict(features)
        scored.append({"row_idx": _, "prob": pred["probability_late"], "features": features})

    scored.sort(key=lambda x: x["prob"], reverse=True)
    top_10 = scored[:10]

    shap_accum = {}
    for item in top_10:
        try:
            expl = api_explain(item["features"])
            for contrib in expl["shap_contributions"]:
                feat = contrib["feature"]
                shap_accum[feat] = shap_accum.get(feat, 0.0) + abs(contrib["shap_value"])
        except Exception:
            continue

    if not shap_accum:
        return pd.DataFrame()

    shap_df = pd.DataFrame([
        {"Feature": k, "Mean |SHAP|": v / len(top_10)}
        for k, v in sorted(shap_accum.items(), key=lambda x: x[1], reverse=True)[:10]
    ])
    return shap_df


with st.spinner("Computing portfolio analytics..."):
    res = _build_portfolio()

if res.empty:
    st.warning("No results available.")
    st.stop()

# ── Portfolio overview ───────────────────────────────────────────────────────
evidence_badges("REAL DATA", "MODEL OUTPUT")

mean_risk = float(res["Late Probability"].mean())
median_severity = float(res["Severity P50 if Late"].median())
high_risk_count = int((res["Risk Tier"].isin(["HIGH_RISK", "CRITICAL"])).sum())
highest_id = res.loc[res["Late Probability"].idxmax(), "Shipment ID"]

section_header("Portfolio overview", "MODEL OUTPUT")

kpi_row([
    {"label": "Mean late risk", "value": format_pct(mean_risk)},
    {"label": "Median conditional delay", "value": format_days(median_severity)},
    {"label": "High-risk count", "value": str(high_risk_count)},
    {"label": "Highest-risk shipment in the current demo portfolio", "value": str(highest_id)},
])

disclaimer_box(f"Based on {len(res)} sampled holdout shipments from the SCMS dataset.")

st.divider()

# ── Risk by fulfillment channel ──────────────────────────────────────────────
section_header("Risk by fulfillment channel", "MODEL OUTPUT")

channel_stats = res.groupby("Fulfillment Channel").agg(
    Count=("Late Probability", "count"),
    Mean_Risk=("Late Probability", "mean"),
).reset_index()
channel_stats["Mean Late Risk"] = channel_stats["Mean_Risk"].apply(lambda x: format_pct(x))
st.dataframe(
    channel_stats[["Fulfillment Channel", "Count", "Mean Late Risk"]],
    hide_index=True,
)

channel_chart = res.groupby(["Fulfillment Channel", "Risk Tier"]).size().unstack(fill_value=0)
st.bar_chart(channel_chart)

st.divider()

# ── Risk by shipment mode ────────────────────────────────────────────────────
section_header("Risk by shipment mode", "MODEL OUTPUT")

mode_stats = res.groupby("Shipment Mode").agg(
    Count=("Late Probability", "count"),
    Mean_Risk=("Late Probability", "mean"),
).reset_index()
mode_stats["Mean Late Risk"] = mode_stats["Mean_Risk"].apply(lambda x: format_pct(x))
st.dataframe(
    mode_stats[["Shipment Mode", "Count", "Mean Late Risk"]],
    hide_index=True,
)

mode_chart = res.groupby("Shipment Mode")["Late Probability"].mean()
st.bar_chart(mode_chart, y_label="Mean Late Probability")

st.divider()

# ── Delay severity distribution ──────────────────────────────────────────────
section_header("Conditional delay severity distribution", "MODEL OUTPUT")

severity_vals = res["Severity P50 if Late"]
col1, col2, col3, col4 = st.columns(4)
col1.metric("Median", format_days(float(severity_vals.median())))
col2.metric("P75", format_days(float(severity_vals.quantile(0.75))))
col3.metric("P90", format_days(float(severity_vals.quantile(0.90))))
col4.metric("Maximum", format_days(float(severity_vals.max())))

severity_chart = pd.DataFrame({"Conditional Delay P50 (days)": severity_vals})
st.bar_chart(severity_chart, x_label="Conditional delay P50 (days)", y_label="Count")

with st.expander("Technical summary statistics"):
    st.dataframe(
        severity_vals.describe().to_frame("days"),
    )

st.divider()

# ── Top risk drivers across portfolio ────────────────────────────────────────
section_header("Top risk drivers across portfolio", "MODEL OUTPUT")
st.caption("Aggregated |SHAP| across the top-10 highest-risk shipments.")

with st.spinner("Computing aggregated SHAP..."):
    shap_df = _build_portfolio_shap()

if not shap_df.empty:
    chart_shap = shap_df.set_index("Feature")
    st.bar_chart(chart_shap, horizontal=True)
else:
    st.info("Portfolio SHAP aggregation unavailable.")

disclaimer_box(
    "Predicted portfolio states are model outputs from the frozen holdout sample. "
    "This page does not present them as observed future outcomes."
)
