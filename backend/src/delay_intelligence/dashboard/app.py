"""Delay Intelligence — Streamlit entry point.

Uses st.navigation / st.Page for professional multi-page navigation.
Initializes shared session state for cross-page shipment selection.
"""
import streamlit as st

st.set_page_config(
    page_title="Delay Intelligence",
    page_icon=":material/package_2:",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Shared session state ─────────────────────────────────────────────────────
if "selected_shipment_id" not in st.session_state:
    st.session_state.selected_shipment_id = None
if "portfolio_results" not in st.session_state:
    st.session_state.portfolio_results = None
if "portfolio_df" not in st.session_state:
    st.session_state.portfolio_df = None


@st.cache_data(show_spinner=False)
def _find_default_shipment() -> str:
    """Cached lookup of highest-risk shipment for default demo selection."""
    from delay_intelligence.dashboard.api_client import find_default_demo_shipment
    return find_default_demo_shipment()


# Set the default demo shipment to the highest-risk if not yet selected
if st.session_state.selected_shipment_id is None:
    try:
        st.session_state.selected_shipment_id = _find_default_shipment()
    except Exception:
        pass  # Will fall back to first shipment on individual pages

# ── Navigation ───────────────────────────────────────────────────────────────
page = st.navigation(
    [
        st.Page("app_pages/landing.py", title="Delay Intelligence", icon=":material/package_2:", default=True),
        st.Page("app_pages/executive.py", title="Executive Control Tower", icon=":material/monitoring:"),
        st.Page("app_pages/explorer.py", title="Shipment Risk Explorer", icon=":material/search:"),
        st.Page("app_pages/action_center.py", title="Decision & Action Center", icon=":material/gavel:"),
        st.Page("app_pages/portfolio.py", title="Portfolio Intelligence", icon=":material/analytics:"),
        st.Page("app_pages/evidence.py", title="Model Evidence", icon=":material/science:"),
    ],
    position="sidebar",
)

page.run()
