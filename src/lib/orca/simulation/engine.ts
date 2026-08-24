/**
 * Operational Digital Twin engine.
 *
 * Owns ONE continuous simulation run: population, clock, spawning, movement,
 * events and the model-call queue. Framework-agnostic — it exposes a
 * subscribe/getSnapshot store contract and takes real time in via `tick()`, so a
 * future server/WebSocket implementation can replace the in-browser clock
 * without touching any page.
 *
 * PROVENANCE: every risk/severity/decision value stored on a shipment is copied
 * verbatim from a real ORCA /predict or /recommend response. The engine has no
 * code path that invents one. When a model call fails the shipment becomes
 * UNSCORED / MODEL OFFLINE.
 */

import { makeRng, newSeed, runIdFromSeed, type Rng } from "../prng";
import { riskTier } from "../risk";
import { rowToFeatures, type FeatureMap } from "../source-data";
import type { PredictResponse, RecommendResponse, DecisionAction } from "../types";
import {
  applyShock,
  makeEvent,
  pingDetail,
  recoveryFamily,
  resolveShock,
  stageDetail,
  stageFamily,
} from "./event-engine";
import type { TargetBand } from "./mutation-profiles";
import { createAutomaticGeneratorSource } from "./shipment-generator";
import { advance } from "./route-engine";
import {
  DEFAULT_SIM_SPEED,
  SIM_PROVENANCE,
  UNSCORED_MODEL,
  type ShipmentSource,
  type SimEvent,
  type SimMetrics,
  type SimShipment,
  type SimSpeed,
  type SimulationSnapshot,
} from "./types";

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */

export const SIM_CONFIG = {
  /** Population bootstrapped on Start. */
  bootstrapMin: 10,
  bootstrapMax: 14,
  /** Automatic replacement floor and hard ceiling. */
  minActive: 10,
  maxActive: 18,
  /** Randomized spawn interval, in simulated ms. */
  spawnMinMs: 25_000,
  spawnMaxMs: 75_000,
  /** Bounded history. */
  maxEvents: 160,
  maxDelivered: 14,
  /** Model-call guards. */
  maxConcurrentModelCalls: 3,
  rescoreCooldownMs: 45_000,
  /** Real-time tick period. */
  tickMs: 500,
} as const;

const MINUTE = 60_000;

/* ------------------------------------------------------------------ */
/* Model port                                                          */
/* ------------------------------------------------------------------ */

export interface ModelPort {
  predict(features: FeatureMap): Promise<PredictResponse>;
  recommend(features: FeatureMap): Promise<RecommendResponse>;
}

type ScoreReason = "initial" | "shock";

interface ScoreRequest {
  shipmentId: string;
  reason: ScoreReason;
  audit: string[];
  detail: string;
}

const EMPTY_METRICS: SimMetrics = {
  generated: 0,
  delivered: 0,
  exceptionsOpened: 0,
  recoveries: 0,
  predictCalls: 0,
  recommendCalls: 0,
  rescores: 0,
  scoreFailures: 0,
};

export function idleSnapshot(): SimulationSnapshot {
  return {
    version: 0,
    runId: "",
    seed: 0,
    status: "idle",
    startedAtEpoch: 0,
    simClockMs: 0,
    speed: DEFAULT_SIM_SPEED,
    active: [],
    recentlyDelivered: [],
    events: [],
    metrics: { ...EMPTY_METRICS },
    nextSpawnAtMs: 0,
    modelOnline: null,
    modelOfflineReason: null,
  };
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export class SimulationEngine {
  private snapshot: SimulationSnapshot = idleSnapshot();
  private listeners = new Set<() => void>();
  private rng: Rng = makeRng(1);
  private source: ShipmentSource = createAutomaticGeneratorSource(makeRng(1));
  private port: ModelPort | null = null;
  private queue: ScoreRequest[] = [];
  private inFlight = 0;
  private sequence = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;
  /** Verbatim /predict responses keyed by templateId|candidateKey (identical feature rows). */
  private predictCache = new Map<string, PredictResponse>();

  /* -------------------- store contract -------------------- */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SimulationSnapshot => this.snapshot;

  private commit(patch: Partial<SimulationSnapshot> = {}) {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      version: this.snapshot.version + 1,
      active: patch.active ?? [...this.snapshot.active],
    };
    for (const l of this.listeners) l();
  }

  setModelPort(port: ModelPort) {
    this.port = port;
  }

  /* -------------------- lifecycle -------------------- */

  start(seed = newSeed()) {
    this.stopClock();
    this.rng = makeRng(seed);
    this.source = createAutomaticGeneratorSource(this.rng);
    this.queue = [];
    this.inFlight = 0;
    this.sequence = 0;
    this.predictCache.clear();

    const startedAtEpoch = Date.now();
    this.snapshot = {
      ...idleSnapshot(),
      version: this.snapshot.version + 1,
      runId: runIdFromSeed(seed),
      seed,
      status: "running",
      startedAtEpoch,
      speed: this.snapshot.speed,
    };

    const bootstrap = this.rng.int(SIM_CONFIG.bootstrapMin, SIM_CONFIG.bootstrapMax);
    const active: SimShipment[] = [];
    const events: SimEvent[] = [];
    for (let i = 0; i < bootstrap; i++) {
      // Alternate the candidate band so the bootstrap cohort explores both ends
      // of the model's output range. The tier still comes from /predict.
      const shipment = this.spawnShipment(0, i % 2 === 0 ? "elevated" : "baseline");

      // Stagger the bootstrap cohort along its journey so the map reads as an
      // operation already under way rather than everything leaving at once.
      const head = this.rng.float(0, 0.55);
      shipment.travelledMs = shipment.journeyMs * head;
      advance(shipment, 0);
      active.push(shipment);
      events.unshift(
        makeEvent({
          startedAtEpoch,
          simClockMs: 0,
          shipmentId: shipment.id,
          family: "SPAWN",
          detail: `Synthetic shipment created · ${shipment.route} · ${shipment.mode} · template row ${shipment.templateId}`,
          provenance: SIM_PROVENANCE.twin,
        }),
      );
    }

    this.snapshot = {
      ...this.snapshot,
      active,
      events: events.reverse(),
      metrics: { ...this.snapshot.metrics, generated: active.length },
      nextSpawnAtMs: this.rng.float(SIM_CONFIG.spawnMinMs, SIM_CONFIG.spawnMaxMs),
    };
    this.commit();
    this.startClock();
    this.pump();
  }

  pause() {
    if (this.snapshot.status !== "running") return;
    this.stopClock();
    this.commit({ status: "paused" });
  }

  resume() {
    if (this.snapshot.status !== "paused") return;
    this.commit({ status: "running" });
    this.startClock();
    this.pump();
  }

  stop() {
    this.stopClock();
    this.queue = [];
    this.snapshot = { ...idleSnapshot(), version: this.snapshot.version + 1 };
    for (const l of this.listeners) l();
  }

  newRun() {
    this.start(newSeed());
  }

  setSpeed(speed: SimSpeed) {
    this.commit({ speed });
  }

  /** Restores a snapshot rehydrated from sessionStorage. */
  restore(snapshot: SimulationSnapshot) {
    this.stopClock();
    this.rng = makeRng(snapshot.seed || 1);
    this.source = createAutomaticGeneratorSource(this.rng);
    this.sequence = snapshot.metrics.generated;
    this.queue = [];
    this.inFlight = 0;
    this.snapshot = { ...snapshot, version: this.snapshot.version + 1 };
    for (const l of this.listeners) l();
    if (snapshot.status === "running") this.startClock();
  }

  /** Stops the clock without dropping subscribers or the run snapshot. */
  dispose() {
    this.stopClock();
  }

  /* -------------------- clock -------------------- */

  private startClock() {
    if (this.timer) return;
    this.lastTickAt = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      const delta = now - this.lastTickAt;
      this.lastTickAt = now;
      this.tick(delta);
    }, SIM_CONFIG.tickMs);
  }

  private stopClock() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /* -------------------- tick -------------------- */

  /** Advances the run by `realDeltaMs` of wall-clock time. */
  tick(realDeltaMs: number) {
    const snap = this.snapshot;
    if (snap.status !== "running") return;

    const simDelta = Math.max(0, realDeltaMs) * snap.speed;
    const simClockMs = snap.simClockMs + simDelta;
    const startedAtEpoch = snap.startedAtEpoch;
    const newEvents: SimEvent[] = [];
    const metrics = { ...snap.metrics };

    const active: SimShipment[] = [];
    const delivered: SimShipment[] = [];

    for (const shipment of snap.active) {
      const before = shipment.status;
      const result = advance(shipment, simDelta);

      for (const status of result.transitions) {
        if (status === "DELIVERED") continue;
        if (status === "CUSTOMS" && shipment.exceptionOpen) continue;
        newEvents.push(
          makeEvent({
            startedAtEpoch,
            simClockMs,
            shipmentId: shipment.id,
            family: stageFamily(status),
            detail: stageDetail(shipment, status),
          }),
        );
        shipment.latestEvent = stageDetail(shipment, status);
        shipment.eventCount += 1;
      }

      // Routine position pings — no model call.
      for (const ping of shipment.plannedPings) {
        if (shipment.progress >= ping && !shipment.firedPings.includes(ping)) {
          shipment.firedPings = [...shipment.firedPings, ping];
          const detail = pingDetail(shipment, this.rng);
          shipment.latestEvent = detail;
          shipment.eventCount += 1;
          newEvents.push(
            makeEvent({
              startedAtEpoch,
              simClockMs,
              shipmentId: shipment.id,
              family: "IN_TRANSIT",
              detail,
            }),
          );
        }
      }

      // Risk-affecting shocks → bounded feature shock + real /predict re-score.
      for (const shock of shipment.plannedShocks) {
        if (
          !shock.applied &&
          shipment.progress >= shock.atProgress &&
          shipment.progress < 1 &&
          simClockMs - shipment.lastScoreRequestAt >= SIM_CONFIG.rescoreCooldownMs
        ) {
          shock.applied = true;
          const outcome = applyShock(shipment, shock.profileKey, this.rng);
          shipment.status = "EXCEPTION";
          shipment.latestEvent = outcome.detail;
          shipment.eventCount += 1;
          metrics.exceptionsOpened += 1;
          newEvents.push(
            makeEvent({
              startedAtEpoch,
              simClockMs,
              shipmentId: shipment.id,
              family: outcome.profile.family,
              detail: outcome.detail,
              provenance: `${SIM_PROVENANCE.ops} → ${SIM_PROVENANCE.shockInput}`,
              riskBefore: shipment.model.risk,
              featureAudit: outcome.audit,
            }),
          );
          this.enqueueScore({
            shipmentId: shipment.id,
            reason: "shock",
            audit: outcome.audit,
            detail: outcome.profile.label,
          });
          shipment.lastScoreRequestAt = simClockMs;
        } else if (
          shock.applied &&
          !shock.recovered &&
          shipment.exceptionOpen &&
          shipment.progress >= shock.recoverAtProgress
        ) {
          shock.recovered = true;
          const family = recoveryFamily(shipment.exceptionFamily);
          const detail = resolveShock(shipment, this.rng);
          shipment.latestEvent = detail;
          shipment.eventCount += 1;
          metrics.recoveries += 1;
          newEvents.push(
            makeEvent({
              startedAtEpoch,
              simClockMs,
              shipmentId: shipment.id,
              family,
              detail,
            }),
          );
        }
      }

      if (result.delivered && before !== "DELIVERED") {
        shipment.deliveredAt = simClockMs;
        const detail = stageDetail(shipment, "DELIVERED");
        shipment.latestEvent = detail;
        shipment.eventCount += 1;
        metrics.delivered += 1;
        newEvents.push(
          makeEvent({
            startedAtEpoch,
            simClockMs,
            shipmentId: shipment.id,
            family: "DELIVERED",
            detail: `${detail} · ETA variance ${shipment.etaVarianceHours >= 0 ? "+" : ""}${Math.round(shipment.etaVarianceHours)}h`,
          }),
        );
        delivered.push(shipment);
      } else {
        active.push(shipment);
      }
    }

    // Automatic injection: scheduled spawn plus a population floor.
    let nextSpawnAtMs = snap.nextSpawnAtMs;
    if (simClockMs >= nextSpawnAtMs && active.length < SIM_CONFIG.maxActive) {
      const shipment = this.spawnShipment(simClockMs);
      active.push(shipment);
      metrics.generated += 1;
      newEvents.push(
        makeEvent({
          startedAtEpoch,
          simClockMs,
          shipmentId: shipment.id,
          family: "SPAWN",
          detail: `Synthetic shipment created · ${shipment.route} · ${shipment.mode} · template row ${shipment.templateId}`,
          provenance: SIM_PROVENANCE.twin,
        }),
      );
      nextSpawnAtMs = simClockMs + this.rng.float(SIM_CONFIG.spawnMinMs, SIM_CONFIG.spawnMaxMs);
    }
    while (active.length < SIM_CONFIG.minActive) {
      const shipment = this.spawnShipment(simClockMs);
      active.push(shipment);
      metrics.generated += 1;
      newEvents.push(
        makeEvent({
          startedAtEpoch,
          simClockMs,
          shipmentId: shipment.id,
          family: "SPAWN",
          detail: `Replacement shipment created · ${shipment.route} · ${shipment.mode} · template row ${shipment.templateId}`,
          provenance: SIM_PROVENANCE.twin,
        }),
      );
    }

    this.snapshot = {
      ...snap,
      version: snap.version + 1,
      simClockMs,
      active,
      recentlyDelivered: [...delivered.reverse(), ...snap.recentlyDelivered].slice(
        0,
        SIM_CONFIG.maxDelivered,
      ),
      events: [...newEvents.reverse(), ...snap.events].slice(0, SIM_CONFIG.maxEvents),
      metrics,
      nextSpawnAtMs,
    };
    for (const l of this.listeners) l();
    this.pump();
  }

  /* -------------------- spawning -------------------- */

  private spawnShipment(simClockMs: number, band?: TargetBand): SimShipment {
    this.sequence += 1;
    const shipment = this.source.next({
      simClockMs,
      sequence: this.sequence,
      runId: this.snapshot.runId,
      targetBand: band ?? this.pickBand(),
    });
    this.enqueueScore({
      shipmentId: shipment.id,
      reason: "initial",
      audit: [],
      detail: "initial score",
    });
    shipment.lastScoreRequestAt = simClockMs - SIM_CONFIG.rescoreCooldownMs;
    return shipment;
  }

  /**
   * Chooses which candidate band the next shipment aims at, based on the tiers
   * the MODEL has actually returned for the current population. This only
   * selects an input recipe to try — it never writes a tier.
   */
  private pickBand(): TargetBand {
    const scored = this.snapshot.active.filter((s) => s.model.phase === "scored");
    if (scored.length >= 4) {
      const elevated = scored.filter(
        (s) => s.model.tier !== "LOW_RISK" && s.model.tier !== "UNSCORED",
      ).length;
      const share = elevated / scored.length;
      if (share < 0.35) return "elevated";
      if (share > 0.6) return "baseline";
    }
    return this.rng.chance(0.5) ? "elevated" : "baseline";
  }

  /**
   * Bounded creation-time candidate search. Each candidate is a real /predict
   * call on a bounded, in-domain pre-outcome feature state; the engine simply
   * keeps the candidate the MODEL rated highest and stops as soon as the model
   * leaves the LOW band. Identical feature rows reuse the verbatim cached
   * /predict response instead of re-calling the backend.
   */
  private async searchCandidates(
    shipment: SimShipment,
    port: ModelPort,
  ): Promise<{ prediction: PredictResponse; networkCalls: number }> {
    const candidates =
      shipment.candidates.length > 0
        ? shipment.candidates
        : [{ key: "as_planned", label: "As planned (unmodified template)", raw: shipment.raw }];

    let best: { candidate: (typeof candidates)[number]; prediction: PredictResponse } | null = null;
    let networkCalls = 0;
    const trace: string[] = [];

    for (const candidate of candidates) {
      const cacheKey = `${shipment.templateId}|${candidate.key}`;
      const cached = this.predictCache.get(cacheKey);
      let prediction = cached;
      if (!prediction) {
        prediction = await port.predict(rowToFeatures(candidate.raw));
        networkCalls += 1;
        this.predictCache.set(cacheKey, prediction);
      }
      const tier = prediction.risk_tier ?? riskTier(prediction.probability_late);
      trace.push(
        `${candidate.label} → ORCA risk ${prediction.probability_late.toFixed(3)} · tier ${tier}${cached ? " (cached model output for an identical feature row)" : ""}`,
      );
      if (!best || prediction.probability_late > best.prediction.probability_late) {
        best = { candidate, prediction };
      }
      if (shipment.targetBand === "baseline") break;
      if (prediction.probability_late > 0.3) break;
    }

    const chosen = best!;
    shipment.raw = chosen.candidate.raw;
    shipment.features = rowToFeatures(chosen.candidate.raw);
    shipment.appliedProfiles =
      chosen.candidate.key === "as_planned" ? [] : [chosen.candidate.label];
    shipment.candidateSearch = trace;
    shipment.candidates = [];
    return { prediction: chosen.prediction, networkCalls: Math.max(networkCalls, 0) };
  }

  /* -------------------- model calls -------------------- */

  private enqueueScore(request: ScoreRequest) {
    this.queue.push(request);
  }

  private findShipment(id: string): SimShipment | undefined {
    return this.snapshot.active.find((s) => s.id === id);
  }

  private pump() {
    if (!this.port) return;
    while (this.inFlight < SIM_CONFIG.maxConcurrentModelCalls && this.queue.length > 0) {
      const request = this.queue.shift()!;
      const shipment = this.findShipment(request.shipmentId);
      if (!shipment) continue;
      this.inFlight += 1;
      void this.score(shipment, request).finally(() => {
        this.inFlight -= 1;
        this.pump();
      });
    }
  }

  private async score(shipment: SimShipment, request: ScoreRequest) {
    const port = this.port;
    if (!port) return;
    const previousRisk = shipment.model.risk;
    const previousTier =
      shipment.model.phase === "scored" && shipment.model.tier !== "UNSCORED"
        ? shipment.model.tier
        : null;

    try {
      const searched = request.reason === "initial";
      const { prediction, networkCalls } = searched
        ? await this.searchCandidates(shipment, port)
        : { prediction: await port.predict(shipment.features), networkCalls: 1 };
      const metrics = { ...this.snapshot.metrics };
      metrics.predictCalls += networkCalls;
      if (request.reason === "shock") metrics.rescores += 1;

      const tier = prediction.risk_tier ?? riskTier(prediction.probability_late);
      shipment.model = {
        phase: "scored",
        risk: prediction.probability_late,
        tier,
        severity_p50: prediction.severity_p50,
        severity_interval_90: prediction.severity_interval_90,
        classification_decision: prediction.classification_decision,
        decision_threshold: prediction.decision_threshold,
        model_version: prediction.model_version,
        previousRisk,
        previousTier,
        scoredAt: this.snapshot.simClockMs,
        offlineReason: null,
        recommendation: shipment.model.recommendation,
      };

      const searchSuffix =
        searched && shipment.candidateSearch.length > 1
          ? ` · ${shipment.candidateSearch.length} candidate feature states scored, highest ORCA output kept`
          : "";
      const detail =
        request.reason === "shock"
          ? `Re-scored after ${request.detail} · risk ${(previousRisk ?? 0).toFixed(3)} → ${prediction.probability_late.toFixed(3)} · tier ${tier}`
          : `Scored by ORCA · risk ${prediction.probability_late.toFixed(3)} · tier ${tier} · ${prediction.model_version}${searchSuffix}`;

      const event = makeEvent({
        startedAtEpoch: this.snapshot.startedAtEpoch,
        simClockMs: this.snapshot.simClockMs,
        shipmentId: shipment.id,
        family: request.reason === "shock" ? "MODEL_RESCORE" : "MODEL_SCORE",
        detail,
        provenance: request.reason === "shock" ? SIM_PROVENANCE.shockResult : SIM_PROVENANCE.model,
        riskBefore: previousRisk,
        riskAfter: prediction.probability_late,
        ...(request.audit.length > 0
          ? { featureAudit: request.audit }
          : searched && shipment.candidateSearch.length > 1
            ? { featureAudit: shipment.candidateSearch }
            : {}),
      });

      this.snapshot = {
        ...this.snapshot,
        version: this.snapshot.version + 1,
        events: [event, ...this.snapshot.events].slice(0, SIM_CONFIG.maxEvents),
        metrics,
        modelOnline: true,
        modelOfflineReason: null,
      };
      for (const l of this.listeners) l();

      // /recommend only for meaningful high-risk state changes.
      const needsRecommendation =
        prediction.classification_decision || tier === "HIGH_RISK" || tier === "CRITICAL";
      if (needsRecommendation) await this.fetchRecommendation(shipment, port);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      shipment.model = {
        ...UNSCORED_MODEL,
        phase: "offline",
        tier: "UNSCORED",
        previousRisk,
        offlineReason: reason,
      };
      const metrics = {
        ...this.snapshot.metrics,
        scoreFailures: this.snapshot.metrics.scoreFailures + 1,
      };
      const event = makeEvent({
        startedAtEpoch: this.snapshot.startedAtEpoch,
        simClockMs: this.snapshot.simClockMs,
        shipmentId: shipment.id,
        family: "MODEL_OFFLINE",
        detail: `ORCA /predict unavailable (${reason}) — shipment held as ${SIM_PROVENANCE.unscored}. No substitute risk value applied.`,
        provenance: SIM_PROVENANCE.unscored,
      });
      this.snapshot = {
        ...this.snapshot,
        version: this.snapshot.version + 1,
        events: [event, ...this.snapshot.events].slice(0, SIM_CONFIG.maxEvents),
        metrics,
        modelOnline: false,
        modelOfflineReason: reason,
      };
      for (const l of this.listeners) l();
    }
  }

  private async fetchRecommendation(shipment: SimShipment, port: ModelPort) {
    try {
      const response = await port.recommend(shipment.features);
      const action = (
        ["NO_ACTION", "MONITOR", "INTERVENE"].includes(response.recommendation)
          ? response.recommendation
          : "MONITOR"
      ) as DecisionAction;
      shipment.model = {
        ...shipment.model,
        recommendation: {
          action,
          raw: response.recommendation,
          reasons: response.decision_reason,
          human_approval_required: response.human_approval_required,
        },
      };
      const event = makeEvent({
        startedAtEpoch: this.snapshot.startedAtEpoch,
        simClockMs: this.snapshot.simClockMs,
        shipmentId: shipment.id,
        family: "RECOMMENDATION",
        detail: `ORCA /recommend → ${response.recommendation}${response.decision_reason[0] ? ` · ${response.decision_reason[0]}` : ""}`,
        provenance: SIM_PROVENANCE.model,
      });
      this.snapshot = {
        ...this.snapshot,
        version: this.snapshot.version + 1,
        events: [event, ...this.snapshot.events].slice(0, SIM_CONFIG.maxEvents),
        metrics: {
          ...this.snapshot.metrics,
          recommendCalls: this.snapshot.metrics.recommendCalls + 1,
        },
      };
      for (const l of this.listeners) l();
    } catch {
      // A failed /recommend never fabricates an action — the field stays null.
    }
  }
}

/** Elapsed simulated time as Dd HH:MM. */
export function formatSimElapsed(simClockMs: number): string {
  const totalMinutes = Math.floor(simClockMs / MINUTE);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const hhmm = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return days > 0 ? `${days}d ${hhmm}` : hhmm;
}
