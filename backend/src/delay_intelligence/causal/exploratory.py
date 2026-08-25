"""Utilities for reading legacy causal-discovery outputs as hypotheses only."""
from __future__ import annotations

from pathlib import Path
import pandas as pd

DISCLAIMER = (
    "Exploratory causal hypothesis only. The legacy PC/Fisher-Z experiment used encoded categorical variables; "
    "it does not identify intervention effects or justify causal/ROI claims."
)


def load_exploratory_edges(path: str | Path = "artifacts/causal/causal_edge_stability.csv") -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df.copy()
    df["evidence_scope"] = "EXPLORATORY ONLY"
    df["causal_disclaimer"] = DISCLAIMER
    return df
