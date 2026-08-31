/**
 * ORCA Human-in-the-Loop Learning System — read-only persisted audit view.
 *
 * Serves the Resolution Hub's persisted history: the latest simulation runs and
 * their decision episodes with the verbatim model inference, verbatim ORCA
 * recommendation, the human decision, any bounded intervention, and the final
 * simulated outcome. Plus readiness totals computed purely from persisted rows.
 *
 * READ-ONLY: this route never mutates data. Errors are explicit — it never
 * pretends persistence exists when the database is unreachable.
 */

import { createFileRoute } from "@tanstack/react-router";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function detailOf(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message).slice(0, 300);
  }
  return String(error).slice(0, 300);
}

export interface LearningAuditRun {
  runId: string;
  seed: number;
  speed: number;
  status: string;
  startedAt: string;
  endedAt: string | null;
  provenance: string;
  simulatorVersion: string;
}

export interface LearningAuditEpisode {
  episodeId: string;
  runId: string;
  shipmentId: string;
  openedAt: string;
  openedSimMs: number;
  provenance: string;
  simulationHumanDecisionRequired: boolean;
  inference: {
    inferenceId: string;
    inferenceKind: string;
    probabilityLate: number;
    classificationDecision: boolean;
    decisionThreshold: number;
    riskTier: string;
    severityP50: number;
    modelVersion: string;
    predictionContractVersion: string;
    evidenceLabel: string;
  } | null;
  recommendation: {
    recommendation: string;
    decisionReason: unknown;
    expectedImpactType: string;
    robustness: string;
    backendHumanApprovalRequired: boolean;
    evidenceLabel: string;
  } | null;
  humanDecision: {
    decision: string;
    recommendedAction: string;
    chosenAction: string;
    reasonCode: string;
    note: string | null;
    actorLabel: string;
    decisionLatencyMs: number;
    decidedAt: string;
    provenance: string;
  } | null;
  intervention: {
    action: string;
    effectSpec: unknown;
    appliedSimMs: number;
    simulatorPolicyVersion: string;
    provenance: string;
  } | null;
  outcome: {
    deliveredOnTime: boolean;
    deliveredSimMs: number;
    simulatedDelayHours: number;
    finalEtaVarianceHours: number;
    interventionCount: number;
    provenance: string;
  } | null;
}

type CountKey =
  | "runs"
  | "shipments"
  | "events"
  | "snapshots"
  | "inferences"
  | "recommendations"
  | "episodes"
  | "decisions"
  | "interventions"
  | "outcomes";

const COUNT_TABLES: Record<CountKey, string> = {
  runs: "orca_simulation_runs",
  shipments: "orca_simulation_shipments",
  events: "orca_simulation_events",
  snapshots: "orca_state_snapshots",
  inferences: "orca_model_inferences",
  recommendations: "orca_model_recommendations",
  episodes: "orca_decision_episodes",
  decisions: "orca_human_decisions",
  interventions: "orca_simulation_interventions",
  outcomes: "orca_simulation_outcomes",
};

const EPISODE_SELECT = `
  id, run_id, shipment_id, opened_at, opened_sim_ms, provenance,
  simulation_human_decision_required,
  orca_model_inferences (
    id, inference_kind, probability_late, classification_decision, decision_threshold,
    risk_tier, severity_p50, model_version, prediction_contract_version, evidence_label
  ),
  orca_model_recommendations (
    recommendation, decision_reason, expected_impact_type, robustness,
    backend_human_approval_required, evidence_label
  ),
  orca_human_decisions (
    decision, recommended_action, chosen_action, reason_code, note,
    actor_label, decision_latency_ms, decided_at, provenance
  ),
  orca_simulation_interventions (
    action, effect_spec, applied_sim_ms, simulator_policy_version, provenance
  )
`;

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapEpisode(
  row: any,
  outcomes: Map<string, any>,
): LearningAuditEpisode {
  const inference = row.orca_model_inferences ?? null;
  const recommendation = row.orca_model_recommendations ?? null;
  const decision = Array.isArray(row.orca_human_decisions)
    ? (row.orca_human_decisions[0] ?? null)
    : (row.orca_human_decisions ?? null);
  const intervention = Array.isArray(row.orca_simulation_interventions)
    ? (row.orca_simulation_interventions[0] ?? null)
    : (row.orca_simulation_interventions ?? null);
  const outcome = outcomes.get(`${row.run_id}::${row.shipment_id}`) ?? null;

  return {
    episodeId: row.id,
    runId: row.run_id,
    shipmentId: row.shipment_id,
    openedAt: row.opened_at,
    openedSimMs: row.opened_sim_ms,
    provenance: row.provenance,
    simulationHumanDecisionRequired: row.simulation_human_decision_required,
    inference: inference
      ? {
          inferenceId: inference.id,
          inferenceKind: inference.inference_kind,
          probabilityLate: inference.probability_late,
          classificationDecision: inference.classification_decision,
          decisionThreshold: inference.decision_threshold,
          riskTier: inference.risk_tier,
          severityP50: inference.severity_p50,
          modelVersion: inference.model_version,
          predictionContractVersion: inference.prediction_contract_version,
          evidenceLabel: inference.evidence_label,
        }
      : null,
    recommendation: recommendation
      ? {
          recommendation: recommendation.recommendation,
          decisionReason: recommendation.decision_reason,
          expectedImpactType: recommendation.expected_impact_type,
          robustness: recommendation.robustness,
          backendHumanApprovalRequired: recommendation.backend_human_approval_required,
          evidenceLabel: recommendation.evidence_label,
        }
      : null,
    humanDecision: decision
      ? {
          decision: decision.decision,
          recommendedAction: decision.recommended_action,
          chosenAction: decision.chosen_action,
          reasonCode: decision.reason_code,
          note: decision.note,
          actorLabel: decision.actor_label,
          decisionLatencyMs: decision.decision_latency_ms,
          decidedAt: decision.decided_at,
          provenance: decision.provenance,
        }
      : null,
    intervention: intervention
      ? {
          action: intervention.action,
          effectSpec: intervention.effect_spec,
          appliedSimMs: intervention.applied_sim_ms,
          simulatorPolicyVersion: intervention.simulator_policy_version,
          provenance: intervention.provenance,
        }
      : null,
    outcome: outcome
      ? {
          deliveredOnTime: outcome.delivered_on_time,
          deliveredSimMs: outcome.delivered_sim_ms,
          simulatedDelayHours: outcome.simulated_delay_hours,
          finalEtaVarianceHours: outcome.final_eta_variance_hours,
          interventionCount: outcome.intervention_count,
          provenance: outcome.provenance,
        }
      : null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const Route = createFileRoute("/api/learning-audit")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const runId = url.searchParams.get("runId");
        const limitParam = Number(url.searchParams.get("limit") ?? "40");
        const limit = Number.isFinite(limitParam)
          ? Math.min(Math.max(Math.trunc(limitParam), 1), 100)
          : 40;

        try {
          const db = await admin();

          const { data: runs, error: runsError } = await db
            .from("orca_simulation_runs")
            .select("run_id, seed, speed, status, started_at, ended_at, provenance, simulator_version")
            .order("started_at", { ascending: false })
            .limit(10);
          if (runsError) throw new Error(detailOf(runsError));

          let episodeQuery = db
            .from("orca_decision_episodes")
            .select(EPISODE_SELECT)
            .order("opened_at", { ascending: false })
            .limit(limit);
          if (runId) episodeQuery = episodeQuery.eq("run_id", runId);

          const { data: episodeRows, error: episodeError } = await episodeQuery;
          if (episodeError) throw new Error(detailOf(episodeError));

          const rows = (episodeRows ?? []) as unknown as Record<string, unknown>[];
          const shipmentIds = Array.from(
            new Set(rows.map((r) => String(r["shipment_id"] ?? ""))),
          ).filter(Boolean);

          const outcomes = new Map<string, Record<string, unknown>>();
          if (shipmentIds.length > 0) {
            let outcomeQuery = db
              .from("orca_simulation_outcomes")
              .select(
                "run_id, shipment_id, delivered_on_time, delivered_sim_ms, simulated_delay_hours, final_eta_variance_hours, intervention_count, provenance",
              )
              .in("shipment_id", shipmentIds);
            if (runId) outcomeQuery = outcomeQuery.eq("run_id", runId);
            const { data: outcomeRows, error: outcomeError } = await outcomeQuery;
            if (outcomeError) throw new Error(detailOf(outcomeError));
            for (const o of outcomeRows ?? []) {
              outcomes.set(`${o.run_id}::${o.shipment_id}`, o);
            }
          }

          const countEntries = await Promise.all(
            (Object.keys(COUNT_TABLES) as CountKey[]).map(async (key) => {
              const { count, error } = await db
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from(COUNT_TABLES[key] as any)
                .select("*", { count: "exact", head: true });
              if (error) throw new Error(detailOf(error));
              return [key, count ?? 0] as const;
            }),
          );
          const counts = Object.fromEntries(countEntries) as Record<CountKey, number>;

          return Response.json({
            ok: true,
            generatedAt: new Date().toISOString(),
            runId: runId ?? null,
            runs: (runs ?? []).map(
              (r): LearningAuditRun => ({
                runId: r.run_id,
                seed: r.seed,
                speed: r.speed,
                status: r.status,
                startedAt: r.started_at,
                endedAt: r.ended_at,
                provenance: r.provenance,
                simulatorVersion: r.simulator_version,
              }),
            ),
            episodes: rows.map((row) => mapEpisode(row, outcomes)),
            counts,
            readiness: {
              // Persisted evidence only. Nothing here implies a model was
              // trained or retrained from these rows.
              decisionsRecorded: counts.decisions,
              episodesOpened: counts.episodes,
              inferencesCaptured: counts.inferences,
              interventionsApplied: counts.interventions,
              outcomesObserved: counts.outcomes,
              labelledEpisodes: Math.min(counts.decisions, counts.episodes),
            },
          });
        } catch (error) {
          return Response.json(
            { ok: false, error: "AUDIT_READ_FAILED", detail: detailOf(error) },
            { status: 500 },
          );
        }
      },
    },
  },
});
