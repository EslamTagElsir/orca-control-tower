from pydantic import BaseModel, model_validator
from typing import List, Dict, Any


class PredictRequest(BaseModel):
    # Dynamic fields support since features are numerous.
    features: Dict[str, Any]

    @model_validator(mode="after")
    def check_forbidden_features(self) -> "PredictRequest":
        forbidden = [
            "Delay_Days",
            "Delay_Flag",
            "Delivered to Client Date",
            "Delivery Recorded Date",
            "is_temporal_anomaly",
        ]
        for f in forbidden:
            if f in self.features:
                raise ValueError(f"Forbidden post-outcome feature included: {f}")
        return self


class PredictResponse(BaseModel):
    probability_late: float
    classification_decision: bool
    decision_threshold: float
    risk_tier: str
    severity_p50: float
    severity_interval_90: List[float]
    severity_definition: str
    evidence_label: str = "MODEL OUTPUT"
    model_version: str
    prediction_contract_version: str


class ExplainResponse(BaseModel):
    probability_late: float
    top_predictive_drivers: List[str]
    shap_contributions: List[Dict[str, Any]]
    causal_candidates: List[str]
    causal_stability: str
    causal_scope: str = "EXPLORATORY ONLY"
    evidence_label: str = "MODEL OUTPUT"


class ImpactEstimate(BaseModel):
    type: str
    base_expected_delay_cost: float
    action_cost: float
    simulated_net_benefit: float


class RecommendResponse(BaseModel):
    recommendation: str
    decision_reason: List[str]
    expected_impact_type: str
    robustness: str
    human_approval_required: bool
    evidence_label: str = "SIMULATED SCENARIO"
    impact_disclaimer: str = "Scenario estimate based on configurable assumptions; not realized financial savings."
