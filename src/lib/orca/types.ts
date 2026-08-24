/**
 * ORCA API contract types.
 *
 * These mirror the FastAPI response models in
 * `delay_intelligence/api/main.py` and `delay_intelligence/api/demo_service.py`
 * exactly. Nothing here invents fields the backend does not return.
 *
 * Framework-agnostic: plain TypeScript, no framework imports.
 */

export type RiskTier = "LOW_RISK" | "WATCH" | "HIGH_RISK" | "CRITICAL";

/**
 * Presentation tier. `UNSCORED` is NOT a model tier: it means no ORCA /predict
 * score is available (backend unreachable or score still in flight) and must
 * render with neutral styling. Backend payload fields always use `RiskTier`.
 */
export type DisplayTier = RiskTier | "UNSCORED";

export type DecisionAction = "NO_ACTION" | "MONITOR" | "INTERVENE";

export type EventType = "POSITION" | "ETA" | "EXCEPTION" | "MODEL" | "DECISION";

export type TimelineState = "complete" | "active" | "pending";

/** Provenance strings are surfaced verbatim from the API. */
export type Provenance = string;

export interface HealthResponse {
  status: string;
  model_version: string;
  registry_role?: string | null;
  evidence_labels?: string[];
}

export interface PredictResponse {
  probability_late: number;
  classification_decision: boolean;
  decision_threshold: number;
  risk_tier: RiskTier;
  severity_p50: number;
  severity_interval_90: [number, number];
  severity_definition: string;
  model_version: string;
  prediction_contract_version: string;
}

export interface ShapContribution {
  feature: string;
  shap_value: number;
}

export interface ExplainResponse {
  probability_late: number;
  top_predictive_drivers: string[];
  shap_contributions: ShapContribution[];
  causal_candidates: string[];
  causal_stability: string;
}

export interface RecommendResponse {
  recommendation: string;
  /** FastAPI returns a list of reason strings, not a single string. */
  decision_reason: string[];
  expected_impact_type: string;
  robustness: string;
  human_approval_required: boolean;
}

/** A serialized portfolio shipment, as returned by `_serialize_shipment`. */
export interface OrcaShipment {
  id: string;
  source_shipment_id: string;
  origin: string;
  destination: string;
  route: string;
  issue: string;
  risk: number;
  risk_tier: RiskTier;
  severity_p50: number;
  severity_interval_90: [number, number];
  eta_variance_hours: number;
  decision: DecisionAction;
  expected_exposure: number;
  net_benefit: number;
  status: string;
  progress_pct: number;
  customer_priority: string;
  lat: number;
  lon: number;
  provenance: Provenance;
}

export interface OrcaKpis {
  active_shipments: number;
  exceptions: number;
  /** CRITICAL model tier count (risk > 0.85). */
  critical_exceptions: number;
  /** Count of predictions above the model decision threshold (classification_decision). */
  model_positive: number;
  estimated_exposure: number;
  potential_net_benefit: number;
  modeled_on_time_likelihood: number;
  average_risk: number;
}

export interface RiskDistribution {
  low: number;
  watch: number;
  high: number;
  critical: number;
}

export interface TopDestination {
  destination: string;
  risk: number;
  shipments: number;
}

export interface OrcaEvent {
  timestamp: string;
  shipment_id: string;
  event_type: EventType;
  detail: string;
  provenance: Provenance;
}

export interface EvidenceBlock {
  real_data: string;
  model_output: string;
  simulated: string;
}

export interface OverviewResponse {
  seed: number;
  evidence: EvidenceBlock;
  kpis: OrcaKpis;
  priority_exceptions: OrcaShipment[];
  map_points: OrcaShipment[];
  risk_distribution: RiskDistribution;
  top_destinations: TopDestination[];
  events: OrcaEvent[];
  model_version: string;
}

export interface RiskDriver {
  feature: string;
  shap_value: number;
  direction: "raises" | "reduces";
}

export interface TimelineStage {
  label: string;
  state: TimelineState;
}

export interface ShipmentDetailResponse {
  display_id: string;
  source_shipment_id: string;
  origin: string;
  destination: string;
  route: string;
  status: string;
  progress_pct: number;
  eta_variance_hours: number;
  customer_priority: string;
  provenance: Provenance;
  risk: number;
  risk_tier: RiskTier;
  severity_p50: number;
  severity_interval_90: [number, number];
  model_version: string;
  shipment_mode: string;
  vendor: string;
  fulfill_via: string;
  line_item_value: number;
  risk_drivers: RiskDriver[];
  timeline: TimelineStage[];
  evidence_label: string;
}

export interface ScenarioOption {
  key: string;
  label: string;
  description: string;
  event_label: string;
}

export interface ScenarioEconomics {
  expected_exposure: number;
  expected_benefit: number;
  intervention_cost: number;
  net_benefit: number;
  recommendation: DecisionAction;
}

export interface ScenarioRunResponse {
  shipment_id: string;
  source_shipment_id: string;
  scenario: string;
  scenario_label: string;
  baseline: { risk: number; risk_tier: RiskTier; severity_p50: number };
  result: {
    risk: number;
    risk_tier: RiskTier;
    severity_p50: number;
    risk_delta_pp: number;
  };
  economics: ScenarioEconomics;
  feature_audit: string[];
  human_approval_required: boolean;
  evidence_label: string;
  disclaimer: string;
}

/** Data-source mode for every panel. */
export type DataSource = "live" | "fixture";

export type ConnectionState = "live" | "connecting" | "offline";

/**
 * Presentation row shared by every shipment table / picker / map.
 *
 * Identical to `OrcaShipment` except the tier may be `UNSCORED`, so synthetic
 * digital-twin shipments awaiting (or missing) a real /predict score can reuse
 * the same components without ever borrowing a model tier they do not have.
 * `OrcaShipment` is assignable to `ShipmentRow`.
 */
export type ShipmentRow = Omit<OrcaShipment, "risk_tier" | "decision"> & {
  risk_tier: DisplayTier;
  /** null when no ORCA /recommend action is available for this shipment yet. */
  decision: DecisionAction | null;
};
