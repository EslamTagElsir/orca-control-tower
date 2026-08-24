/**
 * Randomized run-plan generator for the 5-minute Live Operations Demo.
 *
 * PROVENANCE — everything produced here is SYNTHETIC LIVE OPERATIONS:
 * statuses, positions, progress, ETA movement, event sequencing and all
 * exception / recovery / delivery narrative. It never reads or writes model
 * output. `probability_late`, `risk_tier`, `severity`, SHAP and
 * recommendations are consumed read-only, purely to decide WHICH shipment gets
 * a more serious synthetic story.
 *
 * The plan is a pure function of (portfolio, seed): one Start/Restart = one
 * seed = one reproducible run. Framework-agnostic plain TypeScript.
 */

import type { EventType, OrcaShipment } from "./types";
import { makeRng, runIdFromSeed, type Rng } from "./prng";

export const LIVE_OPS_PROVENANCE = "SYNTHETIC LIVE OPERATIONS";
export const LIVE_OPS_DURATION_SEC = 300;
/** Hard cap on what the demo reports as "Events Processed" for one run. */
export const MAX_TIMELINE_EVENTS = 45;

export type ScenarioFamily =
  | "DISPATCH"
  | "ORIGIN_HANDLING"
  | "IN_TRANSIT"
  | "CARRIER_DELAY"
  | "CUSTOMS_HOLD"
  | "PORT_CONGESTION"
  | "ROUTE_DISRUPTION"
  | "WEATHER_DELAY"
  | "ETA_SLIP"
  | "DELIVERY_WINDOW"
  | "MODE_INTERVENTION"
  | "FINAL_MILE"
  | "RECOVERY"
  | "DELIVERED"
  | "MODEL_SCENARIO";

export const FAMILY_LABEL: Record<ScenarioFamily, string> = {
  DISPATCH: "Dispatch",
  ORIGIN_HANDLING: "Origin Handling",
  IN_TRANSIT: "In Transit",
  CARRIER_DELAY: "Carrier Delay",
  CUSTOMS_HOLD: "Customs",
  PORT_CONGESTION: "Port Congestion",
  ROUTE_DISRUPTION: "Route Disruption",
  WEATHER_DELAY: "Weather Delay",
  ETA_SLIP: "ETA Slip",
  DELIVERY_WINDOW: "Delivery Window",
  MODE_INTERVENTION: "Mode Intervention",
  FINAL_MILE: "Final Mile",
  RECOVERY: "Recovery",
  DELIVERED: "Delivered",
  MODEL_SCENARIO: "Model What-If",
};

const FAMILY_EVENT_TYPE: Record<ScenarioFamily, EventType> = {
  DISPATCH: "POSITION",
  ORIGIN_HANDLING: "EXCEPTION",
  IN_TRANSIT: "POSITION",
  CARRIER_DELAY: "EXCEPTION",
  CUSTOMS_HOLD: "EXCEPTION",
  PORT_CONGESTION: "EXCEPTION",
  ROUTE_DISRUPTION: "EXCEPTION",
  WEATHER_DELAY: "EXCEPTION",
  ETA_SLIP: "ETA",
  DELIVERY_WINDOW: "ETA",
  MODE_INTERVENTION: "DECISION",
  FINAL_MILE: "POSITION",
  RECOVERY: "DECISION",
  DELIVERED: "DECISION",
  MODEL_SCENARIO: "MODEL",
};

export function familyEventType(family: ScenarioFamily): EventType {
  return FAMILY_EVENT_TYPE[family];
}

export interface ScheduleEntry {
  /** Seconds into the run. */
  at: number;
  family: ScenarioFamily;
  shipmentId: string;
  detail: string;
  status?: string;
  progress?: number;
  etaDelta?: number;
  /** Marks the shipment as carrying an open synthetic exception. */
  opensException?: boolean;
  /** Clears an open synthetic exception. */
  clearsException?: boolean;
}

export interface WhatIfPick {
  at: number;
  shipmentId: string;
  scenarioKey: string;
}

export interface LiveOpsRunPlan {
  seed: number;
  runId: string;
  castIds: string[];
  schedule: ScheduleEntry[];
  whatIfs: WhatIfPick[];
  /** Scenario families used this run, with counts, ordered by frequency. */
  mix: { family: ScenarioFamily; count: number }[];
}

const SERIOUS_FAMILIES: { item: ScenarioFamily; weight: number }[] = [
  { item: "CUSTOMS_HOLD", weight: 3 },
  { item: "PORT_CONGESTION", weight: 2 },
  { item: "ROUTE_DISRUPTION", weight: 2 },
  { item: "CARRIER_DELAY", weight: 3 },
  { item: "WEATHER_DELAY", weight: 2 },
  { item: "ORIGIN_HANDLING", weight: 1 },
];

const MILD_FAMILIES: { item: ScenarioFamily; weight: number }[] = [
  { item: "CARRIER_DELAY", weight: 2 },
  { item: "ETA_SLIP", weight: 3 },
  { item: "WEATHER_DELAY", weight: 2 },
  { item: "ORIGIN_HANDLING", weight: 2 },
  { item: "FINAL_MILE", weight: 2 },
];

const WHAT_IF_SCENARIOS = ["vendor_reliability", "lane_disruption", "transport_switch"] as const;

const STATUS_BY_FAMILY: Partial<Record<ScenarioFamily, string>> = {
  CUSTOMS_HOLD: "CUSTOMS_HOLD",
  PORT_CONGESTION: "PORT_CONGESTION",
  ROUTE_DISRUPTION: "REROUTING",
  CARRIER_DELAY: "CARRIER_DELAY",
  WEATHER_DELAY: "WEATHER_DELAY",
  ORIGIN_HANDLING: "AT_ORIGIN",
  ETA_SLIP: "IN_TRANSIT",
};

function exceptionDetail(family: ScenarioFamily, s: OrcaShipment, rng: Rng): string {
  switch (family) {
    case "CUSTOMS_HOLD":
      return `Customs hold at ${s.destination} — clearance documents under review`;
    case "PORT_CONGESTION":
      return `Port congestion on ${s.route} — berth queue ${rng.int(2, 9)} vessels deep`;
    case "ROUTE_DISRUPTION":
      return `Route disruption reported on ${s.route} — alternate leg under evaluation`;
    case "CARRIER_DELAY":
      return `Carrier reported delay on ${s.route} — equipment shortfall at transfer hub`;
    case "WEATHER_DELAY":
      return `Weather-related operational delay logged on ${s.route} (synthetic ops event)`;
    case "ORIGIN_HANDLING":
      return `Supplier handling delay at ${s.origin} — pickup window missed`;
    case "ETA_SLIP":
      return `ETA slipped on ${s.route} — carrier milestone missed`;
    case "FINAL_MILE":
      return `Final-mile delay near ${s.destination} — local capacity constrained`;
    default:
      return `Operational exception on ${s.route}`;
  }
}

function recoveryDetail(family: ScenarioFamily, s: OrcaShipment, rng: Rng): string {
  switch (family) {
    case "CUSTOMS_HOLD":
      return `Customs cleared at ${s.destination} — shipment released to final leg`;
    case "PORT_CONGESTION":
      return `Berth allocated on ${s.route} — discharge underway`;
    case "ROUTE_DISRUPTION":
      return `Rerouted via alternate leg on ${s.route} — movement resumed`;
    case "CARRIER_DELAY":
      return `Carrier recovered ${rng.int(1, 6)}h on ${s.route} — schedule restored`;
    case "WEATHER_DELAY":
      return `Weather restriction lifted on ${s.route} — transit resumed`;
    case "ORIGIN_HANDLING":
      return `Pickup completed at ${s.origin} — handed to line-haul carrier`;
    default:
      return `Recovery confirmed on ${s.route}`;
  }
}

/** Diverse cast selection across destination / origin / mode-ish keys. */
function selectCast(shipments: OrcaShipment[], rng: Rng): OrcaShipment[] {
  const target = Math.max(1, Math.min(16, Math.max(8, Math.round(shipments.length * 0.45))));
  if (shipments.length <= target) return rng.shuffle(shipments);

  const pool = rng.shuffle(shipments);
  const seenLane = new Set<string>();
  const seenDest = new Set<string>();
  const chosen: OrcaShipment[] = [];

  for (const s of pool) {
    if (chosen.length >= target) break;
    const lane = `${s.origin}→${s.destination}`;
    if (seenLane.has(lane)) continue;
    seenLane.add(lane);
    seenDest.add(s.destination);
    chosen.push(s);
  }
  for (const s of pool) {
    if (chosen.length >= target) break;
    if (chosen.includes(s)) continue;
    chosen.push(s);
  }
  return chosen;
}

const clampSec = (t: number) => Math.max(0, Math.min(LIVE_OPS_DURATION_SEC - 2, Math.round(t)));

/**
 * Builds one randomized 5-minute run plan. Same (shipments, seed) always
 * yields the same plan.
 */
export function buildRunPlan(shipments: OrcaShipment[], seed: number): LiveOpsRunPlan {
  const runId = runIdFromSeed(seed);
  if (shipments.length === 0) {
    return { seed, runId, castIds: [], schedule: [], whatIfs: [], mix: [] };
  }

  const rng = makeRng(seed);
  const cast = selectCast(shipments, rng);
  const entries: ScheduleEntry[] = [];

  entries.push({
    at: 0,
    family: "DISPATCH",
    shipmentId: cast[0]!.id,
    detail: `Operations desk online — run ${runId} monitoring ${cast.length} of ${shipments.length} scored shipments`,
  });

  const riskOrder = [...cast].sort((a, b) => b.risk - a.risk);
  const seriousCount = Math.max(1, Math.round(cast.length * rng.float(0.25, 0.45)));
  const seriousIds = new Set(riskOrder.slice(0, seriousCount).map((s) => s.id));

  const deliveredIds: string[] = [];
  const openExceptionIds = new Set<string>();

  cast.forEach((s, index) => {
    const depart = clampSec(rng.int(4, 44) + index);
    const startsInTransit = rng.chance(0.35);

    entries.push({
      at: depart,
      family: startsInTransit ? "IN_TRANSIT" : "DISPATCH",
      shipmentId: s.id,
      detail: startsInTransit
        ? `In-transit position refresh on ${s.route}`
        : `Departed ${s.origin} — in transit to ${s.destination}`,
      status: "IN_TRANSIT",
      progress: Math.max(s.progress_pct, rng.int(12, 28)),
    });

    // 1–2 mid-transit position/ETA refreshes.
    const refreshes = rng.int(1, 2);
    for (let i = 0; i < refreshes; i++) {
      const at = clampSec(rng.int(depart + 25, 205));
      const drift = rng.chance(0.45);
      entries.push({
        at,
        family: drift ? "ETA_SLIP" : "IN_TRANSIT",
        shipmentId: s.id,
        detail: drift
          ? `Carrier ETA revised on ${s.route}`
          : `Position update on ${s.route} — ${rng.int(2, 9)} milestones scanned`,
        status: "IN_TRANSIT",
        progress: Math.min(92, Math.max(s.progress_pct, 30 + Math.round((at / 300) * 45))),
        ...(drift ? { etaDelta: rng.float(-1.5, 3) } : {}),
      });
    }

    const serious = seriousIds.has(s.id);
    const hasException = serious ? rng.chance(0.9) : rng.chance(0.4);
    let exceptionAt = 0;
    let family: ScenarioFamily | null = null;

    if (hasException) {
      family = rng.weighted(serious ? SERIOUS_FAMILIES : MILD_FAMILIES);
      exceptionAt = clampSec(serious ? rng.int(95, 205) : rng.int(55, 175));
      const status = STATUS_BY_FAMILY[family];
      entries.push({
        at: exceptionAt,
        family,
        shipmentId: s.id,
        detail: exceptionDetail(family, s, rng),
        ...(status ? { status } : {}),
        etaDelta: serious ? rng.float(4, 14) : rng.float(1, 5),
        opensException: true,
      });
      openExceptionIds.add(s.id);
    }

    const recovers = hasException && rng.chance(serious ? 0.55 : 0.75);
    let recoverAt = 0;
    if (recovers && family) {
      recoverAt = clampSec(Math.min(272, exceptionAt + rng.int(35, 80)));
      if (rng.chance(0.35)) {
        entries.push({
          at: clampSec(recoverAt - rng.int(8, 18)),
          family: "MODE_INTERVENTION",
          shipmentId: s.id,
          detail: `Intervention proposed on ${s.route} — expedited leg evaluated by ops desk`,
        });
      }
      entries.push({
        at: recoverAt,
        family: "RECOVERY",
        shipmentId: s.id,
        detail: recoveryDetail(family, s, rng),
        status: "IN_TRANSIT",
        progress: Math.max(70, 60 + rng.int(0, 25)),
        etaDelta: -rng.float(1, 6),
        clearsException: true,
      });
      openExceptionIds.delete(s.id);
    }

    const canDeliver = !hasException || recovers;
    const delivers = canDeliver && rng.chance(0.5);
    if (delivers) {
      const windowAt = clampSec(Math.max(recoverAt + 8, rng.int(205, 250)));
      const deliveredAt = clampSec(Math.max(windowAt + 10, rng.int(245, 296)));
      entries.push({
        at: windowAt,
        family: "DELIVERY_WINDOW",
        shipmentId: s.id,
        detail: `Delivery window confirmed at ${s.destination}`,
        status: "OUT_FOR_DELIVERY",
        progress: 88,
      });
      entries.push({
        at: clampSec(deliveredAt - rng.int(4, 9)),
        family: "FINAL_MILE",
        shipmentId: s.id,
        detail: `Final-mile position update near ${s.destination}`,
        status: "OUT_FOR_DELIVERY",
        progress: 95,
      });
      entries.push({
        at: deliveredAt,
        family: "DELIVERED",
        shipmentId: s.id,
        detail: `Delivered at ${s.destination} — proof of delivery captured`,
        status: "DELIVERED",
        progress: 100,
      });
      deliveredIds.push(s.id);
    }
  });

  // Guarantees for a compelling closing state.
  if (deliveredIds.length === 0) {
    const candidate = cast.find((s) => !openExceptionIds.has(s.id)) ?? cast[0]!;
    entries.push({
      at: 252,
      family: "DELIVERY_WINDOW",
      shipmentId: candidate.id,
      detail: `Delivery window confirmed at ${candidate.destination}`,
      status: "OUT_FOR_DELIVERY",
      progress: 90,
    });
    entries.push({
      at: 278,
      family: "DELIVERED",
      shipmentId: candidate.id,
      detail: `Delivered at ${candidate.destination} — proof of delivery captured`,
      status: "DELIVERED",
      progress: 100,
    });
    deliveredIds.push(candidate.id);
  }

  const stillMoving = cast.filter((s) => !deliveredIds.includes(s.id));
  if (stillMoving.length === 0 && cast.length > 1) {
    // Never deliver the entire cast: keep the last one running.
    const keep = cast[cast.length - 1]!;
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i]!;
      if (
        e.shipmentId === keep.id &&
        (e.family === "DELIVERED" || e.family === "DELIVERY_WINDOW")
      ) {
        entries.splice(i, 1);
      }
    }
    deliveredIds.splice(deliveredIds.indexOf(keep.id), 1);
  }

  if (openExceptionIds.size === 0) {
    const target =
      [...cast].filter((s) => !deliveredIds.includes(s.id)).sort((a, b) => b.risk - a.risk)[0] ??
      null;
    if (target) {
      entries.push({
        at: 232,
        family: "CARRIER_DELAY",
        shipmentId: target.id,
        detail: `Unresolved carrier delay on ${target.route} — escalation raised to ops desk`,
        status: "CARRIER_DELAY",
        etaDelta: 6,
        opensException: true,
      });
      openExceptionIds.add(target.id);
    }
  }

  // Late escalation on one still-open exception for a strong closing state.
  const openList = [...openExceptionIds];
  if (openList.length > 0) {
    const escalateId = rng.pick(openList);
    const s = cast.find((c) => c.id === escalateId)!;
    entries.push({
      at: 288,
      family: "ETA_SLIP",
      shipmentId: s.id,
      detail: `Exception still open on ${s.route} — escalation pending at handover`,
      etaDelta: rng.float(1, 4),
    });
  }

  // WHAT-IF model re-scores (skipped at runtime when the backend is offline).
  const whatIfCount = rng.int(1, 3);
  const whatIfPool = rng.shuffle(riskOrder.slice(0, Math.max(3, Math.min(6, cast.length))));
  const whatIfs: WhatIfPick[] = whatIfPool.slice(0, whatIfCount).map((s, i) => ({
    at: clampSec(rng.int(120, 200) + i * 12),
    shipmentId: s.id,
    scenarioKey: rng.pick(WHAT_IF_SCENARIOS),
  }));

  // Deterministic sort, then trim to a live-but-not-chaotic event budget.
  // Slots are reserved for the planned what-if result events so that the final
  // merged timeline can never exceed MAX_TIMELINE_EVENTS.
  entries.sort((a, b) => a.at - b.at || a.shipmentId.localeCompare(b.shipmentId));
  const synthBudget = Math.max(1, MAX_TIMELINE_EVENTS - whatIfs.length);
  let schedule = entries;
  if (schedule.length > synthBudget) {
    const droppable = new Set<ScenarioFamily>(["IN_TRANSIT", "ETA_SLIP", "FINAL_MILE"]);
    // Pass 1: thin out non-essential motion, newest-first.
    let over = schedule.length - synthBudget;
    const keep: ScheduleEntry[] = [];
    for (let i = schedule.length - 1; i >= 0; i--) {
      const e = schedule[i]!;
      if (over > 0 && droppable.has(e.family)) {
        over -= 1;
        continue;
      }
      keep.unshift(e);
    }
    schedule = keep;
    // Pass 2: hard cap — never report more than the budget. Essential
    // guarantees (DELIVERED / open exception / escalation) sit late in the
    // run, so trim from the earliest low-signal entries first.
    if (schedule.length > synthBudget) {
      const essential = new Set<ScenarioFamily>([
        "DELIVERED",
        "DELIVERY_WINDOW",
        "RECOVERY",
        "MODE_INTERVENTION",
      ]);
      const trimmed: ScheduleEntry[] = [];
      let stillOver = schedule.length - synthBudget;
      for (const e of schedule) {
        if (stillOver > 0 && !essential.has(e.family) && !e.opensException && e.at > 0) {
          stillOver -= 1;
          continue;
        }
        trimmed.push(e);
      }
      schedule = trimmed.slice(0, synthBudget);
    }
  }

  const counts = new Map<ScenarioFamily, number>();
  for (const e of schedule) counts.set(e.family, (counts.get(e.family) ?? 0) + 1);
  const mix = [...counts.entries()]
    .map(([family, count]) => ({ family, count }))
    .sort(
      (a, b) => b.count - a.count || FAMILY_LABEL[a.family].localeCompare(FAMILY_LABEL[b.family]),
    );

  return { seed, runId, castIds: cast.map((s) => s.id), schedule, whatIfs, mix };
}
