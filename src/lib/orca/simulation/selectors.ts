/**
 * Read-only projections of the global simulation snapshot into the shapes the
 * existing ORCA presentation components already speak.
 *
 * Provenance is preserved on every projection: a synthetic shipment with no
 * ORCA score projects `risk_tier: "UNSCORED"` and `decision: null` — never a
 * borrowed tier or a fixture value.
 *
 * Framework-agnostic: plain TypeScript.
 */

import { splitRoute } from "./geo";
import { FAMILY_LABEL, SIM_PROVENANCE, SIM_STATUS_LABEL } from "./types";
import type { LatLon, SimEvent, SimShipment, SimulationSnapshot } from "./types";
import type {
  DisplayTier,
  OrcaEvent,
  RiskDistribution,
  ShipmentRow,
  TopDestination,
} from "../types";

/* ------------------------------------------------------------------ */
/* Shipment rows                                                       */
/* ------------------------------------------------------------------ */

function issueOf(s: SimShipment): string {
  if (s.exceptionFamily) return FAMILY_LABEL[s.exceptionFamily];
  if (s.status === "DELIVERED") return "Delivered";
  if (s.model.phase === "offline") return "Model offline";
  return "No open exception";
}

export function rowFromSim(s: SimShipment): ShipmentRow {
  const scored = s.model.phase === "scored";
  return {
    id: s.id,
    // Audit link back to the REAL feature template this twin was built from.
    source_shipment_id: s.templateId,
    origin: s.origin,
    destination: s.destination,
    route: s.route,
    issue: issueOf(s),
    risk: scored ? (s.model.risk ?? 0) : 0,
    risk_tier: s.model.tier,
    severity_p50: scored ? (s.model.severity_p50 ?? 0) : 0,
    severity_interval_90: s.model.severity_interval_90 ?? [0, 0],
    eta_variance_hours: s.etaVarianceHours,
    decision: s.model.recommendation?.action ?? null,
    // Economics are not claimed for synthetic operations.
    expected_exposure: 0,
    net_benefit: 0,
    status: `${SIM_STATUS_LABEL[s.status]} · ${Math.round(s.progress * 100)}%`,
    progress_pct: Math.round(s.progress * 100),
    customer_priority: s.productGroup || "—",
    lat: s.position[0],
    lon: s.position[1],
    provenance: scored
      ? `${SIM_PROVENANCE.twin} · risk ${SIM_PROVENANCE.model}`
      : `${SIM_PROVENANCE.twin} · ${SIM_PROVENANCE.unscored}`,
  };
}

export function simRows(snapshot: SimulationSnapshot): ShipmentRow[] {
  return snapshot.active.map(rowFromSim);
}

export function simDeliveredRows(snapshot: SimulationSnapshot): ShipmentRow[] {
  return snapshot.recentlyDelivered.map(rowFromSim);
}

/** Highest model risk first; unscored shipments sort last. */
export function byRiskDesc(rows: ShipmentRow[]): ShipmentRow[] {
  return [...rows].sort((a, b) => {
    const au = a.risk_tier === "UNSCORED" ? 1 : 0;
    const bu = b.risk_tier === "UNSCORED" ? 1 : 0;
    if (au !== bu) return au - bu;
    return b.risk - a.risk;
  });
}

export function findSim(snapshot: SimulationSnapshot, id: string | null): SimShipment | null {
  if (!id) return null;
  return (
    snapshot.active.find((s) => s.id === id) ??
    snapshot.recentlyDelivered.find((s) => s.id === id) ??
    null
  );
}

/* ------------------------------------------------------------------ */
/* Events                                                             */
/* ------------------------------------------------------------------ */

export type SimStreamEvent = OrcaEvent & { ops_label?: string };

export function eventToStream(event: SimEvent): SimStreamEvent {
  return {
    timestamp: event.clock,
    shipment_id: event.shipmentId,
    event_type: event.eventType,
    detail: event.detail,
    provenance: event.provenance,
    ops_label: FAMILY_LABEL[event.family].toUpperCase(),
  };
}

export function simStreamEvents(snapshot: SimulationSnapshot): SimStreamEvent[] {
  return snapshot.events.map(eventToStream);
}

export function eventsForShipment(snapshot: SimulationSnapshot, id: string | null): SimEvent[] {
  if (!id) return [];
  return snapshot.events.filter((e) => e.shipmentId === id);
}

/* ------------------------------------------------------------------ */
/* Aggregates — run scope only                                         */
/* ------------------------------------------------------------------ */

export interface SimKpis {
  active: number;
  inTransit: number;
  atRisk: number;
  critical: number;
  deliveredSession: number;
  openExceptions: number;
  modelScored: number;
  modelUnscored: number;
  modelPositive: number;
  averageRisk: number | null;
}

/** True once the model has scored the shipment above /predict's own threshold. */
function isModelPositive(s: SimShipment): boolean {
  return s.model.phase === "scored" && s.model.classification_decision === true;
}

export function simKpis(snapshot: SimulationSnapshot): SimKpis {
  const active = snapshot.active;
  const scored = active.filter((s) => s.model.phase === "scored");
  const risks = scored.map((s) => s.model.risk ?? 0);
  return {
    active: active.length,
    inTransit: active.filter((s) => s.status === "IN_TRANSIT" || s.status === "FINAL_MILE").length,
    atRisk: scored.filter((s) => s.model.tier === "HIGH_RISK" || s.model.tier === "CRITICAL")
      .length,
    critical: scored.filter((s) => s.model.tier === "CRITICAL").length,
    deliveredSession: snapshot.metrics.delivered,
    openExceptions: active.filter((s) => s.exceptionOpen).length,
    modelScored: scored.length,
    modelUnscored: active.length - scored.length,
    modelPositive: active.filter(isModelPositive).length,
    averageRisk: risks.length > 0 ? risks.reduce((a, b) => a + b, 0) / risks.length : null,
  };
}

export function simRiskDistribution(
  snapshot: SimulationSnapshot,
): RiskDistribution & { unscored: number } {
  const dist = { low: 0, watch: 0, high: 0, critical: 0, unscored: 0 };
  for (const s of snapshot.active) {
    const tier: DisplayTier = s.model.tier;
    if (tier === "LOW_RISK") dist.low += 1;
    else if (tier === "WATCH") dist.watch += 1;
    else if (tier === "HIGH_RISK") dist.high += 1;
    else if (tier === "CRITICAL") dist.critical += 1;
    else dist.unscored += 1;
  }
  return dist;
}

/** Mean MODEL risk by destination across the scored active population. */
export function simTopDestinations(snapshot: SimulationSnapshot, limit = 6): TopDestination[] {
  const groups = new Map<string, number[]>();
  for (const s of snapshot.active) {
    if (s.model.phase !== "scored" || s.model.risk === null) continue;
    const list = groups.get(s.destination) ?? [];
    list.push(s.model.risk);
    groups.set(s.destination, list);
  }
  return [...groups.entries()]
    .map(([destination, risks]) => ({
      destination,
      risk: risks.reduce((a, b) => a + b, 0) / risks.length,
      shipments: risks.length,
    }))
    .sort((a, b) => b.risk - a.risk)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Exceptions                                                          */
/* ------------------------------------------------------------------ */

export interface SimException {
  shipment: SimShipment;
  row: ShipmentRow;
  trigger: string;
  triggerLabel: string;
  riskBefore: number | null;
  riskAfter: number | null;
  latestEvent: SimEvent | null;
}

/**
 * Current exceptions derived from the SAME global state: an exception is an open
 * synthetic exception event, or a model score at HIGH/CRITICAL tier.
 */
export function simExceptions(snapshot: SimulationSnapshot): SimException[] {
  const latestByShipment = new Map<string, SimEvent>();
  for (const event of snapshot.events) {
    if (!latestByShipment.has(event.shipmentId)) latestByShipment.set(event.shipmentId, event);
  }

  return snapshot.active
    .filter(
      (s) =>
        s.exceptionOpen ||
        s.model.tier === "HIGH_RISK" ||
        s.model.tier === "CRITICAL" ||
        s.model.phase === "offline",
    )
    .map((s) => ({
      shipment: s,
      row: rowFromSim(s),
      trigger: s.exceptionFamily ?? (s.model.phase === "offline" ? "MODEL_OFFLINE" : "MODEL_SCORE"),
      triggerLabel: s.exceptionFamily
        ? FAMILY_LABEL[s.exceptionFamily]
        : s.model.phase === "offline"
          ? "Model offline"
          : "Model risk threshold",
      riskBefore: s.model.previousRisk,
      riskAfter: s.model.risk,
      latestEvent: latestByShipment.get(s.id) ?? null,
    }))
    .sort((a, b) => (b.riskAfter ?? -1) - (a.riskAfter ?? -1));
}

/* ------------------------------------------------------------------ */
/* Map geometry                                                        */
/* ------------------------------------------------------------------ */

export interface SimRouteGeometry {
  id: string;
  tier: DisplayTier;
  travelled: LatLon[];
  remaining: LatLon[];
  delivered: boolean;
}

/** Route polylines for the map: travelled vs remaining, per active shipment. */
export function simRoutes(snapshot: SimulationSnapshot): SimRouteGeometry[] {
  return snapshot.active.map((s) => {
    const { travelled, remaining } = splitRoute(s.waypoints, s.progress);
    return {
      id: s.id,
      tier: s.model.tier,
      travelled,
      remaining,
      delivered: s.status === "DELIVERED",
    };
  });
}
