from __future__ import annotations

import json
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
from delay_intelligence.monitoring.readiness import validate_production_drift_artifact
from delay_intelligence.serving.feature_builder import build_features
from delay_intelligence.serving.model_loader import ModelLoader

app = FastAPI(
    title="Delay Intelligence API",
    description="Research-validated decision intelligence prototype. Model outputs, exploratory causal hypotheses, and simulated scenarios are explicitly labeled.",
)

REPO_ROOT = Path(__file__).resolve().parents[3]
REGISTRY_PATH = REPO_ROOT / "artifacts" / "model_registry" / "v2"
DECISION_CONFIG = REPO_ROOT / "configs" / "decision.yaml"
DRIFT_CONFIG = REPO_ROOT / "configs" / "drift.yaml"
DRIFT_PACKAGE = REPO_ROOT / "src" / "delay_intelligence" / "drift"
DRIFT_ARTIFACTS = REPO_ROOT / "artifacts" / "drift"
PRODUCTION_DRIFT_ARTIFACT = REPO_ROOT / "artifacts" / "monitoring" / "latest.json"
CAUSAL_STABILITY = REPO_ROOT / "artifacts" / "causal" / "causal_edge_stability.csv"


def get_model_loader():
    return ModelLoader.get_instance()


def get_decision_engine():
    return DecisionEngine(config_path=str(DECISION_CONFIG))


def _read_registry_json(filename: str) -> dict:
    """Read a locked registry JSON artifact without inventing fallback values."""
    path = REGISTRY_PATH / filename
    if not path.exists():
        raise HTTPException(status_code=503, detail=f"Registry artifact unavailable: {filename}")
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Invalid registry artifact {filename}: {exc}") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail=f"Registry artifact {filename} must contain an object")
    return payload


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


@app.get("/reliability")
def reliability():
    """Expose immutable holdout reliability evidence from the serving registry.

    This is evaluation evidence, not live production telemetry. Keeping it as a
    dedicated endpoint lets the UI report calibration and discrimination metrics
    without hard-coded demo values or re-running model evaluation at request time.
    """
    validation = _read_registry_json("serving_validation.json")
    metadata = _read_registry_json("metadata.json")
    return {
        "status": "ok",
        "model_version": metadata.get("model_version"),
        "prediction_contract_version": metadata.get("prediction_contract_version"),
        "registry_role": metadata.get("registry_role"),
        "created_utc": metadata.get("created_utc"),
        "evidence_label": validation.get("evidence_label", "MODEL OUTPUT"),
        "evaluation_role": validation.get("evaluation_role"),
        "data_sha256": validation.get("data_sha256"),
        "splits": validation.get("splits", {}),
        "classification": validation.get("classification", {}),
        "severity_cqr": validation.get("severity_cqr", {}),
    }


@app.get("/monitoring-readiness")
def monitoring_readiness():
    """Describe whether ORCA can support a truthful production-drift claim.

    Historical CV drift and serving-registry reliability remain separate from
    production telemetry. A CONNECTED state is only possible when a versioned
    production monitoring artifact passes the contract and matches the active
    serving model and prediction contract.
    """
    expected_engine_files = [
        "detector.py",
        "metrics.py",
        "policy.py",
        "runner.py",
        "schemas.py",
    ]
    expected_historical_artifacts = [
        "drift_metrics.csv",
        "feature_drift_summary.csv",
        "drift_triggers.json",
        "cv_drift_summary.json",
    ]

    metadata = _read_registry_json("metadata.json")
    engine_files = {name: (DRIFT_PACKAGE / name).exists() for name in expected_engine_files}
    artifact_files = {name: (DRIFT_ARTIFACTS / name).exists() for name in expected_historical_artifacts}
    engine_available = DRIFT_CONFIG.exists() and all(engine_files.values())
    historical_artifacts_available = all(artifact_files.values())

    production_artifact = validate_production_drift_artifact(
        PRODUCTION_DRIFT_ARTIFACT,
        expected_model_version=metadata.get("model_version"),
        expected_prediction_contract_version=metadata.get("prediction_contract_version"),
    )
    production_monitoring_connected = bool(engine_available and production_artifact["valid"])
    live_window_connected = bool(production_artifact["valid"])

    blockers: list[str] = []
    if not engine_available:
        blockers.append("Chronological drift engine/config is incomplete in this deployment.")
    blockers.extend(production_artifact["errors"])

    return {
        "status": "CONNECTED" if production_monitoring_connected else "NOT_CONNECTED",
        "evidence_label": "SYSTEM STATUS",
        "production_monitoring_connected": production_monitoring_connected,
        "live_window_connected": live_window_connected,
        "drift_engine": {
            "available": engine_available,
            "config_available": DRIFT_CONFIG.exists(),
            "engine_files": engine_files,
            "dimensions": ["feature", "prediction", "target", "uncertainty"],
            "methods": ["PSI", "Wasserstein", "KS/FDR", "JSD", "chi-square"],
        },
        "historical_evaluation": {
            "runner_available": (DRIFT_PACKAGE / "runner.py").exists(),
            "scope": "development_cv_only",
            "final_holdout_quarantined_by_design": True,
            "artifacts_available": historical_artifacts_available,
            "artifact_files": artifact_files,
        },
        "production_artifact": {
            "path": "artifacts/monitoring/latest.json",
            "present": production_artifact["artifact_present"],
            "valid": production_artifact["valid"],
            "summary": production_artifact["summary"],
            "contract_version": "1.0",
        },
        "claim_boundary": (
            "ORCA may report model-registry reliability evidence and historical development drift separately, "
            "but may only report live production drift when artifacts/monitoring/latest.json satisfies contract "
            "1.0 and matches the active serving registry."
        ),
        "blockers": blockers,
    }


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
