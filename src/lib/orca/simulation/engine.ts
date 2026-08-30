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
import type { PredictResponse, RecommendResponse } from "../types";
import { parseDecisionAction } from "../types";
import {
  applyShock,
  makeEvent,
  pingDetail,
  recoveryFamily,
  resolveShock,
  stageDetail,
  stageFamily,
} from "./event-engine";
import {
  defaultActionFor,
  effectSpec,
  interventionEffect,
  INTERVENTION_POLICY_VERSION,
  type HumanDecisionKind,
  type OperatorAction,
  type ReasonCode,
} from "./intervention-policy";
import type { TargetBand } from "./mutation-profiles";
import { createAutomaticGeneratorSource } from "./shipment-generator";
import { advance } from "./route-engine";
import { auditTrail } from "../adapter";
import {
  DEFAULT_SIM_SPEED,
  SIM_PROVENANCE,
  UNSCORED_MODEL,
  type ShipmentSource,
  type SimEpisode,
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
  maxEpisodes: 60,
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

/* ------------------------------------------------------------------ */
/* Persistence port                                                    */
/* ------------------------------------------------------------------ */

export interface RunRef {
  runId: string;
  seed: number;
  speed: number;
}

export interface PersistedShipment {
  shipmentId: string;
  templateId: string;
  origin: string;
  destination: string;
  route: string;
  mode: string;
  vendor: string | null;
  productGroup: string | null;
  createdSimMs: number;
  initialFeatures: FeatureMap;
}

export interface ModelInferencePayload {
  shipmentId: string;
  triggerEventId: string;
  simClockMs: number;
  inferenceKind: "INITIAL" | "RESCORE" | "POST_INTERVENTION";
  features: FeatureMap;
  prediction: PredictResponse;
  state: {
    shipmentStatus: string;
    progress: number;
    position: [number, number];
    etaVarianceHours: number;
    exceptionOpen: boolean;
    exceptionFamily: string | null;
  };
}

export interface EpisodeOpenPayload extends Omit<ModelInferencePayload, "triggerEventId"> {
  triggerEventId: string | null;
  recommendation: RecommendResponse;
}

export interface DecisionPayload {
  episodeDbId: string;
  shipmentId: string;
  decision: HumanDecisionKind;
  recommendedAction: string;
  chosenAction: OperatorAction;
  reasonCode: ReasonCode;
  note: string | null;
  actorLabel: string;
  decisionLatencyMs: number;
  intervention: {
    action: string;
    effectSpec: Record<string, unknown>;
    appliedSimMs: number;
    policyVersion: string;
  } | null;
}

export interface OutcomePayload {
  shipmentId: string;
  deliveredSimMs: number;
  deliveredOnTime: boolean;
  simulatedDelayHours: number;
  finalEtaVarianceHours: number;
  finalFeatures: FeatureMap;
  interventionCount: number;
}

/**
 * Append-only audit sink for the running twin. Implementations are expected to
 * be fire-and-forget and MUST never throw into the engine: a storage outage
 * degrades the audit trail, never the simulation.
 */
export interface PersistencePort {
  runStarted(run: RunRef): void;
  runEnded(runId: string, status: "PAUSED" | "STOPPED"): void;
  shipmentsCreated(run: RunRef, shipments: PersistedShipment[]): void;
  eventsAppended(run: RunRef, events: SimEvent[]): void;
  inferenceRecorded(run: RunRef, payload: ModelInferencePayload): void;
  episodeOpened(run: RunRef, payload: EpisodeOpenPayload): Promise<string | null>;
  decisionRecorded(run: RunRef, payload: DecisionPayload): void;
  outcomeRecorded(run: RunRef, payload: OutcomePayload): void;
}

type ScoreReason = "initial" | "shock" | "intervention";

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
  episodesOpened: 0,
  decisionsRecorded: 0,
  interventionsApplied: 0,
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
    episodes: [],
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
  private persistence: PersistencePort | null = null;
  private queue: ScoreRequest[] = [];
  private inFlight = 0;
  private sequence = 0;
  private episodeSequence = 0;
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

  /** Optional append-only audit sink. Failures never affect the run. */
  setPersistencePort(port: PersistencePort) {
    this.persistence = port;
  }

  private get runRef(): RunRef {
    return { runId: this.snapshot.runId, seed: this.snapshot.seed, speed: this.snapshot.speed };
  }

  /** Fire-and-forget event persistence — never throws into the engine. */
  private audit(events: SimEvent[]) {
    if (!this.persistence || events.length === 0 || !this.snapshot.runId) return;
    try {
      this.persistence.eventsAppended(this.runRef, events);
    } catch {
      // Audit sink unavailable — the run continues.
    }
  }

  /* -------------------- lifecycle -------------------- */

  start(seed = newSeed()) {
    this.stopClock();
    this.rng = makeRng(seed);
    this.source = createAutomaticGeneratorSource(this.rng);
    this.queue = [];
    this.inFlight = 0;
    this.sequence = 0;
    this.episodeSequence = 0;
    this.pendingShipments = [];
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
    try {
      this.persistence?.runStarted(this.runRef);
    } catch {
      // Audit sink unavailable — the run continues.
    }
    this.flushShipments();
    this.audit(this.snapshot.events);
    this.commit();
    this.startClock();
    this.pump();
  }

  pause() {
    if (this.snapshot.status !== "running") return;
    this.stopClock();
    this.commit({ status: "paused" });
    try {
      this.persistence?.runEnded(this.snapshot.runId, "PAUSED");
    } catch {
      // Audit sink unavailable.
    }
  }

  resume() {
    if (this.snapshot.status !== "paused") return;
    this.commit({ status: "running" });
    try {
      this.persistence?.runStarted(this.runRef);
    } catch {
      // Audit sink unavailable — the simulation resumes independently.
    }
    this.startClock();
    this.pump();
  }

  stop() {
    this.stopClock();
    this.queue = [];
    const runId = this.snapshot.runId;
    this.snapshot = { ...idleSnapshot(), version: this.snapshot.version + 1 };
    for (const l of this.listeners) l();
    if (runId) {
      try {
        this.persistence?.runEnded(runId, "STOPPED");
      } catch {
        // Audit sink unavailable.
      }
    }
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
    this.pendingShipments = [];
    // Older persisted snapshots predate the learning system; normalise them so
    // the episode surfaces never read undefined.
    const episodes = Array.isArray(snapshot.episodes) ? snapshot.episodes : [];
    this.episodeSequence = episodes.length;
    this.snapshot = {
      ...snapshot,
      episodes,
      metrics: { ...EMPTY_METRICS, ...snapshot.metrics },
      active: snapshot.active.map((s) => ({
        ...s,
        awaitingDecision: s.awaitingDecision ?? false,
        episodeId: s.episodeId ?? null,
        interventionCount: s.interventionCount ?? 0,
      })),
      version: this.snapshot.version + 1,
    };
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
      // HUMAN DECISION GATE: a shipment with an open Decision Episode holds in
      // place until an operator resolves it. No movement, no new events.
      if (shipment.awaitingDecision) {
        active.push(shipment);
        continue;
      }

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
        this.recordOutcome(shipment, simClockMs);
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
    this.flushShipments();
    this.audit(newEvents);
    this.pump();
  }

  /* -------------------- spawning -------------------- */

  private pendingShipments: PersistedShipment[] = [];

  private flushShipments() {
    if (!this.persistence || this.pendingShipments.length === 0 || !this.snapshot.runId) {
      this.pendingShipments = [];
      return;
    }
    const batch = this.pendingShipments;
    this.pendingShipments = [];
    try {
      this.persistence.shipmentsCreated(this.runRef, batch);
    } catch {
      // Audit sink unavailable — the run continues.
    }
  }

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
    this.pendingShipments.push({
      shipmentId: shipment.id,
      templateId: shipment.templateId,
      origin: shipment.origin,
      destination: shipment.destination,
      route: shipment.route,
      mode: shipment.mode,
      vendor: shipment.vendor || null,
      productGroup: shipment.productGroup || null,
      createdSimMs: Math.max(0, Math.round(simClockMs)),
      initialFeatures: shipment.features,
    });
    return shipment;
  }

  private recordOutcome(shipment: SimShipment, simClockMs: number) {
    if (!this.persistence || !this.snapshot.runId) return;
    try {
      this.persistence.outcomeRecorded(this.runRef, {
        shipmentId: shipment.id,
        deliveredSimMs: Math.max(0, Math.round(simClockMs)),
        deliveredOnTime: shipment.etaVarianceHours <= 0,
        simulatedDelayHours: Math.max(0, shipment.etaVarianceHours),
        finalEtaVarianceHours: shipment.etaVarianceHours,
        finalFeatures: shipment.features,
        interventionCount: shipment.interventionCount,
      });
    } catch {
      // Audit sink unavailable — the run continues.
    }
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
          : request.reason === "intervention"
            ? `Re-scored after ${request.detail} · risk ${(previousRisk ?? 0).toFixed(3)} → ${prediction.probability_late.toFixed(3)} · tier ${tier}`
            : `Scored by ORCA · risk ${prediction.probability_late.toFixed(3)} · tier ${tier} · ${prediction.model_version}${searchSuffix}`;

      const event = makeEvent({
        startedAtEpoch: this.snapshot.startedAtEpoch,
        simClockMs: this.snapshot.simClockMs,
        shipmentId: shipment.id,
        family: request.reason === "initial" ? "MODEL_SCORE" : "MODEL_RESCORE",
        detail,
        provenance:
          request.reason === "initial" ? SIM_PROVENANCE.model : SIM_PROVENANCE.shockResult,
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
      this.audit([event]);

      // /recommend only for meaningful high-risk state changes. When a normal
      // score will open a Decision Episode, the episode write owns the snapshot
      // + inference + recommendation chain so we never race two inference inserts.
      const needsRecommendation =
        prediction.classification_decision || tier === "HIGH_RISK" || tier === "CRITICAL";
      const episodeWillOwnInference = needsRecommendation && request.reason !== "intervention";
      if (!episodeWillOwnInference) {
        try {
          this.persistence?.inferenceRecorded(this.runRef, {
            shipmentId: shipment.id,
            triggerEventId: event.id,
            simClockMs: Math.max(0, Math.round(this.snapshot.simClockMs)),
            inferenceKind:
              request.reason === "initial"
                ? "INITIAL"
                : request.reason === "intervention"
                  ? "POST_INTERVENTION"
                  : "RESCORE",
            features: shipment.features,
            prediction,
            state: {
              shipmentStatus: shipment.status,
              progress: shipment.progress,
              position: shipment.position,
              etaVarianceHours: shipment.etaVarianceHours,
              exceptionOpen: shipment.exceptionOpen,
              exceptionFamily: shipment.exceptionFamily,
            },
          });
        } catch {
          // Audit sink unavailable — model scoring remains authoritative and continues.
        }
      }

      if (needsRecommendation) {
        await this.fetchRecommendation(shipment, port, {
          prediction,
          triggerEventId: event.id,
          // A post-intervention re-score never re-opens a gate: the operator has
          // already answered for this shipment state.
          allowEpisode: request.reason !== "intervention",
          inferenceKind:
            request.reason === "initial"
              ? "INITIAL"
              : request.reason === "intervention"
                ? "POST_INTERVENTION"
                : "RESCORE",
        });
      }
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

  private async fetchRecommendation(
    shipment: SimShipment,
    port: ModelPort,
    options: {
      prediction: PredictResponse;
      triggerEventId: string | null;
      allowEpisode: boolean;
      inferenceKind: "INITIAL" | "RESCORE" | "POST_INTERVENTION";
    },
  ) {
    try {
      const response = await port.recommend(shipment.features);
      // Preserve the backend recommendation verbatim; unknown values stay UNKNOWN.
      const action = parseDecisionAction(response.recommendation);
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
      this.audit([event]);

      // Human-in-the-loop gate. The SIMULATION always requires a decision for a
      // recommendation the operator must answer; `backendApprovalRequired`
      // preserves the backend's own verbatim flag alongside it.
      const needsDecision = options.allowEpisode;
      if (needsDecision && !shipment.awaitingDecision) {
        this.openEpisode(shipment, response, options);
      }
    } catch {
      // A failed /recommend never fabricates an action. Preserve the successful
      // /predict inference independently so the learning audit does not lose it.
      if (options.allowEpisode && options.triggerEventId) {
        try {
          this.persistence?.inferenceRecorded(this.runRef, {
            shipmentId: shipment.id,
            triggerEventId: options.triggerEventId,
            simClockMs: Math.max(0, Math.round(this.snapshot.simClockMs)),
            inferenceKind: options.inferenceKind,
            features: shipment.features,
            prediction: options.prediction,
            state: {
              shipmentStatus: shipment.status,
              progress: shipment.progress,
              position: shipment.position,
              etaVarianceHours: shipment.etaVarianceHours,
              exceptionOpen: shipment.exceptionOpen,
              exceptionFamily: shipment.exceptionFamily,
            },
          });
        } catch {
          // Storage health is reported separately; recommendation failure stays model-layer only.
        }
      }
    }
  }

  /* -------------------- decision episodes -------------------- */

  private openEpisode(
    shipment: SimShipment,
    response: RecommendResponse,
    options: {
      prediction: PredictResponse;
      triggerEventId: string | null;
      inferenceKind: "INITIAL" | "RESCORE" | "POST_INTERVENTION";
    },
  ) {
    this.episodeSequence += 1;
    const localId = `${this.snapshot.runId || "run"}-EP-${String(this.episodeSequence).padStart(4, "0")}`;
    const episode: SimEpisode = {
      id: localId,
      dbId: null,
      runId: this.snapshot.runId,
      shipmentId: shipment.id,
      route: shipment.route,
      triggerEventId: options.triggerEventId,
      openedSimMs: this.snapshot.simClockMs,
      openedAtEpoch: Date.now(),
      recommendedAction: response.recommendation,
      reasons: response.decision_reason,
      backendApprovalRequired: response.human_approval_required,
      riskAtOpen: shipment.model.risk,
      tierAtOpen: shipment.model.tier,
      severityAtOpen: shipment.model.severity_p50,
      modelVersion: shipment.model.model_version,
      status: "PENDING",
      decision: null,
      interventionAudit: [],
    };

    shipment.awaitingDecision = true;
    shipment.episodeId = localId;
    shipment.latestEvent = `Awaiting human decision · ORCA recommends ${response.recommendation}`;

    const gateEvent = makeEvent({
      startedAtEpoch: this.snapshot.startedAtEpoch,
      simClockMs: this.snapshot.simClockMs,
      shipmentId: shipment.id,
      family: "RECOMMENDATION",
      detail: `Decision episode opened · shipment held pending human decision on ${response.recommendation}`,
      provenance: SIM_PROVENANCE.ops,
    });

    this.snapshot = {
      ...this.snapshot,
      version: this.snapshot.version + 1,
      episodes: [episode, ...this.snapshot.episodes].slice(0, SIM_CONFIG.maxEpisodes),
      events: [gateEvent, ...this.snapshot.events].slice(0, SIM_CONFIG.maxEvents),
      metrics: {
        ...this.snapshot.metrics,
        episodesOpened: this.snapshot.metrics.episodesOpened + 1,
      },
    };
    for (const l of this.listeners) l();
    this.audit([gateEvent]);

    // Persist the snapshot → inference → recommendation → episode chain and
    // attach the returned database id. A storage failure leaves dbId null; the
    // gate still works in-memory.
    const persistence = this.persistence;
    if (!persistence) return;
    const run = this.runRef;
    void (async () => {
      try {
        const dbId = await persistence.episodeOpened(run, {
          shipmentId: shipment.id,
          triggerEventId: options.triggerEventId,
          simClockMs: Math.max(0, Math.round(episode.openedSimMs)),
          inferenceKind: options.inferenceKind,
          features: shipment.features,
          prediction: options.prediction,
          recommendation: response,
          state: {
            shipmentStatus: shipment.status,
            progress: shipment.progress,
            position: shipment.position,
            etaVarianceHours: shipment.etaVarianceHours,
            exceptionOpen: shipment.exceptionOpen,
            exceptionFamily: shipment.exceptionFamily,
          },
        });
        if (!dbId) return;
        this.snapshot = {
          ...this.snapshot,
          version: this.snapshot.version + 1,
          episodes: this.snapshot.episodes.map((e) => (e.id === localId ? { ...e, dbId } : e)),
        };
        for (const l of this.listeners) l();
        const persistedEpisode = this.snapshot.episodes.find((e) => e.id === localId);
        if (persistedEpisode) this.persistDecisionForEpisode(run, persistedEpisode);
      } catch {
        // Audit sink unavailable — the episode stays local-only.
      }
    })();
  }

  private persistDecisionForEpisode(run: RunRef, episode: SimEpisode) {
    const decision = episode.decision;
    if (!this.persistence || !episode.dbId || !decision) return;
    const effect = interventionEffect(decision.chosenAction);
    const applied =
      decision.chosenAction !== "NO_ACTION" &&
      decision.chosenAction !== "MONITOR" &&
      decision.chosenAction !== "HUMAN_REVIEW";
    try {
      this.persistence.decisionRecorded(run, {
        episodeDbId: episode.dbId,
        shipmentId: episode.shipmentId,
        decision: decision.kind,
        recommendedAction: episode.recommendedAction,
        chosenAction: decision.chosenAction,
        reasonCode: decision.reasonCode,
        note: decision.note,
        actorLabel: decision.actorLabel,
        decisionLatencyMs: decision.latencyMs,
        intervention: applied
          ? {
              action: decision.chosenAction,
              effectSpec: effectSpec(effect),
              appliedSimMs: Math.max(0, Math.round(decision.decidedSimMs)),
              policyVersion: INTERVENTION_POLICY_VERSION,
            }
          : null,
      });
    } catch {
      // Audit sink unavailable — the human decision remains valid in-memory.
    }
  }

  /**
   * Records a real human decision against an open episode, applies the bounded
   * intervention effect and requeues a real ORCA /predict re-score.
   */
  submitDecision(input: {
    episodeId: string;
    decision: HumanDecisionKind;
    chosenAction: OperatorAction;
    reasonCode: ReasonCode;
    note?: string | null;
    actorLabel?: string;
  }): { ok: boolean; reason?: string } {
    const episode = this.snapshot.episodes.find((e) => e.id === input.episodeId);
    if (!episode) return { ok: false, reason: "Episode not found in this run." };
    if (episode.status === "RESOLVED") return { ok: false, reason: "Episode already resolved." };
    const shipment = this.findShipment(episode.shipmentId);
    if (!shipment) return { ok: false, reason: "Shipment is no longer active." };

    const chosen =
      input.decision === "ACCEPT" || input.decision === "APPROVE"
        ? defaultActionFor(episode.recommendedAction)
        : input.decision === "REJECT"
          ? "NO_ACTION"
          : input.decision === "DEFER"
            ? "MONITOR"
            : input.chosenAction;

    const effect = interventionEffect(chosen);
    const simClockMs = this.snapshot.simClockMs;
    const latencyMs = Math.max(0, Date.now() - episode.openedAtEpoch);
    const actorLabel = input.actorLabel?.trim() || "OP";
    const note = input.note?.trim() ? input.note.trim() : null;

    // Bounded pre-outcome feature edit + synthetic operational effect.
    let audit: string[] = [];
    if (effect.mutatesFeatures) {
      const beforeRaw = shipment.raw;
      const nextRaw = effect.mutate(beforeRaw);
      audit = auditTrail(beforeRaw, nextRaw);
      shipment.raw = nextRaw;
      shipment.features = rowToFeatures(nextRaw);
      shipment.featureAudit = [...shipment.featureAudit, ...audit];
    }
    if (effect.etaRecoveryHours > 0) {
      shipment.etaVarianceHours = Math.max(0, shipment.etaVarianceHours - effect.etaRecoveryHours);
    }
    if (effect.holdReleaseRatio > 0 && shipment.holdMs > 0) {
      shipment.holdMs = Math.round(shipment.holdMs * (1 - effect.holdReleaseRatio));
      if (shipment.holdMs <= 0) {
        shipment.holdMs = 0;
        shipment.exceptionOpen = false;
        shipment.exceptionFamily = null;
      }
    }

    const applied = chosen !== "NO_ACTION" && chosen !== "MONITOR" && chosen !== "HUMAN_REVIEW";
    if (applied) shipment.interventionCount += 1;

    // Release the gate — the shipment resumes moving.
    shipment.awaitingDecision = false;
    shipment.episodeId = null;
    shipment.latestEvent = `Human decision ${input.decision} · ${chosen}`;

    const decisionEvent = makeEvent({
      startedAtEpoch: this.snapshot.startedAtEpoch,
      simClockMs,
      shipmentId: shipment.id,
      family: "RECOMMENDATION",
      detail: `Human decision ${input.decision} by ${actorLabel} · ORCA recommended ${episode.recommendedAction} · chosen ${chosen} · ${input.reasonCode}`,
      provenance: "HUMAN DECISION ON SYNTHETIC SIMULATION",
    });
    const interventionEvent = applied
      ? makeEvent({
          startedAtEpoch: this.snapshot.startedAtEpoch,
          simClockMs,
          shipmentId: shipment.id,
          family: "RECOVERY",
          detail: `Intervention applied · ${effect.label} · ${effect.description}`,
          provenance: SIM_PROVENANCE.shockInput,
          ...(audit.length > 0 ? { featureAudit: audit } : {}),
        })
      : null;
    const events = interventionEvent ? [interventionEvent, decisionEvent] : [decisionEvent];

    const resolved = {
      ...episode,
      status: "RESOLVED" as const,
      interventionAudit: audit,
      decision: {
        kind: input.decision,
        recommendedAction: episode.recommendedAction,
        chosenAction: chosen,
        reasonCode: input.reasonCode,
        note,
        actorLabel,
        decidedSimMs: simClockMs,
        latencyMs,
      },
    };

    this.snapshot = {
      ...this.snapshot,
      version: this.snapshot.version + 1,
      episodes: this.snapshot.episodes.map((e) => (e.id === episode.id ? resolved : e)),
      events: [...events.reverse(), ...this.snapshot.events].slice(0, SIM_CONFIG.maxEvents),
      metrics: {
        ...this.snapshot.metrics,
        decisionsRecorded: this.snapshot.metrics.decisionsRecorded + 1,
        interventionsApplied: this.snapshot.metrics.interventionsApplied + (applied ? 1 : 0),
      },
    };
    for (const l of this.listeners) l();
    this.audit(events);

    // The server endpoint is idempotent. If the episode DB id is still in
    // flight, openEpisode() calls the same helper as soon as it arrives.
    const resolvedEpisode = this.snapshot.episodes.find((e) => e.id === episode.id);
    if (resolvedEpisode) this.persistDecisionForEpisode(this.runRef, resolvedEpisode);

    // Every intervention is followed by a REAL ORCA /predict re-score.
    if (applied) {
      shipment.lastScoreRequestAt = simClockMs;
      this.enqueueScore({
        shipmentId: shipment.id,
        reason: "intervention",
        audit,
        detail: `human intervention ${chosen}`,
      });
      this.pump();
    }

    return { ok: true };
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
