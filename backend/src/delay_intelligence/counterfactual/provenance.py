"""
Data Provenance and Scientific Non-Causal Guardrails for Experiment E10.

Experiment E10 (Counterfactual Policy Evaluation) operates under strict scientific integrity:
1. Historical SCMS records lack randomized treatment assignments and explicit intervention logs.
   No claims of actual historical treatment effects or true causal efficacy are made.
2. All records and simulation outputs are tagged with explicit provenance tiers:
   - OBSERVED_SCMS_DATA: Ground-truth historical features and timestamps.
   - SYNTHETIC_E9_STATE: Simulated operational state variables and telemetry.
   - SIMULATED_COUNTERFACTUAL: Simulated post-intervention states and actions.
   - SIMULATED_COST: Synthetic economic costs computed under scenario parameterizations.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional, Set, Union
import pandas as pd


class ProvenanceTag(str, Enum):
    """Immutable enumeration of verified data provenance tags."""
    OBSERVED_SCMS_DATA = "OBSERVED_SCMS_DATA"
    SYNTHETIC_E9_STATE = "SYNTHETIC_E9_STATE"
    SIMULATED_COUNTERFACTUAL = "SIMULATED_COUNTERFACTUAL"
    SIMULATED_COST = "SIMULATED_COST"


NON_CAUSAL_DISCLAIMER: str = (
    "MANDATORY SCIENTIFIC NOTICE: Historical SCMS supply chain records lack randomized "
    "treatment assignments and explicit intervention logs. All counterfactual transitions, "
    "risk reductions, and cost savings evaluated in Experiment E10 represent synthetic "
    "scenario simulations parameterized by explicit domain assumptions. No observational "
    "claims of actual historical intervention efficacy or true causal treatment effects are asserted."
)

VALID_PROVENANCE_TAGS: Set[str] = {tag.value for tag in ProvenanceTag}


class ProvenanceValidationError(ValueError):
    """Raised when an invalid or unverified data provenance tag is encountered."""
    pass


def validate_provenance_tag(tag: str) -> str:
    """
    Validates that a provenance tag belongs to the allowed provenance tiers.

    Args:
        tag: String tag to validate.

    Returns:
        The validated tag string.

    Raises:
        ProvenanceValidationError: If the tag is not recognized.
    """
    if not isinstance(tag, str) or tag not in VALID_PROVENANCE_TAGS:
        raise ProvenanceValidationError(
            f"Invalid provenance tag '{tag}'. Must be one of: {sorted(list(VALID_PROVENANCE_TAGS))}"
        )
    return tag


def attach_provenance_metadata(
    df: pd.DataFrame,
    default_tag: Union[str, ProvenanceTag] = ProvenanceTag.SIMULATED_COUNTERFACTUAL,
) -> pd.DataFrame:
    """
    Attaches a standardized provenance column to a DataFrame if not present.

    Args:
        df: Input DataFrame.
        default_tag: Provenance tag to apply.

    Returns:
        DataFrame with verified 'provenance_tag' column.
    """
    tag_val = default_tag.value if isinstance(default_tag, ProvenanceTag) else default_tag
    validate_provenance_tag(tag_val)
    df_out = df.copy()
    if "provenance_tag" not in df_out.columns:
        df_out["provenance_tag"] = tag_val
    else:
        # Validate all existing tags
        for t in df_out["provenance_tag"].unique():
            validate_provenance_tag(t)
    return df_out


def get_provenance_header() -> Dict[str, Any]:
    """Returns standardized provenance metadata dictionary for JSON/YAML manifests."""
    return {
        "scientific_disclaimer": NON_CAUSAL_DISCLAIMER,
        "valid_provenance_tiers": sorted(list(VALID_PROVENANCE_TAGS)),
        "provenance_definitions": {
            ProvenanceTag.OBSERVED_SCMS_DATA.value: (
                "Ground-truth historical shipment features, timestamps, and observational outcomes."
            ),
            ProvenanceTag.SYNTHETIC_E9_STATE.value: (
                "Simulated operational state variables and telemetry anomalies generated across E9 regimes."
            ),
            ProvenanceTag.SIMULATED_COUNTERFACTUAL.value: (
                "Model-simulated counterfactual outcomes under hypothetical policy intervention."
            ),
            ProvenanceTag.SIMULATED_COST.value: (
                "Synthetic business economic costs computed under scenario cost parameterizations."
            ),
        },
    }
