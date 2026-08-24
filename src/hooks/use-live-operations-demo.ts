/**
 * 5-minute Live Operations Demo.
 *
 * Presentation-only. This module never mutates the ORCA model/client/adapter
 * layer: it consumes the already-scored portfolio read-only and produces
 * SYNTHETIC LIVE OPERATIONS motion (status, progress, ETA drift, event feed)
 * on top of it. Model outputs — probability_late, severity, tier, SHAP and
 * recommendations — are never changed here.
 *
 * Each Start/Restart draws a NEW SEED and builds a fresh randomized run plan
 * (`buildRunPlan`). Within a run everything is deterministic: the visible
 * state is a pure function of (plan, elapsed wall-clock time), so a throttled
 * tab simply re-derives on the next tick.
 *
 * The only real model interaction is the optional WHAT-IF re-score, which
 * calls the existing /predict + /recommend endpoints through the existing
 * adapter. Baseline stays MODEL OUTPUT; the mutated feature payload is
 * SIMULATED SCENARIO and its score is MODEL OUTPUT ON SIMULATED SCENARIO.
 * When the backend is unreachable the re-score is skipped, never fabricated.
 *
 * Framework-agnostic apart from the React hook at the bottom.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { OrcaEvent, OrcaShipment } from "@/lib/orca/types";
import { runWhatIf } from "@/lib/orca/adapter";
import { newSeed } from "@/lib/orca/prng";
import {
  buildRunPlan,
  familyEventType,
  FAMILY_LABEL,
  LIVE_OPS_DURATION_SEC,
  LIVE_OPS_PROVENANCE,
  type LiveOpsRunPlan,
  type ScenarioFamily,
  type ScheduleEntry,
} from "@/lib/orca/live-ops-plan";

export { LIVE_OPS_PROVENANCE, FAMILY_LABEL };
export type { ScenarioFamily, LiveOpsRunPlan };

export const LIVE_OPS_DURATION_MS = LIVE_OPS_DURATION_SEC * 1000;

export const BASELINE_LABEL = "MODEL OUTPUT";
export const SCENARIO_INPUT_LABEL = "SIMULATED SCENARIO";
export const SCENARIO_RESULT_LABEL = "MODEL OUTPUT ON SIMULATED SCENARIO";

export type LiveOpsPhase = "idle" | "running" | "paused" | "complete";

/** An `OrcaEvent` carrying the operational family label for presentation. */
export interface LiveOpsEvent extends OrcaEvent {
  ops_label: string;
  family: ScenarioFamily;
  /** Seconds into the demo, used as a stable key. */
  at: number;
}

export interface LiveOpsShipmentState {
  status: string;
  progress_pct: number;
  eta_variance_hours: number;
  delivered: boolean;
  exception_open: boolean;
}

export interface LiveOpsSummary {
  active: number;
  in_transit: number;
  at_risk: number;
  delivered: number;
  critical: number;
  events_processed: number;
  open_exceptions: number;
  scenarios_evaluated: number;
  /** Largest |scenario − baseline| in percentage points, when available. */
  biggest_delta_pp: number | null;
}

/** A completed WHAT-IF re-score, produced by the real /predict endpoint. */
export interface LiveOpsWhatIf {
  at: number;
  shipmentId: string;
  scenarioKey: string;
  scenarioLabel: string;
  baselineRisk: number;
  scenarioRisk: number;
  deltaPp: number;
  featureAudit: string[];
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
      exception_open: false,
    };

    if (current.delivered) continue; // no post-delivery motion

    const next: LiveOpsShipmentState = {
      status: entry.status ?? current.status,
      progress_pct: Math.min(100, Math.max(current.progress_pct, entry.progress ?? 0)),
      eta_variance_hours:
        Math.round((current.eta_variance_hours + (entry.etaDelta ?? 0)) * 10) / 10,
      delivered: current.delivered || entry.family === "DELIVERED",
      exception_open: entry.clearsException
        ? false
        : entry.opensException || current.exception_open,
    };
    stateById.set(entry.shipmentId, next);

    events.push({
      at: entry.at,
      family: entry.family,
      ops_label: FAMILY_LABEL[entry.family].toUpperCase(),
      timestamp: clockLabel(startedAtMs + entry.at * 1000),
      shipment_id: entry.shipmentId,
      event_type: familyEventType(entry.family),
      detail: entry.detail,
      provenance: LIVE_OPS_PROVENANCE,
    });
  }

  return { events, stateById };
}

/**
 * Run-scoped summary. Every metric is computed over the run cast only
 * (`castIds`), never the wider scored portfolio. Baseline risk (`s.risk`) is
 * read-only model/fixture output — synthetic ops never alter it.
 */
export function summariseLiveOps(
  shipments: OrcaShipment[],
  castIds: string[],
  stateById: Map<string, LiveOpsShipmentState>,
  eventCount: number,
  whatIfs: LiveOpsWhatIf[],
): LiveOpsSummary {
  const castSet = new Set(castIds);
  const cast = shipments.filter((s) => castSet.has(s.id));
  let delivered = 0;
  let open = 0;
  for (const s of cast) {
    const st = stateById.get(s.id);
    if (!st) continue;
    if (st.delivered) delivered += 1;
    else if (st.exception_open) open += 1;
  }
  const deltas = whatIfs.map((w) => Math.abs(w.deltaPp));
  return {
    active: cast.length,
    // Delivered + In Transit always reconciles with the run cast size.
    in_transit: Math.max(0, cast.length - delivered),
    at_risk: cast.filter((s) => s.risk >= 0.3).length,
    delivered,
    critical: cast.filter((s) => s.risk > 0.85).length,
    events_processed: eventCount,
    open_exceptions: open,
    scenarios_evaluated: whatIfs.length,
    biggest_delta_pp: deltas.length > 0 ? Math.max(...deltas) : null,
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
  /** Run seed — the whole plan is reproducible from this. */
  seed: number;
}

const IDLE_CLOCK: Clock = { phase: "idle", startedAt: 0, pausedMs: 0, pausedAt: null, seed: 0 };

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
      seed: typeof parsed.seed === "number" ? parsed.seed : 1,
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
  const [whatIfs, setWhatIfs] = useState<LiveOpsWhatIf[]>([]);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const requestedWhatIfs = useRef<Set<string>>(new Set());

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

  /** Built once per (portfolio, seed) — never reshuffled on re-render. */
  const plan = useMemo<LiveOpsRunPlan | null>(
    () => (clock.seed === 0 ? null : buildRunPlan(shipments, clock.seed)),
    [shipments, clock.seed],
  );

  const { events, stateById } = useMemo(
    () =>
      clock.phase === "idle" || !plan
        ? { events: [] as LiveOpsEvent[], stateById: new Map<string, LiveOpsShipmentState>() }
        : projectLiveOps(plan.schedule, shipments, elapsedMs, clock.startedAt),
    [clock.phase, clock.startedAt, plan, shipments, elapsedMs],
  );

  // WHAT-IF re-scores: fire once each, at their scheduled second, against the
  // real /predict + /recommend endpoints. Silently skipped when unreachable.
  useEffect(() => {
    if (!plan || clock.phase === "idle") return;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    let cancelled = false;

    for (const pick of plan.whatIfs) {
      const key = `${plan.seed}:${pick.shipmentId}:${pick.scenarioKey}`;
      if (pick.at > elapsedSec || requestedWhatIfs.current.has(key)) continue;
      requestedWhatIfs.current.add(key);
      void runWhatIf({
        shipment_id: pick.shipmentId,
        scenario_key: pick.scenarioKey,
        delay_cost_per_day: 1200,
        intervention_cost: 2500,
        efficacy_days: 2,
      })
        .then((res) => {
          if (cancelled) return;
          setWhatIfs((prev) =>
            prev.some((w) => w.shipmentId === pick.shipmentId && w.at === pick.at)
              ? prev
              : [
                  ...prev,
                  {
                    at: pick.at,
                    shipmentId: pick.shipmentId,
                    scenarioKey: pick.scenarioKey,
                    scenarioLabel: res.scenario_label,
                    baselineRisk: res.baseline.risk,
                    scenarioRisk: res.result.risk,
                    deltaPp: res.result.risk_delta_pp,
                    featureAudit: res.feature_audit,
                  },
                ].sort((a, b) => a.at - b.at),
          );
        })
        .catch(() => {
          /* backend unreachable — skip the re-score rather than fabricate it */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [plan, clock.phase, elapsedMs]);

  /** Synthetic ops events + model what-if events, merged in run order. */
  const timeline = useMemo<LiveOpsEvent[]>(() => {
    if (whatIfs.length === 0) return events;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const startedAt = clock.startedAt;
    const modelEvents: LiveOpsEvent[] = whatIfs
      .filter((w) => w.at <= elapsedSec)
      .map((w) => ({
        at: w.at,
        family: "MODEL_SCENARIO" as ScenarioFamily,
        ops_label: "MODEL WHAT-IF",
        timestamp: clockLabel(startedAt + w.at * 1000),
        shipment_id: w.shipmentId,
        event_type: "MODEL" as const,
        detail: `What-if "${w.scenarioLabel}": baseline ${(w.baselineRisk * 100).toFixed(1)}% → scenario ${(w.scenarioRisk * 100).toFixed(1)}% (${w.deltaPp >= 0 ? "+" : ""}${w.deltaPp.toFixed(1)} pp)`,
        provenance: `${SCENARIO_INPUT_LABEL} → ${SCENARIO_RESULT_LABEL}`,
      }));
    const merged = [...events, ...modelEvents].sort((a, b) => a.at - b.at);
    // Hard cap: the plan reserves slots for what-if results, but never report
    // more than MAX_TIMELINE_EVENTS. Model events are always retained.
    if (merged.length <= MAX_TIMELINE_EVENTS) return merged;
    let over = merged.length - MAX_TIMELINE_EVENTS;
    const capped: LiveOpsEvent[] = [];
    for (const e of merged) {
      const droppable =
        over > 0 &&
        e.family !== "MODEL_SCENARIO" &&
        (e.family === "IN_TRANSIT" || e.family === "ETA_SLIP" || e.family === "FINAL_MILE");
      if (droppable) {
        over -= 1;
        continue;
      }
      capped.push(e);
    }
    return capped.slice(0, MAX_TIMELINE_EVENTS);
  }, [events, whatIfs, elapsedMs, clock.startedAt]);

  const summary = useMemo(
    () => summariseLiveOps(shipments, plan?.castIds ?? [], stateById, timeline.length, whatIfs),
    [shipments, plan, stateById, timeline.length, whatIfs],
  );

  const start = useCallback(() => {
    requestedWhatIfs.current = new Set();
    setWhatIfs([]);
    update({
      phase: "running",
      startedAt: Date.now(),
      pausedMs: 0,
      pausedAt: null,
      seed: newSeed(),
    });
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

  const stop = useCallback(() => {
    requestedWhatIfs.current = new Set();
    setWhatIfs([]);
    update(IDLE_CLOCK);
  }, [update]);

  return {
    phase: clock.phase,
    elapsedMs,
    remainingMs,
    events: timeline,
    stateById,
    summary,
    whatIfs,
    runId: plan?.runId ?? null,
    seed: clock.seed,
    mix: plan?.mix ?? [],
    castSize: plan?.castIds.length ?? 0,
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
