/**
 * 5-minute Live Operations Demo.
 *
 * Presentation-only. This module never touches the ORCA model/client/adapter
 * layer: it consumes the already-scored portfolio read-only and produces
 * SYNTHETIC LIVE OPERATIONS motion (status, progress, ETA drift, event feed)
 * on top of it. Model outputs — probability_late, severity, tier, SHAP and
 * recommendations — are never mutated here.
 *
 * The schedule is deterministic (derived from the existing shipment IDs) and
 * the whole visible state is a pure function of elapsed wall-clock time, so a
 * throttled tab cannot make the demo drift: it simply re-derives on the next
 * tick.
 *
 * Framework-agnostic apart from the React hook at the bottom.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EventType, OrcaEvent, OrcaShipment } from "@/lib/orca/types";

export const LIVE_OPS_PROVENANCE = "SYNTHETIC LIVE OPERATIONS";

export const LIVE_OPS_DURATION_MS = 5 * 60_000;

export type LiveOpsPhase = "idle" | "running" | "paused" | "complete";

export type LiveOpsAction =
  | "OPERATIONS STARTED"
  | "DEPARTED ORIGIN"
  | "POSITION UPDATE"
  | "ETA UPDATE"
  | "CUSTOMS EXCEPTION"
  | "DELIVERY WINDOW UPDATED"
  | "DELIVERED";

/** An `OrcaEvent` carrying the operational action label for presentation. */
export interface LiveOpsEvent extends OrcaEvent {
  ops_label: LiveOpsAction;
  /** Seconds into the demo, used as a stable key. */
  at: number;
}

export interface LiveOpsShipmentState {
  status: string;
  progress_pct: number;
  eta_variance_hours: number;
  delivered: boolean;
}

export interface LiveOpsSummary {
  active: number;
  in_transit: number;
  at_risk: number;
  delivered: number;
  critical: number;
  events_processed: number;
}

interface ScheduleEntry {
  at: number;
  action: LiveOpsAction;
  shipmentId: string;
  detail: string;
  status?: string;
  progress?: number;
  etaDelta?: number;
}

const EVENT_TYPE: Record<LiveOpsAction, EventType> = {
  "OPERATIONS STARTED": "DECISION",
  "DEPARTED ORIGIN": "POSITION",
  "POSITION UPDATE": "POSITION",
  "ETA UPDATE": "ETA",
  "CUSTOMS EXCEPTION": "EXCEPTION",
  "DELIVERY WINDOW UPDATED": "ETA",
  DELIVERED: "DECISION",
};

/* ------------------------------------------------------------------ */
/* Deterministic schedule                                              */
/* ------------------------------------------------------------------ */

/**
 * Builds the fixed 5-minute schedule from the current portfolio. Same input
 * order in, same schedule out — no randomness anywhere.
 */
export function buildLiveOpsSchedule(shipments: OrcaShipment[]): ScheduleEntry[] {
  if (shipments.length === 0) return [];

  const pick = (i: number) => shipments[i % shipments.length]!;
  // Riskiest shipment carries the customs exception and never gets delivered.
  const riskiest = [...shipments].sort((a, b) => b.risk - a.risk)[0]!;
  const deliverable = shipments.filter((s) => s.id !== riskiest.id);
  const firstDelivery = deliverable[0] ?? riskiest;
  const secondDelivery = deliverable[1] ?? firstDelivery;

  const entries: ScheduleEntry[] = [];
  const push = (e: ScheduleEntry) => entries.push(e);

  // 0–30s — operations start, refresh existing positions.
  push({
    at: 0,
    action: "OPERATIONS STARTED",
    shipmentId: pick(0).id,
    detail: `Operations desk online — monitoring ${shipments.length} scored shipments`,
  });
  [6, 12, 18, 24].forEach((at, i) => {
    const s = pick(i);
    push({
      at,
      action: "POSITION UPDATE",
      shipmentId: s.id,
      detail: `Position refresh near ${s.origin}`,
      status: "AT_ORIGIN",
      progress: Math.max(s.progress_pct, 5 + i),
    });
  });

  // 30–90s — departures and in-transit motion.
  [32, 44, 56, 68].forEach((at, i) => {
    const s = pick(i);
    push({
      at,
      action: "DEPARTED ORIGIN",
      shipmentId: s.id,
      detail: `Departed ${s.origin} — in transit to ${s.destination}`,
      status: "IN_TRANSIT",
      progress: Math.max(s.progress_pct, 20 + i * 2),
    });
  });
  [76, 84].forEach((at, i) => {
    const s = pick(i + 4);
    push({
      at,
      action: "POSITION UPDATE",
      shipmentId: s.id,
      detail: `In-transit position update on ${s.route}`,
      status: "IN_TRANSIT",
      progress: Math.max(s.progress_pct, 30 + i * 3),
    });
  });

  // 90–180s — customs exception on an already elevated-risk shipment + ETA drift.
  push({
    at: 96,
    action: "CUSTOMS EXCEPTION",
    shipmentId: riskiest.id,
    detail: `Customs hold at ${riskiest.destination} — clearance documents under review`,
    status: "CUSTOMS_HOLD",
    etaDelta: 9,
  });
  [110, 130, 150, 170].forEach((at, i) => {
    const s = pick(i);
    push({
      at,
      action: "ETA UPDATE",
      shipmentId: s.id,
      detail: `Carrier ETA revised on ${s.route}`,
      status: "IN_TRANSIT",
      progress: Math.max(s.progress_pct, 45 + i * 3),
      etaDelta: i % 2 === 0 ? 1.5 : -1,
    });
  });

  // 180–240s — approach to delivery, one shipment stays in transit.
  push({
    at: 186,
    action: "DELIVERY WINDOW UPDATED",
    shipmentId: firstDelivery.id,
    detail: `Delivery window confirmed at ${firstDelivery.destination}`,
    status: "OUT_FOR_DELIVERY",
    progress: 88,
  });
  push({
    at: 200,
    action: "DELIVERY WINDOW UPDATED",
    shipmentId: secondDelivery.id,
    detail: `Delivery window proposed at ${secondDelivery.destination}`,
    status: "OUT_FOR_DELIVERY",
    progress: 80,
  });
  push({
    at: 215,
    action: "POSITION UPDATE",
    shipmentId: riskiest.id,
    detail: `Still held in customs at ${riskiest.destination} — no movement`,
    status: "CUSTOMS_HOLD",
  });
  push({
    at: 230,
    action: "POSITION UPDATE",
    shipmentId: firstDelivery.id,
    detail: `Final-mile position update near ${firstDelivery.destination}`,
    status: "OUT_FOR_DELIVERY",
    progress: 94,
  });

  // 240–300s — one delivery lands, at-risk shipment remains open.
  push({
    at: 250,
    action: "DELIVERED",
    shipmentId: firstDelivery.id,
    detail: `Delivered at ${firstDelivery.destination} — proof of delivery captured`,
    status: "DELIVERED",
    progress: 100,
  });
  push({
    at: 268,
    action: "ETA UPDATE",
    shipmentId: secondDelivery.id,
    detail: `Delivery attempt rescheduled at ${secondDelivery.destination}`,
    status: "OUT_FOR_DELIVERY",
    progress: 96,
    etaDelta: 2,
  });
  push({
    at: 288,
    action: "CUSTOMS EXCEPTION",
    shipmentId: riskiest.id,
    detail: `Customs clearance still pending at ${riskiest.destination} — escalation raised`,
    status: "CUSTOMS_HOLD",
    etaDelta: 4,
  });

  return entries.sort((a, b) => a.at - b.at);
}

function clockLabel(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("en-GB", { hour12: false });
}

/** Pure projection of the demo at `elapsedMs`. */
export function projectLiveOps(
  schedule: ScheduleEntry[],
  shipments: OrcaShipment[],
  elapsedMs: number,
  startedAtMs: number,
): { events: LiveOpsEvent[]; stateById: Map<string, LiveOpsShipmentState> } {
  const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const stateById = new Map<string, LiveOpsShipmentState>();
  const events: LiveOpsEvent[] = [];

  for (const entry of schedule) {
    if (entry.at > elapsedSec) break;

    const base = shipments.find((s) => s.id === entry.shipmentId);
    const current = stateById.get(entry.shipmentId) ?? {
      status: base?.status ?? "IN_TRANSIT",
      progress_pct: base?.progress_pct ?? 0,
      eta_variance_hours: base?.eta_variance_hours ?? 0,
      delivered: false,
    };

    const next: LiveOpsShipmentState = {
      status: entry.status ?? current.status,
      progress_pct: Math.min(100, Math.max(current.progress_pct, entry.progress ?? 0)),
      eta_variance_hours: current.eta_variance_hours + (entry.etaDelta ?? 0),
      delivered: current.delivered || entry.status === "DELIVERED",
    };
    stateById.set(entry.shipmentId, next);

    events.push({
      at: entry.at,
      ops_label: entry.action,
      timestamp: clockLabel(startedAtMs + entry.at * 1000),
      shipment_id: entry.shipmentId,
      event_type: EVENT_TYPE[entry.action],
      detail: entry.detail,
      provenance: LIVE_OPS_PROVENANCE,
    });
  }

  return { events, stateById };
}

export function summariseLiveOps(
  shipments: OrcaShipment[],
  stateById: Map<string, LiveOpsShipmentState>,
  eventCount: number,
): LiveOpsSummary {
  let delivered = 0;
  let inTransit = 0;
  for (const s of shipments) {
    const st = stateById.get(s.id);
    if (st?.delivered) delivered += 1;
    else if (st) inTransit += 1;
  }
  return {
    active: shipments.length,
    in_transit: inTransit,
    at_risk: shipments.filter((s) => s.risk >= 0.3).length,
    delivered,
    critical: shipments.filter((s) => s.risk > 0.85).length,
    events_processed: eventCount,
  };
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

const SESSION_KEY = "orca.live-ops-demo";

interface Clock {
  phase: LiveOpsPhase;
  startedAt: number;
  /** Total paused time already accumulated, in ms. */
  pausedMs: number;
  /** Epoch of the current pause, when paused. */
  pausedAt: number | null;
}

const IDLE_CLOCK: Clock = { phase: "idle", startedAt: 0, pausedMs: 0, pausedAt: null };

function readSession(): Clock | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Clock>;
    if (!parsed || typeof parsed.startedAt !== "number" || !parsed.phase) return null;
    return {
      phase: parsed.phase,
      startedAt: parsed.startedAt,
      pausedMs: typeof parsed.pausedMs === "number" ? parsed.pausedMs : 0,
      pausedAt: typeof parsed.pausedAt === "number" ? parsed.pausedAt : null,
    };
  } catch {
    return null;
  }
}

function writeSession(clock: Clock): void {
  if (typeof window === "undefined") return;
  try {
    if (clock.phase === "idle") window.sessionStorage.removeItem(SESSION_KEY);
    else window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(clock));
  } catch {
    /* session storage unavailable — the demo simply does not survive a reload */
  }
}

function elapsedOf(clock: Clock, now: number): number {
  if (clock.phase === "idle") return 0;
  const end = clock.pausedAt ?? now;
  return Math.min(LIVE_OPS_DURATION_MS, Math.max(0, end - clock.startedAt - clock.pausedMs));
}

export function useLiveOperationsDemo(shipments: OrcaShipment[]) {
  const [clock, setClock] = useState<Clock>(IDLE_CLOCK);
  const [now, setNow] = useState(0);
  const clockRef = useRef(clock);
  clockRef.current = clock;

  // Restore any in-tab run after hydration (never during SSR/first render).
  useEffect(() => {
    const restored = readSession();
    if (restored) {
      setClock(restored);
      setNow(Date.now());
    }
  }, []);

  const update = useCallback((next: Clock) => {
    setClock(next);
    writeSession(next);
    setNow(Date.now());
  }, []);

  const running = clock.phase === "running";

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const c = clockRef.current;
      if (elapsedOf(c, t) >= LIVE_OPS_DURATION_MS) {
        const done: Clock = { ...c, phase: "complete" };
        setClock(done);
        writeSession(done);
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [running]);

  const elapsedMs = clock.phase === "idle" ? 0 : elapsedOf(clock, now || Date.now());
  const remainingMs = Math.max(0, LIVE_OPS_DURATION_MS - elapsedMs);

  const schedule = useMemo(() => buildLiveOpsSchedule(shipments), [shipments]);

  const { events, stateById } = useMemo(
    () =>
      clock.phase === "idle"
        ? { events: [] as LiveOpsEvent[], stateById: new Map<string, LiveOpsShipmentState>() }
        : projectLiveOps(schedule, shipments, elapsedMs, clock.startedAt),
    [clock.phase, clock.startedAt, schedule, shipments, elapsedMs],
  );

  const summary = useMemo(
    () => summariseLiveOps(shipments, stateById, events.length),
    [shipments, stateById, events.length],
  );

  const start = useCallback(() => {
    update({ phase: "running", startedAt: Date.now(), pausedMs: 0, pausedAt: null });
  }, [update]);

  const pause = useCallback(() => {
    const c = clockRef.current;
    if (c.phase !== "running") return;
    update({ ...c, phase: "paused", pausedAt: Date.now() });
  }, [update]);

  const resume = useCallback(() => {
    const c = clockRef.current;
    if (c.phase !== "paused" || c.pausedAt === null) return;
    update({
      ...c,
      phase: "running",
      pausedMs: c.pausedMs + (Date.now() - c.pausedAt),
      pausedAt: null,
    });
  }, [update]);

  const stop = useCallback(() => update(IDLE_CLOCK), [update]);

  return {
    phase: clock.phase,
    elapsedMs,
    remainingMs,
    events,
    stateById,
    summary,
    start,
    pause,
    resume,
    stop,
    restart: start,
  };
}

/** mm:ss for the countdown. */
export function countdownLabel(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
