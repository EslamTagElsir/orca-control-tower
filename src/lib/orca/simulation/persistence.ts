/**
 * Browser-side adapter between the simulation engine's append-only audit port
 * and the server functions in `src/lib/orca/learning.functions.ts`.
 *
 * Every write is fire-and-forget: a storage outage degrades the audit trail but
 * never the running simulation. Nothing here derives a model value — it forwards
 * verbatim /predict and /recommend payloads plus synthetic operational state.
 */

import {
  endSimulationRun,
  openDecisionEpisode,
  persistEvents,
  persistOutcome,
  persistShipments,
  recordHumanDecision,
  startSimulationRun,
} from "../learning.functions";
import type {
  DecisionPayload,
  EpisodeOpenPayload,
  OutcomePayload,
  PersistedShipment,
  PersistencePort,
  RunRef,
} from "./engine";
import type { SimEvent } from "./types";

function swallow(promise: Promise<unknown>) {
  void promise.catch(() => {
    // Audit sink unavailable — intentionally ignored.
  });
}

export function createLearningPersistencePort(): PersistencePort {
  return {
    runStarted(run: RunRef) {
      swallow(startSimulationRun({ data: run }));
    },

    runEnded(runId: string, status: "PAUSED" | "STOPPED") {
      swallow(endSimulationRun({ data: { runId, status } }));
    },

    shipmentsCreated(run: RunRef, shipments: PersistedShipment[]) {
      if (shipments.length === 0) return;
      swallow(persistShipments({ data: { run, shipments } }));
    },

    eventsAppended(run: RunRef, events: SimEvent[]) {
      if (events.length === 0) return;
      swallow(
        persistEvents({
          data: {
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
          },
        }),
      );
    },

    async episodeOpened(run: RunRef, payload: EpisodeOpenPayload): Promise<string | null> {
      try {
        const result = await openDecisionEpisode({
          data: {
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
          },
        });
        return result.episodeId;
      } catch {
        return null;
      }
    },

    decisionRecorded(run: RunRef, payload: DecisionPayload) {
      swallow(
        recordHumanDecision({
          data: {
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
          },
        }),
      );
    },

    outcomeRecorded(run: RunRef, payload: OutcomePayload) {
      swallow(persistOutcome({ data: { run, ...payload } }));
    },
  };
}
