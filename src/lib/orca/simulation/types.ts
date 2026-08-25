/**
 * Operational Digital Twin — domain types.
 *
 * PROVENANCE CONTRACT (enforced across this whole folder):
 *  - Shipment identity, routes, coordinates, progress, status, ETA movement and
 *    every operational event are SYNTHETIC OPERATIONAL DIGITAL TWIN /
 *    SYNTHETIC LIVE OPERATIONS. They are never real GPS/AIS/TMS telemetry.
 *  - `risk`, `risk_tier`, `severity_*`, `classification_decision` and
 *    `decision_threshold` are copied verbatim from a real ORCA /predict call.
 *    Nothing in this folder may compute, guess or adjust them.
 *  - Recommendations come verbatim from a real ORCA /recommend call.
 *  - When the backend is unreachable, model state becomes `offline` and the
 *    display tier becomes UNSCORED. Fixture risk is never substituted.
 *
 * Framework-agnostic: plain TypeScript, no framework imports.
 */

import type { FeatureMap } from "../source-data";
import type { DecisionAction, DisplayTier, EventType, RiskTier } from "../types";
import type { HumanDecisionKind, OperatorAction, ReasonCode } from "./intervention-policy";
import type { TargetBand } from "./mutation-profiles";


/* ------------------------------------------------------------------ */
/* Provenance vocabulary                                               */
/* ------------------------------------------------------------------ */

export const SIM_PROVENANCE = {
  /** Generated shipment identity + route plan. */
  twin: "SYNTHETIC OPERATIONAL DIGITAL TWIN",
  /** Operational motion and events. */
  ops: "SYNTHETIC LIVE OPERATIONS",
  /** Real /predict + /recommend output. */
  model: "MODEL OUTPUT",
  /** Feature perturbation applied by a synthetic event. */
  shockInput: "SIMULATED SCENARIO",
  /** Model score of a perturbed feature state. */
  shockResult: "MODEL OUTPUT ON SIMULATED SCENARIO",
  /** Backend unreachable. */
  unscored: "UNSCORED / MODEL OFFLINE",
  /** A real operator decision recorded against the synthetic simulation. */
  humanDecision: "HUMAN DECISION ON SYNTHETIC SIMULATION",
} as const;


/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

export type SimStatus =
  | "CREATED"
  | "DISPATCHED"
  | "ORIGIN_HANDLING"
  | "IN_TRANSIT"
  | "CUSTOMS"
  | "EXCEPTION"
  | "FINAL_MILE"
  | "DELIVERED";

export const SIM_STATUS_LABEL: Record<SimStatus, string> = {
  CREATED: "Created",
  DISPATCHED: "Dispatched",
  ORIGIN_HANDLING: "Origin handling",
  IN_TRANSIT: "In transit",
  CUSTOMS: "Customs",
  EXCEPTION: "Exception",
  FINAL_MILE: "Final mile",
  DELIVERED: "Delivered",
};

export type SimEventFamily =
  | "SPAWN"
  | "DISPATCH"
  | "ORIGIN_HANDLING"
  | "IN_TRANSIT"
  | "CUSTOMS_HOLD"
  | "CUSTOMS_CLEARED"
  | "PORT_CONGESTION"
  | "CARRIER_DELAY"
  | "ROUTE_DISRUPTION"
  | "WEATHER_DELAY"
  | "ETA_SLIP"
  | "RECOVERY"
  | "FINAL_MILE"
  | "DELIVERED"
  | "MODEL_SCORE"
  | "MODEL_RESCORE"
  | "MODEL_OFFLINE"
  | "RECOMMENDATION"
  | "DECISION_REQUIRED"
  | "HUMAN_DECISION"
  | "INTERVENTION";


export const FAMILY_LABEL: Record<SimEventFamily, string> = {
  SPAWN: "Shipment created",
  DISPATCH: "Dispatch",
  ORIGIN_HANDLING: "Origin handling",
  IN_TRANSIT: "In transit",
  CUSTOMS_HOLD: "Customs hold",
  CUSTOMS_CLEARED: "Customs cleared",
  PORT_CONGESTION: "Port congestion",
  CARRIER_DELAY: "Carrier delay",
  ROUTE_DISRUPTION: "Route disruption",
  WEATHER_DELAY: "Weather delay",
  ETA_SLIP: "ETA slip",
  RECOVERY: "Recovery",
  FINAL_MILE: "Final mile",
  DELIVERED: "Delivered",
  MODEL_SCORE: "Model score",
  MODEL_RESCORE: "Model re-score",
  MODEL_OFFLINE: "Model offline",
  RECOMMENDATION: "Recommendation",
  DECISION_REQUIRED: "Human decision required",
  HUMAN_DECISION: "Human decision",
  INTERVENTION: "Intervention applied",

};

export const FAMILY_EVENT_TYPE: Record<SimEventFamily, EventType> = {
  SPAWN: "POSITION",
  DISPATCH: "POSITION",
  ORIGIN_HANDLING: "POSITION",
  IN_TRANSIT: "POSITION",
  CUSTOMS_HOLD: "EXCEPTION",
  CUSTOMS_CLEARED: "DECISION",
  PORT_CONGESTION: "EXCEPTION",
  CARRIER_DELAY: "EXCEPTION",
  ROUTE_DISRUPTION: "EXCEPTION",
  WEATHER_DELAY: "EXCEPTION",
  ETA_SLIP: "ETA",
  RECOVERY: "DECISION",
  FINAL_MILE: "POSITION",
  DELIVERED: "DECISION",
  MODEL_SCORE: "MODEL",
  MODEL_RESCORE: "MODEL",
  MODEL_OFFLINE: "MODEL",
  RECOMMENDATION: "DECISION",
  DECISION_REQUIRED: "DECISION",
  HUMAN_DECISION: "DECISION",
  INTERVENTION: "DECISION",

};

/** Families that represent an operational exception being opened. */
export const EXCEPTION_FAMILIES: SimEventFamily[] = [
  "CUSTOMS_HOLD",
  "PORT_CONGESTION",
  "CARRIER_DELAY",
  "ROUTE_DISRUPTION",
  "WEATHER_DELAY",
];

/* ------------------------------------------------------------------ */
/* Model state                                                         */
/* ------------------------------------------------------------------ */

export type SimModelPhase = "pending" | "scored" | "offline";

/** Verbatim /predict output plus the previous score for before → after. */
export interface SimModelState {
  phase: SimModelPhase;
  risk: number | null;
  tier: DisplayTier;
  severity_p50: number | null;
  severity_interval_90: [number, number] | null;
  classification_decision: boolean | null;
  decision_threshold: number | null;
  model_version: string | null;
  /** Previous /predict probability, when this shipment has been re-scored. */
  previousRisk: number | null;
  previousTier: RiskTier | null;
  /** Sim-clock ms of the last successful score. */
  scoredAt: number | null;
  offlineReason: string | null;
  recommendation: {
    action: DecisionAction;
    raw: string;
    reasons: string[];
    human_approval_required: boolean;
  } | null;
}

export const UNSCORED_MODEL: SimModelState = {
  phase: "pending",
  risk: null,
  tier: "UNSCORED",
  severity_p50: null,
  severity_interval_90: null,
  classification_decision: null,
  decision_threshold: null,
  model_version: null,
  previousRisk: null,
  previousTier: null,
  scoredAt: null,
  offlineReason: null,
  recommendation: null,
};

/* ------------------------------------------------------------------ */
/* Shipment                                                            */
/* ------------------------------------------------------------------ */

export type LatLon = [number, number];

/** A planned synthetic shock: a bounded pre-outcome feature perturbation. */
export interface PlannedShock {
  atProgress: number;
  family: SimEventFamily;
  profileKey: string;
  applied: boolean;
  /** Progress at which the recovery event fires. */
  recoverAtProgress: number;
  recovered: boolean;
}

export interface SimShipment {
  /** Synthetic operational ID — never a real shipment number. */
  id: string;
  /** Real source/holdout row used as a FEATURE TEMPLATE ONLY (audit trail). */
  templateId: string;
  origin: string;
  destination: string;
  route: string;
  mode: string;
  vendor: string;
  productGroup: string;

  status: SimStatus;
  /** 0 → 1 along the synthetic route plan. */
  progress: number;
  start: LatLon;
  end: LatLon;
  /** Synthetic planning polyline (great-circle-ish interpolation). */
  waypoints: LatLon[];
  position: LatLon;

  /** Sim-clock ms when created / delivered. */
  createdAt: number;
  deliveredAt: number | null;
  /** Total synthetic journey duration in sim ms. */
  journeyMs: number;
  travelledMs: number;
  /** Remaining synthetic hold (customs / exception) in sim ms. */
  holdMs: number;

  etaVarianceHours: number;
  requiresCustoms: boolean;
  exceptionOpen: boolean;
  exceptionFamily: SimEventFamily | null;
  nextMilestone: string;
  latestEvent: string | null;

  /** Current synthetic pre-outcome feature state (template + shocks). */
  raw: Record<string, string>;
  features: FeatureMap;
  /** Cumulative audit of every feature shock applied to this shipment. */
  featureAudit: string[];
  /** Which mutation profiles have been applied, in order. */
  appliedProfiles: string[];

  /**
   * Which part of the model's output range this shipment's creation-time
   * candidate ladder aimed at. It is a SEARCH TARGET ONLY — the tier below is
   * always whatever ORCA /predict actually returned.
   */
  targetBand: TargetBand;
  /**
   * Ordered creation-time candidate feature states, scored in order by real
   * /predict calls. Cleared once the search resolves.
   */
  candidates: { key: string; label: string; raw: Record<string, string> }[];
  /** Human-readable trace of the candidate search (recipe → model risk). */
  candidateSearch: string[];

  model: SimModelState;

  plannedShocks: PlannedShock[];
  /** Routine progress pings that never call the model. */
  plannedPings: number[];
  firedPings: number[];
  eventCount: number;
  /** Sim-clock ms of the last score REQUEST — used for the re-score cooldown. */
  lastScoreRequestAt: number;

  /**
   * True while an open Decision Episode is waiting for a human decision. The
   * shipment holds in place (no operational progress) until it is resolved.
   */
  awaitingDecision: boolean;
  /** Local id of the shipment's currently open episode, if any. */
  episodeId: string | null;
  /** Number of human interventions applied to this shipment. */
  interventionCount: number;
}

/* ------------------------------------------------------------------ */
/* Decision episodes                                                   */
/* ------------------------------------------------------------------ */

export type SimEpisodeStatus = "PENDING" | "RESOLVED";

/** A human decision recorded against an episode. */
export interface SimHumanDecision {
  kind: HumanDecisionKind;
  /** Verbatim ORCA /recommend output the operator responded to. */
  recommendedAction: string;
  chosenAction: OperatorAction;
  reasonCode: ReasonCode;
  note: string | null;
  actorLabel: string;
  decidedSimMs: number;
  /** Wall-clock ms between the episode opening and the decision. */
  latencyMs: number;
}

/**
 * A Decision Episode: the auditable unit that binds a model inference and its
 * recommendation to the human decision that answered it.
 */
export interface SimEpisode {
  /** Local (in-run) id. */
  id: string;
  /** Persisted database id once the write resolves; null while in flight. */
  dbId: string | null;
  runId: string;
  shipmentId: string;
  route: string;
  triggerEventId: string | null;
  openedSimMs: number;
  openedAtEpoch: number;
  /** Verbatim /recommend output. */
  recommendedAction: string;
  reasons: string[];
  backendApprovalRequired: boolean;
  /** Verbatim /predict state at the moment the episode opened. */
  riskAtOpen: number | null;
  tierAtOpen: DisplayTier;
  severityAtOpen: number | null;
  modelVersion: string | null;
  status: SimEpisodeStatus;
  decision: SimHumanDecision | null;
  /** Feature audit of the applied intervention, if any. */
  interventionAudit: string[];
}


/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export interface SimEvent {
  id: string;
  /** Sim-clock ms. */
  at: number;
  /** HH:MM:SS derived from run start + sim clock (synthetic operational time). */
  clock: string;
  shipmentId: string;
  family: SimEventFamily;
  eventType: EventType;
  detail: string;
  provenance: string;
  riskBefore?: number | null;
  riskAfter?: number | null;
  featureAudit?: string[];
}

/* ------------------------------------------------------------------ */
/* Run state                                                           */
/* ------------------------------------------------------------------ */

export type SimRunStatus = "idle" | "running" | "paused";

export const SIM_SPEEDS = [1, 5, 10, 30] as const;
export type SimSpeed = (typeof SIM_SPEEDS)[number];
export const DEFAULT_SIM_SPEED: SimSpeed = 10;

export interface SimMetrics {
  generated: number;
  delivered: number;
  exceptionsOpened: number;
  recoveries: number;
  predictCalls: number;
  recommendCalls: number;
  rescores: number;
  scoreFailures: number;
  episodesOpened: number;
  decisionsRecorded: number;
  interventionsApplied: number;
}

export interface SimulationSnapshot {
  version: number;
  runId: string;
  seed: number;
  status: SimRunStatus;
  /** Epoch ms when this run started (wall clock). */
  startedAtEpoch: number;
  /** Accumulated simulated time in ms. */
  simClockMs: number;
  speed: SimSpeed;
  active: SimShipment[];
  /** Bounded history of delivered shipments, newest first. */
  recentlyDelivered: SimShipment[];
  /** Bounded global event stream, newest first. */
  events: SimEvent[];
  /** Decision episodes for this run, newest first (pending and resolved). */
  episodes: SimEpisode[];
  metrics: SimMetrics;
  nextSpawnAtMs: number;
  /** null until the first model call resolves. */
  modelOnline: boolean | null;
  modelOfflineReason: string | null;

}

/* ------------------------------------------------------------------ */
/* Extension seam for future shipment sources                          */
/* ------------------------------------------------------------------ */

/**
 * A source of synthetic operational shipments. Implemented today by
 * `AutomaticGeneratorSource`; the contract is deliberately narrow so an
 * ExistingPortfolioSource / CsvImportSource / ExternalApiSource can be dropped
 * in later without touching the engine or any page.
 */
export interface ShipmentSource {
  readonly kind: "automatic" | "portfolio" | "csv" | "external";
  readonly label: string;
  /** Produce the next shipment for this run. */
  next(context: {
    simClockMs: number;
    sequence: number;
    runId: string;
    /** Requested creation-time candidate band; the tier still comes from /predict. */
    targetBand?: TargetBand;
  }): SimShipment;
}
