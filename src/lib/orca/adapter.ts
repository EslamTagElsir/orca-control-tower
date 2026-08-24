/**
 * Core-backend compatibility adapter.
 *
 * The current ORCA backend intentionally exposes ONLY:
 *   GET  /health
 *   POST /predict
 *   POST /explain
 *   POST /recommend
 *
 * There are no /demo/* endpoints. This module composes the Control Tower
 * presentation payloads (overview, shipment detail, what-if scenarios) from
 * the four core endpoints applied to the bundled REAL source rows.
 *
 * Provenance rules enforced here:
 *   - source-row strings (country, site, vendor, mode, value) = REAL DATA
 *   - risk / severity / SHAP / recommendation                 = MODEL OUTPUT
 *   - map placement, status, progress, timeline, event stream = SYNTHETIC DEMO OVERLAY
 *   - scenario results                                        = SIMULATED SCENARIO
 * Nothing else is invented; no historical trend is fabricated.
 */

import { mapWithConcurrency, orcaRequest } from "./transport";
import {
  countryCentroid,
  PROVENANCE,
  rowToFeatures,
  sourceRow,
  sourceRows,
  type FeatureMap,
  type OrcaSourceRow,
} from "./source-data";
import { riskTier } from "./risk";
import type {
  DecisionAction,
  ExplainResponse,
  HealthResponse,
  OrcaEvent,
  OrcaShipment,
  OverviewResponse,
  PredictResponse,
  RecommendResponse,
  RiskDistribution,
  ScenarioEconomics,
  ScenarioOption,
  ScenarioRunResponse,
  ShipmentDetailResponse,
  TopDestination,
} from "./types";

/** Max simultaneous model calls against the backend. */
const CONCURRENCY = 5;

/* ------------------------------------------------------------------ */
/* Core endpoint calls                                                 */
/* ------------------------------------------------------------------ */

export function health(): Promise<HealthResponse> {
  return orcaRequest<HealthResponse>("/health", { timeoutMs: 15_000 });
}

export function predict(features: FeatureMap): Promise<PredictResponse> {
  return orcaRequest<PredictResponse>("/predict", { method: "POST", body: { features } });
}

export function explain(features: FeatureMap): Promise<ExplainResponse> {
  return orcaRequest<ExplainResponse>("/explain", { method: "POST", body: { features } });
}

export function recommend(features: FeatureMap): Promise<RecommendResponse> {
  return orcaRequest<RecommendResponse>("/recommend", { method: "POST", body: { features } });
}

/* ------------------------------------------------------------------ */
/* Planning economics (operator assumptions, never realized savings)   */
/* ------------------------------------------------------------------ */

export const PLANNING_DEFAULTS = {
  delay_cost_per_day: 450,
  intervention_cost: 500,
  efficacy_days: 5,
} as const;

export function planningEconomics(
  probability: number,
  severityDays: number,
  delayCostPerDay: number,
  interventionCost: number,
  efficacyDays: number,
): Omit<ScenarioEconomics, "recommendation"> {
  const severity = Math.max(severityDays, 0);
  const expected_exposure = probability * severity * delayCostPerDay;
  const expected_benefit = probability * Math.min(severity, efficacyDays) * delayCostPerDay;
  return {
    expected_exposure,
    expected_benefit,
    intervention_cost: interventionCost,
    net_benefit: expected_benefit - interventionCost,
  };
}

/* ------------------------------------------------------------------ */
/* Deterministic operational overlay (clearly labelled)                */
/* ------------------------------------------------------------------ */

function hash(seedText: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

const STATUSES = ["AT_ORIGIN", "IN_TRANSIT", "CUSTOMS", "OUT_FOR_DELIVERY"];
const PRIORITIES = ["STANDARD", "PRIORITY", "CRITICAL"];

interface Overlay {
  status: string;
  progress_pct: number;
  eta_variance_hours: number;
  customer_priority: string;
  lat: number;
  lon: number;
}

/** SYNTHETIC DEMO OVERLAY — operational placement not supplied by the backend. */
function overlay(row: OrcaSourceRow, probability: number): Overlay {
  const a = hash(`${row.id}:status`);
  const b = hash(`${row.id}:progress`);
  const c = hash(`${row.id}:geo`);
  const [lat, lon] = countryCentroid(row.country);
  return {
    status: STATUSES[Math.floor(a * STATUSES.length)]!,
    progress_pct: Math.floor(b * 100),
    eta_variance_hours: Math.round(probability * 48 * 10) / 10,
    customer_priority: PRIORITIES[Math.floor(hash(`${row.id}:prio`) * PRIORITIES.length)]!,
    lat: lat + (c - 0.5) * 3,
    lon: lon + (hash(`${row.id}:geo2`) - 0.5) * 3,
  };
}

/** Derived from MODEL OUTPUT only — no operational claim. */
function issueLabel(probability: number): string {
  if (probability > 0.85) return "Critical model risk";
  if (probability > 0.6) return "High model risk";
  if (probability >= 0.3) return "Watch — elevated model risk";
  return "Normal operations";
}

const SHIPMENT_PROVENANCE = `${PROVENANCE.real} (source row) · ${PROVENANCE.model} (risk) · ${PROVENANCE.synthetic} (position/status)`;

/* ------------------------------------------------------------------ */
/* Portfolio scoring                                                   */
/* ------------------------------------------------------------------ */

export interface ScoredRow {
  row: OrcaSourceRow;
  prediction: PredictResponse;
  recommendation: RecommendResponse;
}

export async function scorePortfolio(): Promise<ScoredRow[]> {
  const rows = sourceRows();
  return mapWithConcurrency(rows, CONCURRENCY, async (row) => {
    const [prediction, recommendation] = await Promise.all([
      predict(row.features),
      recommend(row.features),
    ]);
    return { row, prediction, recommendation };
  });
}

function toShipment(scored: ScoredRow): OrcaShipment {
  const { row, prediction, recommendation } = scored;
  const p = prediction.probability_late;
  const ov = overlay(row, p);
  const econ = planningEconomics(
    p,
    prediction.severity_p50,
    PLANNING_DEFAULTS.delay_cost_per_day,
    PLANNING_DEFAULTS.intervention_cost,
    PLANNING_DEFAULTS.efficacy_days,
  );
  const decision = (
    ["NO_ACTION", "MONITOR", "INTERVENE"].includes(recommendation.recommendation)
      ? recommendation.recommendation
      : "MONITOR"
  ) as DecisionAction;

  return {
    id: row.id,
    source_shipment_id: row.id,
    origin: row.manufacturing_site,
    destination: row.country,
    route: `${row.manufacturing_site} → ${row.country}`,
    issue: issueLabel(p),
    risk: p,
    risk_tier: prediction.risk_tier,
    severity_p50: prediction.severity_p50,
    severity_interval_90: prediction.severity_interval_90,
    eta_variance_hours: ov.eta_variance_hours,
    decision,
    expected_exposure: econ.expected_exposure,
    net_benefit: econ.net_benefit,
    status: ov.status,
    progress_pct: ov.progress_pct,
    customer_priority: ov.customer_priority,
    lat: ov.lat,
    lon: ov.lon,
    provenance: SHIPMENT_PROVENANCE,
  };
}

/** SYNTHETIC DEMO OVERLAY — the backend supplies no event feed. */
function buildEvents(shipments: OrcaShipment[]): OrcaEvent[] {
  const types: OrcaEvent["event_type"][] = ["MODEL", "POSITION", "ETA", "EXCEPTION", "DECISION"];
  const events: OrcaEvent[] = [];
  const start = 18 * 3600 + 30 * 60;
  shipments.forEach((s, i) => {
    types.forEach((typ, j) => {
      const t = start + (i * types.length + j) * 37;
      const hh = String(Math.floor(t / 3600) % 24).padStart(2, "0");
      const mm = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
      const ss = String(t % 60).padStart(2, "0");
      const detail =
        typ === "MODEL"
          ? `Model refresh: late probability ${(s.risk * 100).toFixed(1)}%`
          : typ === "DECISION"
            ? `Decision support: ${s.decision.replace(/_/g, " ")}`
            : typ === "EXCEPTION"
              ? `Simulated exception on the ${s.destination} lane`
              : typ === "ETA"
                ? `Simulated ETA variance ${s.eta_variance_hours.toFixed(1)}h`
                : `Simulated position update · ${s.destination}`;
      events.push({
        timestamp: `${hh}:${mm}:${ss}`,
        shipment_id: s.id,
        event_type: typ,
        detail,
        provenance: PROVENANCE.synthetic,
      });
    });
  });
  return events.slice(0, 30).reverse();
}

export async function composeOverview(): Promise<OverviewResponse> {
  const scored = await scorePortfolio();
  const shipments = scored.map(toShipment).sort((a, b) => b.risk - a.risk);

  const risks = shipments.map((s) => s.risk);
  const mean = risks.length ? risks.reduce((a, b) => a + b, 0) / risks.length : 0;

  const distribution: RiskDistribution = {
    low: shipments.filter((s) => s.risk <= 0.3).length,
    watch: shipments.filter((s) => s.risk > 0.3 && s.risk <= 0.6).length,
    high: shipments.filter((s) => s.risk > 0.6 && s.risk <= 0.85).length,
    critical: shipments.filter((s) => s.risk > 0.85).length,
  };

  const byCountry = new Map<string, { risk: number; shipments: number }>();
  for (const s of shipments) {
    const cur = byCountry.get(s.destination) ?? { risk: 0, shipments: 0 };
    cur.risk += s.risk;
    cur.shipments += 1;
    byCountry.set(s.destination, cur);
  }
  const top_destinations: TopDestination[] = [...byCountry.entries()]
    .map(([destination, v]) => ({
      destination,
      risk: v.risk / v.shipments,
      shipments: v.shipments,
    }))
    .sort((a, b) => b.risk - a.risk || b.shipments - a.shipments)
    .slice(0, 5);

  const modelPositive = scored.filter((s) => s.prediction.classification_decision).length;

  return {
    seed: 0,
    evidence: {
      real_data: `${PROVENANCE.real} — bundled ORCA demo source rows`,
      model_output: `${PROVENANCE.model} — /predict · /recommend`,
      simulated: `${PROVENANCE.synthetic} — position, status, event stream`,
    },
    kpis: {
      active_shipments: shipments.length,
      exceptions: shipments.filter((s) => s.risk >= 0.3).length,
      critical_exceptions: shipments.filter((s) => s.risk > 0.85).length,
      model_positive: modelPositive,
      estimated_exposure: shipments.reduce((a, s) => a + s.expected_exposure, 0),
      potential_net_benefit: shipments
        .filter((s) => s.net_benefit > 0)
        .reduce((a, s) => a + s.net_benefit, 0),
      modeled_on_time_likelihood: Math.max(0, 1 - mean),
      average_risk: mean,
    },
    priority_exceptions: shipments.slice(0, 8),
    map_points: shipments,
    risk_distribution: distribution,
    top_destinations,
    events: buildEvents(shipments),
    model_version: scored[0]?.prediction.model_version ?? "unknown",
  };
}

/* ------------------------------------------------------------------ */
/* Shipment intelligence                                               */
/* ------------------------------------------------------------------ */

export async function composeShipmentDetail(shipmentId: string): Promise<ShipmentDetailResponse> {
  const row = sourceRow(shipmentId) ?? sourceRows()[0];
  if (!row) throw new Error("No bundled ORCA source rows available.");

  const [prediction, explanation] = await Promise.all([
    predict(row.features),
    explain(row.features),
  ]);

  const p = prediction.probability_late;
  const ov = overlay(row, p);

  const drivers = explanation.shap_contributions
    .slice()
    .sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value))
    .slice(0, 8)
    .map((c) => ({
      feature: c.feature,
      shap_value: c.shap_value,
      direction: c.shap_value > 0 ? ("raises" as const) : ("reduces" as const),
    }));

  const stageIndex = Math.min(3, Math.floor((ov.progress_pct / 100) * 4));
  const timeline = ["Order placed", "Dispatched from site", "In transit", "Delivery window"].map(
    (label, i) => ({
      label: `${label} — ${PROVENANCE.synthetic}`,
      state: (i < stageIndex ? "complete" : i === stageIndex ? "active" : "pending") as
        "complete" | "active" | "pending",
    }),
  );

  return {
    display_id: row.id,
    source_shipment_id: row.id,
    origin: row.manufacturing_site,
    destination: row.country,
    route: `${row.manufacturing_site} → ${row.country}`,
    status: `${ov.status} (${PROVENANCE.synthetic})`,
    progress_pct: ov.progress_pct,
    eta_variance_hours: ov.eta_variance_hours,
    customer_priority: `${ov.customer_priority} (${PROVENANCE.synthetic})`,
    provenance: SHIPMENT_PROVENANCE,
    risk: p,
    risk_tier: prediction.risk_tier,
    severity_p50: prediction.severity_p50,
    severity_interval_90: prediction.severity_interval_90,
    model_version: prediction.model_version,
    shipment_mode: row.shipment_mode,
    vendor: row.vendor,
    fulfill_via: row.fulfill_via,
    line_item_value: row.line_item_value,
    risk_drivers: drivers,
    timeline,
    evidence_label: `${PROVENANCE.model} — /predict + /explain`,
  };
}

/** Recommendation for a bundled source row, straight from /recommend. */
export function recommendShipment(shipmentId: string): Promise<RecommendResponse> {
  const row = sourceRow(shipmentId) ?? sourceRows()[0];
  if (!row) return Promise.reject(new Error("No bundled ORCA source rows available."));
  return recommend(row.features);
}

/* ------------------------------------------------------------------ */
/* Frontend what-if scenario adapter                                   */
/* ------------------------------------------------------------------ */

type Mutation = (raw: Record<string, string>) => Record<string, string>;

interface ScenarioDefinition extends ScenarioOption {
  mutate: Mutation;
}

/**
 * Bounded scale of one numeric pre-outcome feature.
 * Exported so the simulation layer reuses the exact same safe recipes.
 */
export function scaleField(
  raw: Record<string, string>,
  field: string,
  factor: number,
  cap?: number,
) {
  const current = Number(raw[field]);
  if (!Number.isFinite(current)) return;
  const next = cap === undefined ? current * factor : Math.min(current * factor, cap);
  raw[field] = String(next);
}

const SCENARIO_DEFINITIONS: ScenarioDefinition[] = [
  {
    key: "steady_state",
    label: "Steady state (no change)",
    description: "Re-scores the unmodified real source feature row. No feature is changed.",
    event_label: "Baseline re-score",
    mutate: (raw) => ({ ...raw }),
  },
  {
    key: "vendor_reliability",
    label: "Vendor reliability degradation",
    description:
      "Raises the pre-outcome vendor historical delay signals on the real feature row, then calls /predict.",
    event_label: "Vendor performance alert",
    mutate: (raw) => {
      const next = { ...raw };
      scaleField(next, "vendor_hist_delay_rate", 1.6, 1);
      const median = Number(next["vendor_hist_delay_median"]);
      if (Number.isFinite(median)) next["vendor_hist_delay_median"] = String(median + 7);
      return next;
    },
  },
  {
    key: "lane_disruption",
    label: "Lane / destination disruption",
    description:
      "Raises pre-outcome site and destination historical delay signals and planned transit time.",
    event_label: "Destination lane disruption",
    mutate: (raw) => {
      const next = { ...raw };
      scaleField(next, "site_hist_delay_rate", 1.6, 1);
      scaleField(next, "country_hist_delay_rate", 1.75, 1);
      scaleField(next, "Scheduled_Transit_Days", 1.35);
      return next;
    },
  },
  {
    key: "transport_switch",
    label: "Transport-mode review",
    description: "Changes Shipment Mode to Air as a hypothetical pre-outcome planning input.",
    event_label: "Alternative transport mode proposed",
    mutate: (raw) => ({ ...raw, "Shipment Mode": "Air" }),
  },
];

export function scenarioOptions(): ScenarioOption[] {
  return SCENARIO_DEFINITIONS.map(({ key, label, description, event_label }) => ({
    key,
    label,
    description,
    event_label,
  }));
}

/** Human-readable before → after list for changed pre-outcome features. */
export function auditTrail(
  before: Record<string, string>,
  after: Record<string, string>,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const audit: string[] = [];
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    if (a === b) continue;
    const fmt = (v: string | undefined) => {
      if (v === undefined || v === "") return "(omitted)";
      const n = Number(v);
      return Number.isFinite(n) ? n.toFixed(4).replace(/\.?0+$/, "") : v;
    };
    audit.push(`${key}: ${fmt(a)} → ${fmt(b)}`);
  }
  return audit.sort();
}

/** Scenario mutation recipe by key — reused by the digital-twin event engine. */
export function scenarioMutation(
  key: string,
): (raw: Record<string, string>) => Record<string, string> {
  return (SCENARIO_DEFINITIONS.find((s) => s.key === key) ?? SCENARIO_DEFINITIONS[0]!).mutate;
}

export interface WhatIfInput {
  shipment_id: string;
  scenario_key: string;
  delay_cost_per_day: number;
  intervention_cost: number;
  efficacy_days: number;
  /**
   * Optional baseline override: the CURRENT pre-outcome feature state of a
   * synthetic digital-twin shipment. When omitted the bundled real source row
   * for `shipment_id` is used (the original behaviour).
   */
  baseline_raw?: Record<string, string>;
  /** Display id for the baseline override (synthetic operational id). */
  baseline_id?: string;
}

/**
 * Frontend WHAT-IF adapter — there is no /demo/scenario endpoint.
 * Baseline and scenario risk both come from real /predict calls; the
 * recommendation comes from a real /recommend call on the mutated features.
 *
 * Pure: it never mutates the baseline it was handed, so running a what-if
 * against a live simulation shipment cannot change that shipment.
 */
export async function runWhatIf(input: WhatIfInput): Promise<ScenarioRunResponse> {
  const override = input.baseline_raw;
  const row = override
    ? {
        id: input.baseline_id ?? input.shipment_id,
        raw: { ...override },
        features: rowToFeatures(override),
      }
    : (sourceRow(input.shipment_id) ?? sourceRows()[0]);
  if (!row) throw new Error("No bundled ORCA source rows available.");

  const definition =
    SCENARIO_DEFINITIONS.find((s) => s.key === input.scenario_key) ?? SCENARIO_DEFINITIONS[0]!;

  const mutatedRaw = definition.mutate(row.raw);
  const mutatedFeatures = rowToFeatures(mutatedRaw);

  const [baseline, scenario, recommendation] = await Promise.all([
    predict(row.features),
    predict(mutatedFeatures),
    recommend(mutatedFeatures),
  ]);

  const econ = planningEconomics(
    scenario.probability_late,
    scenario.severity_p50,
    input.delay_cost_per_day,
    input.intervention_cost,
    input.efficacy_days,
  );

  const decision = (
    ["NO_ACTION", "MONITOR", "INTERVENE"].includes(recommendation.recommendation)
      ? recommendation.recommendation
      : "MONITOR"
  ) as DecisionAction;

  return {
    shipment_id: row.id,
    source_shipment_id: row.id,
    scenario: definition.key,
    scenario_label: definition.label,
    baseline: {
      risk: baseline.probability_late,
      risk_tier: baseline.risk_tier ?? riskTier(baseline.probability_late),
      severity_p50: baseline.severity_p50,
    },
    result: {
      risk: scenario.probability_late,
      risk_tier: scenario.risk_tier ?? riskTier(scenario.probability_late),
      severity_p50: scenario.severity_p50,
      risk_delta_pp: (scenario.probability_late - baseline.probability_late) * 100,
    },
    economics: { ...econ, recommendation: decision },
    feature_audit: auditTrail(row.raw, mutatedRaw),
    human_approval_required: recommendation.human_approval_required,
    evidence_label: `${PROVENANCE.simulated} — /predict + /recommend on modified features`,
    disclaimer:
      "Economics are configurable planning assumptions applied to real model output — not realized savings.",
  };
}
