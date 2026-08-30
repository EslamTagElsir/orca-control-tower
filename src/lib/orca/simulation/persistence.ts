/**
 * Browser-side adapter between the simulation engine's append-only audit port
 * and the same-origin Learning DB server API under `/api/learning/*`.
 *
 * The Supabase service role never reaches this bundle. Every request crosses a
 * TanStack server route that validates the payload and performs the privileged
 * database write. Writes remain fire-and-forget so a storage outage can never
 * block model scoring or the simulation clock.
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

export type LearningDbStatus = "connected" | "degraded" | "unavailable";

export interface LearningDbHealth {
  status: LearningDbStatus;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
}

const healthListeners = new Set<() => void>();
let health: LearningDbHealth = {
  status: "degraded",
  lastSuccessAt: null,
  lastErrorAt: null,
  lastError: null,
};

export function getLearningDbHealth(): LearningDbHealth {
  return health;
}

export function subscribeLearningDbHealth(listener: () => void): () => void {
  healthListeners.add(listener);
  return () => healthListeners.delete(listener);
}

function publishHealth(next: LearningDbHealth) {
  health = next;
  for (const listener of healthListeners) listener();
}

function markSuccess() {
  publishHealth({
    status: "connected",
    lastSuccessAt: Date.now(),
    lastErrorAt: health.lastErrorAt,
    lastError: health.lastError,
  });
}

function markFailure(error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 300) : "Unknown Learning DB error";
  publishHealth({
    status: health.lastSuccessAt === null ? "unavailable" : "degraded",
    lastSuccessAt: health.lastSuccessAt,
    lastErrorAt: Date.now(),
    lastError: message,
  });
}

async function learningRequest<T>(path: string, body?: unknown, method: "GET" | "POST" = "POST") {
  const response = await fetch(`/api/learning/${path}`, {
    method,
    headers: method === "POST" ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });

  const payload = (await response.json().catch(() => null)) as
    | ({ detail?: string; error?: string } & T)
    | null;

  if (!response.ok) {
    const detail = payload?.detail ?? payload?.error ?? `Learning DB request failed (${response.status})`;
    throw new Error(detail);
  }
  markSuccess();
  return payload as T;
}

function tracked(promise: Promise<unknown>) {
  void promise.catch((error) => {
    markFailure(error);
    console.warn("[Learning DB] persistence write failed", error);
  });
}

export async function testLearningDbConnection(): Promise<LearningDbHealth> {
  try {
    await learningRequest<{ status: "connected" }>("health", undefined, "GET");
  } catch (error) {
    markFailure(error);
  }
  return health;
}

export function createLearningPersistencePort(): PersistencePort {
  return {
    runStarted(run: RunRef) {
      tracked(learningRequest("run/start", run));
    },

    runEnded(runId: string, status: "PAUSED" | "STOPPED") {
      tracked(learningRequest("run/end", { runId, status }));
    },

    shipmentsCreated(run: RunRef, shipments: PersistedShipment[]) {
      if (shipments.length === 0) return;
      tracked(learningRequest("shipments", { run, shipments }));
    },

    eventsAppended(run: RunRef, events: SimEvent[]) {
      if (events.length === 0) return;
      tracked(
        learningRequest("events", {
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

    async episodeOpened(run: RunRef, payload: EpisodeOpenPayload): Promise<string | null> {
      try {
        const result = await learningRequest<{ episodeId: string }>("episode", {
          run,
          shipmentId: payload.shipmentId,
          triggerEventId: payload.triggerEventId,
          simClockMs: payload.simClockMs,
          inferenceKind: payload.inferenceKind,
          features: payload.features,
          prediction: {
            probability_late: payload.prediction.probability_late,
            classification_decision: payload.prediction.classification_decision,
            decision_threshold: payload.prediction.decision_threshold,
            risk_tier: payload.prediction.risk_tier,
            severity_p50: payload.prediction.severity_p50,
            severity_interval_90: payload.prediction.severity_interval_90,
            model_version: payload.prediction.model_version,
            prediction_contract_version: payload.prediction.prediction_contract_version,
          },
          recommendation: {
            recommendation: payload.recommendation.recommendation,
            decision_reason: payload.recommendation.decision_reason,
            expected_impact_type: payload.recommendation.expected_impact_type,
            robustness: payload.recommendation.robustness,
            human_approval_required: payload.recommendation.human_approval_required,
          },
          state: payload.state,
        });
        return result.episodeId;
      } catch (error) {
        markFailure(error);
        console.warn("[Learning DB] decision episode write failed", error);
        return null;
      }
    },

    decisionRecorded(run: RunRef, payload: DecisionPayload) {
      tracked(
        learningRequest("decision", {
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
      tracked(learningRequest("outcome", { run, ...payload }));
    },
  };
}
