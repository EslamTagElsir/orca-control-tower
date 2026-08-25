from __future__ import annotations

from pathlib import Path

import pandas as pd
from fastapi import Depends, FastAPI, HTTPException

from delay_intelligence.api.schemas import (
    ExplainResponse,
    PredictRequest,
    PredictResponse,
    RecommendResponse,
)
from delay_intelligence.decision.engine import DecisionEngine
from delay_intelligence.serving.feature_builder import build_features
from delay_intelligence.serving.model_loader import ModelLoader

app = FastAPI(
    title="Delay Intelligence API",
    description="Research-validated decision intelligence prototype. Model outputs, exploratory causal hypotheses, and simulated scenarios are explicitly labeled.",
)

REPO_ROOT = Path(__file__).resolve().parents[3]
REGISTRY_PATH = REPO_ROOT / "artifacts" / "model_registry" / "v2"
DECISION_CONFIG = REPO_ROOT / "configs" / "decision.yaml"
CAUSAL_STABILITY = REPO_ROOT / "artifacts" / "causal" / "causal_edge_stability.csv"


def get_model_loader():
    return ModelLoader.get_instance()


def get_decision_engine():
    return DecisionEngine(config_path=str(DECISION_CONFIG))


def _risk_tier(p_late: float) -> str:
    if p_late <= 0.3:
        return "LOW_RISK"
    if p_late <= 0.6:
        return "WATCH"
    if p_late <= 0.85:
        return "HIGH_RISK"
    return "CRITICAL"


def _exploratory_causal_hypotheses(top_features: list[str]) -> list[str]:
    """Match predictive drivers to legacy stability edges, as hypotheses only.

    The underlying historical causal exploration used PC/Fisher-Z with encoded
    categorical variables, so these edges are *not* treated as identified causal
    effects and are never used as proof of intervention efficacy.
    """
    if not CAUSAL_STABILITY.exists():
        return []
    try:
        edges = pd.read_csv(CAUSAL_STABILITY)
    except Exception:
        return []

    source_col = next((c for c in ["source", "from", "Source", "From"] if c in edges.columns), None)
    target_col = next((c for c in ["target", "to", "Target", "To"] if c in edges.columns), None)
    stable_col = next((c for c in ["stable", "is_stable", "Stable", "stability_class"] if c in edges.columns), None)
    if not source_col or not target_col:
        return []

    if stable_col:
        stable = edges[stable_col].astype(str).str.lower().isin(["true", "1", "yes", "stable"])
        edges = edges.loc[stable]

    top = set(top_features)
    hypotheses = []
    for _, row in edges.iterrows():
        src, dst = str(row[source_col]), str(row[target_col])
        if src in top and "Delay" in dst:
            hypotheses.append(f"{src} -> {dst}")
    return hypotheses[:5]


@app.get("/health")
def health():
    try:
        loader = get_model_loader()
        return {
            "status": "ok",
            "model_version": loader.metadata["model_version"],
            "registry_role": loader.metadata.get("registry_role"),
            "evidence_labels": loader.metadata.get("evidence_labels", []),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest, loader: ModelLoader = Depends(get_model_loader)):
    df = build_features(request.features, loader.feature_schema)
    prob = loader.calibrated_probability(df)
    severity = loader.severity_if_delayed(df)

    return PredictResponse(
        probability_late=prob,
        classification_decision=bool(prob >= loader.decision_threshold),
        decision_threshold=loader.decision_threshold,
        risk_tier=_risk_tier(prob),
        severity_p50=severity["p50"],
        severity_interval_90=severity["interval_90"],
        severity_definition=severity["definition"],
        model_version=loader.metadata["model_version"],
        prediction_contract_version=loader.metadata["prediction_contract_version"],
    )


@app.post("/explain", response_model=ExplainResponse)
def explain(request: PredictRequest, loader: ModelLoader = Depends(get_model_loader)):
    df = build_features(request.features, loader.feature_schema)
    prob = loader.calibrated_probability(df)
    shap_rows = loader.shap_explanation(df, top_k=5)
    top_features = [x["feature"] for x in shap_rows]
    hypotheses = _exploratory_causal_hypotheses(top_features)

    return ExplainResponse(
        probability_late=prob,
        top_predictive_drivers=top_features,
        shap_contributions=shap_rows,
        causal_candidates=hypotheses,
        causal_stability="exploratory_hypothesis_only",
    )


@app.post("/recommend", response_model=RecommendResponse)
def recommend(
    request: PredictRequest,
    loader: ModelLoader = Depends(get_model_loader),
    engine: DecisionEngine = Depends(get_decision_engine),
):
    pred = predict(request, loader)
    expl = explain(request, loader)

    value = request.features.get("Line Item Value", 0.0)
    value = 0.0 if value is None else float(value)

    decision = engine.evaluate_sensitivity(
        shipment_id="api_req",
        p_late=pred.probability_late,
        severity_p50=pred.severity_p50,
        severity_interval_90=pred.severity_interval_90,
        line_item_value=value,
        fulfillment_channel=request.features.get("Fulfill Via", "Unknown"),
        shap_drivers=expl.top_predictive_drivers,
        causal_candidates=expl.causal_candidates,
    )

    return RecommendResponse(
        recommendation=decision["recommended_action"],
        decision_reason=decision["decision_reason"],
        expected_impact_type=decision["expected_impact"]["type"],
        robustness=decision["robustness_class"],
        human_approval_required=decision["human_approval_required"],
    )
