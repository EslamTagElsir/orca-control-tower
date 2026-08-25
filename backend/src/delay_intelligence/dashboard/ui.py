"""Shared UI design system for Delay Intelligence dashboard.

Provides consistent typography, KPI cards, badges, section headers,
and chart formatting across all pages. All visual elements are defined
here so the dashboard looks like ONE PRODUCT.
"""
from __future__ import annotations

import streamlit as st


# ── Evidence labels ──────────────────────────────────────────────────────────
EVIDENCE_LABELS = {
    "REAL DATA": {"icon": ":material/database:", "color": "green"},
    "MODEL OUTPUT": {"icon": ":material/model_training:", "color": "blue"},
    "SIMULATED SCENARIO": {"icon": ":material/science:", "color": "orange"},
    "EXPLORATORY ONLY": {"icon": ":material/explore:", "color": "violet"},
    "NOT VALIDATED": {"icon": ":material/warning:", "color": "gray"},
}


def evidence_badges(*labels: str) -> None:
    """Render compact evidence badges using native Streamlit."""
    cols = st.columns(len(labels))
    for col, label in zip(cols, labels):
        info = EVIDENCE_LABELS.get(label, {"icon": ":material/info:", "color": "gray"})
        col.badge(label, icon=info["icon"], color=info["color"])


def section_header(title: str, evidence_label: str | None = None) -> None:
    """Render a section header with optional evidence badge."""
    if evidence_label:
        c1, c2 = st.columns([3, 1])
        c1.markdown(f"### {title}")
        info = EVIDENCE_LABELS.get(evidence_label, {"icon": ":material/info:", "color": "gray"})
        c2.badge(evidence_label, icon=info["icon"], color=info["color"])
    else:
        st.markdown(f"### {title}")


def kpi_card(label: str, value: str, help_text: str | None = None) -> None:
    """Render a single KPI metric."""
    st.metric(label=label, value=value, help=help_text)


def kpi_row(metrics: list[dict]) -> None:
    """Render a row of KPI cards.

    Each dict: {"label": str, "value": str, "help": str | None}
    """
    cols = st.columns(len(metrics))
    for col, m in zip(cols, metrics):
        col.metric(label=m["label"], value=m["value"], help=m.get("help"))


def risk_color(probability: float) -> str:
    """Return a semantic color name based on risk level."""
    if probability >= 0.6:
        return "red"
    if probability >= 0.3:
        return "orange"
    return "green"


def risk_badge(tier: str) -> None:
    """Render a risk tier badge with appropriate color."""
    color_map = {
        "LOW_RISK": "green",
        "WATCH": "orange",
        "HIGH_RISK": "red",
        "CRITICAL": "red",
    }
    color = color_map.get(tier, "gray")
    st.badge(tier.replace("_", " "), color=color)


def disclaimer_box(text: str) -> None:
    """Render a subtle disclaimer."""
    st.caption(text)


def simulated_warning() -> None:
    """Standard warning for simulated scenario sections."""
    st.caption(
        ":material/science: **SIMULATED SCENARIO** — "
        "These are configurable planning assumptions, not accounting facts."
    )


def format_pct(value: float, decimals: int = 1) -> str:
    """Format a probability as a percentage string."""
    return f"{value:.{decimals}%}"


def format_currency(value: float) -> str:
    """Format a dollar amount."""
    return f"${value:,.0f}"


def format_days(value: float, decimals: int = 1) -> str:
    """Format a day count."""
    return f"{value:.{decimals}f} days"
