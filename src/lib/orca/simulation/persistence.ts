/**
 * Browser-side adapter between the simulation engine's append-only audit port
 * and the same-origin learning API in `src/routes/api/learning/$.ts`.
 *
 * The browser NEVER imports the server-only Supabase admin client: every write
 * is an ordinary same-origin `fetch` to `/api/learning/*`, and the service role
 * key stays on the server.
 *
 * Every write is fire-and-forget and must never throw into the simulation: a
 * storage outage degrades the audit trail, never the running twin. Nothing here
 * derives a model value — it forwards verbatim /predict and /recommend payloads
 * plus synthetic operational state, provenance preserved exactly.
 */

import type {
  DecisionPayload,
  EpisodeOpenPayload,
  OutcomePayload,
  PersistedShipment,
  PersistencePort,
  RunRef,
} from "./engine";
import type { SimEvent } from "./types";
import type { FeatureMap } from "./types";
import type { PredictResponse } from "@/lib/orca/types";

/* ------------------------------------------------------------------ */
/* Learning DB health                                                  */
/* ------------------------------------------------------------------ */

/** Public health vocabulary surfaced to the UI. */
export type LearningDbStatus = "connected" | "degraded" | "unavailable";

export interface LearningDbHealth {
  status: LearningDbStatus;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

/**
 * Internal state. Before any call has been made we have no evidence either way,
 * so we must not claim `connected`; we report `degraded` (unknown) until a real
 * probe or write resolves it.
 */
let sawSuccess = false;

let health: LearningDbHealth = {
  status: "degraded",
  lastSuccessAt: null,
  lastErrorAt: null,
  lastError: null,
};

type HealthListener = (health: LearningDbHealth) => void;
const listeners = new Set<HealthListener>();

function emit() {
  for (const listener of listeners) {
    try {
      listener(health);
    } catch {
      // A misbehaving subscriber must not affect persistence.
    }
  }
}

function markSuccess() {
  sawSuccess = true;
  health = { ...health, status: "connected", lastSuccessAt: new Date().toISOString() };
  emit();
}

function markFailure(error: unknown) {
  const detail =
    error instanceof Error ? error.message : String(error ?? "unknown learning API error");
  health = {
    // No success has ever been observed => the audit sink is unavailable.
    // A failure after a success is a partial outage => degraded.
    status: sawSuccess ? "degraded" : "unavailable",
    lastSuccessAt: health.lastSuccessAt,
    lastErrorAt: new Date().toISOString(),
    lastError: detail.slice(0, 300),
  };
  emit();
}

export function getLearningDbHealth(): LearningDbHealth {
  return health;
}

export function subscribeLearningDbHealth(listener: HealthListener): () => void {
  listeners.add(listener);
  listener(health);
  return () => {
    listeners.delete(listener);
  };
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

async function postLearning<T = Record<string, unknown>>(
  path: string,
  body: unknown,
): Promise<T | null> {
  try {
    const response = await fetch(`/api/learning/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as
      | (Record<string, unknown> & { detail?: string })
      | null;
    if (!response.ok) {
      throw new Error(payload?.detail ?? `POST /api/learning/${path} failed (${response.status})`);
    }
    markSuccess();
    return (payload ?? {}) as T;
  } catch (error) {
    markFailure(error);
    return null;
  }
}

/** Fire-and-forget wrapper: never rejects, never throws into the simulation. */
function swallow(promise: Promise<unknown>) {
  void promise.catch(() => {
    // Audit sink unavailable — health already recorded, intentionally ignored.
  });
}

/** Probes `/api/learning/health` and folds the result into the health state. */
export async function testLearningDbConnection(): Promise<LearningDbHealth> {
  try {
    const response = await fetch("/api/learning/health", { method: "GET" });
    const payload = (await response.json().catch(() => null)) as
      | { connected?: boolean; detail?: string }
      | null;
    if (!response.ok || !payload?.connected) {
      throw new Error(payload?.detail ?? `Learning DB health check failed (${response.status})`);
    }
    markSuccess();
  } catch (error) {
    markFailure(error);
  }
  return health;
}

/* ------------------------------------------------------------------ */
/* Port                                                                */
/* ------------------------------------------------------------------ */

/** A REAL ORCA /predict result persisted outside a decision episode. */
export interface InferencePayload {
  shipmentId: string;
  triggerEventId: string | null;
  simClockMs: number;
  inferenceKind: "INITIAL" | "RESCORE" | "POST_INTERVENTION";
  features: FeatureMap;
  prediction: PredictResponse;
  state: EpisodeOpenPayload["state"];
}

/** Engine port plus the standalone inference channel used by re-scores. */
export interface LearningPersistencePort extends PersistencePort {
  inferenceRecorded(run: RunRef, payload: InferencePayload): void;
}

function predictionBody(prediction: PredictResponse) {
  return {
    probability_late: prediction.probability_late,
    classification_decision: prediction.classification_decision,
    decision_threshold: prediction.decision_threshold,
    risk_tier: prediction.risk_tier,
    severity_p50: prediction.severity_p50,
    severity_interval_90: prediction.severity_interval_90,
    model_version: prediction.model_version,
    prediction_contract_version: prediction.prediction_contract_version,
  };
}

export function createLearningPersistencePort(): LearningPersistencePort {
  return {
    runStarted(run: RunRef) {
      swallow(postLearning("run/start", run));
    },

    runEnded(runId: string, status: "PAUSED" | "STOPPED") {
      swallow(postLearning("run/end", { runId, status }));
    },

    shipmentsCreated(run: RunRef, shipments: PersistedShipment[]) {
      if (shipments.length === 0) return;
      swallow(postLearning("shipments", { run, shipments: shipments.slice(0, 40) }));
    },

    eventsAppended(run: RunRef, events: SimEvent[]) {
      if (events.length === 0) return;
      swallow(
        postLearning("events", {
          run,
          events: events.slice(0, 120).map((e) => ({
            eventId: e.id,
            shipmentId: e.shipmentId,
            family: e.family,
            eventType: e.eventType,
            simClockMs: Math.max(0, Math.round(e.at)),
            detail: e.detail.slice(0, 2000),
            provenance: e.provenance.slice(0, 200),
            riskBefore: e.riskBefore ?? null,
            riskAfter: e.riskAfter ?? null,
            ...(e.featureAudit && e.featureAudit.length > 0
              ? { featureAudit: e.featureAudit.slice(0, 60).map((a) => a.slice(0, 400)) }
              : {}),
          })),
        }),
      );
    },

    inferenceRecorded(run: RunRef, payload: InferencePayload) {
      swallow(
        postLearning("inference", {
          run,
          shipmentId: payload.shipmentId,
          triggerEventId: payload.triggerEventId,
          simClockMs: payload.simClockMs,
          inferenceKind: payload.inferenceKind,
          features: payload.features,
          prediction: predictionBody(payload.prediction),
          state: payload.state,
        }),
      );
    },

    /** The one awaited method: the engine needs the episode DB id. */
    async episodeOpened(run: RunRef, payload: EpisodeOpenPayload): Promise<string | null> {
      const result = await postLearning<{ episodeId?: string }>("episode", {
        run,
        shipmentId: payload.shipmentId,
        triggerEventId: payload.triggerEventId,
        simClockMs: payload.simClockMs,
        inferenceKind: payload.inferenceKind,
        features: payload.features,
        prediction: predictionBody(payload.prediction),
        recommendation: {
          recommendation: payload.recommendation.recommendation,
          decision_reason: payload.recommendation.decision_reason,
          expected_impact_type: payload.recommendation.expected_impact_type,
          robustness: payload.recommendation.robustness,
          human_approval_required: payload.recommendation.human_approval_required,
        },
        state: payload.state,
      });
      return result?.episodeId ?? null;
    },

    decisionRecorded(run: RunRef, payload: DecisionPayload) {
      swallow(
        postLearning("decision", {
          run,
          episodeId: payload.episodeDbId,
          shipmentId: payload.shipmentId,
          decision: payload.decision,
          recommendedAction: payload.recommendedAction,
          chosenAction: payload.chosenAction,
          reasonCode: payload.reasonCode,
          note: payload.note,
          actorLabel: payload.actorLabel,
          decisionLatencyMs: payload.decisionLatencyMs,
          intervention: payload.intervention,
        }),
      );
    },

    outcomeRecorded(run: RunRef, payload: OutcomePayload) {
      swallow(postLearning("outcome", { run, ...payload }));
    },
  };
}
