/**
 * ORCA Human-in-the-Loop Learning System — read-only inference diagnostics.
 *
 * Returns recent persisted REAL model inferences with their verbatim ORCA
 * recommendation (when one was recorded), which is what the Resolution Hub uses
 * for persisted before → after evidence and model metadata.
 *
 * READ-ONLY. Risk, tier, severity, and recommendations are never derived here —
 * every value is exactly what the backend returned and what was stored.
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

export interface PersistedInference {
  inferenceId: string;
  runId: string;
  shipmentId: string;
  inferenceKind: string;
  simClockMs: number;
  createdAt: string;
  triggerEventId: string | null;
  stateSnapshotId: string | null;
  probabilityLate: number;
  classificationDecision: boolean;
  decisionThreshold: number;
  riskTier: string;
  severityP50: number;
  severityInterval90: unknown;
  modelVersion: string;
  predictionContractVersion: string;
  featureSchemaVersion: string;
  evidenceLabel: string;
  features: unknown;
  recommendation: {
    recommendation: string;
    decisionReason: unknown;
    expectedImpactType: string;
    robustness: string;
    backendHumanApprovalRequired: boolean;
    evidenceLabel: string;
    createdAt: string;
  } | null;
}

const SELECT = `
  id, run_id, shipment_id, inference_kind, sim_clock_ms, created_at,
  trigger_event_id, state_snapshot_id, probability_late, classification_decision,
  decision_threshold, risk_tier, severity_p50, severity_interval_90,
  model_version, prediction_contract_version, feature_schema_version,
  evidence_label, features,
  orca_model_recommendations (
    recommendation, decision_reason, expected_impact_type, robustness,
    backend_human_approval_required, evidence_label, created_at
  )
`;

export const Route = createFileRoute("/api/learning-inference")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const runId = url.searchParams.get("runId");
        const shipmentId = url.searchParams.get("shipmentId");
        const includeFeatures = url.searchParams.get("features") === "1";
        const limitParam = Number(url.searchParams.get("limit") ?? "50");
        const limit = Number.isFinite(limitParam)
          ? Math.min(Math.max(Math.trunc(limitParam), 1), 200)
          : 50;

        try {
          const db = await admin();

          let query = db
            .from("orca_model_inferences")
            .select(SELECT)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (runId) query = query.eq("run_id", runId);
          if (shipmentId) query = query.eq("shipment_id", shipmentId);

          const { data, error } = await query;
          if (error) throw new Error(detailOf(error));

          /* eslint-disable @typescript-eslint/no-explicit-any */
          const inferences = ((data ?? []) as any[]).map((row): PersistedInference => {
            const rec = Array.isArray(row.orca_model_recommendations)
              ? (row.orca_model_recommendations[0] ?? null)
              : (row.orca_model_recommendations ?? null);
            return {
              inferenceId: row.id,
              runId: row.run_id,
              shipmentId: row.shipment_id,
              inferenceKind: row.inference_kind,
              simClockMs: row.sim_clock_ms,
              createdAt: row.created_at,
              triggerEventId: row.trigger_event_id,
              stateSnapshotId: row.state_snapshot_id,
              probabilityLate: row.probability_late,
              classificationDecision: row.classification_decision,
              decisionThreshold: row.decision_threshold,
              riskTier: row.risk_tier,
              severityP50: row.severity_p50,
              severityInterval90: row.severity_interval_90,
              modelVersion: row.model_version,
              predictionContractVersion: row.prediction_contract_version,
              featureSchemaVersion: row.feature_schema_version,
              evidenceLabel: row.evidence_label,
              features: includeFeatures ? row.features : null,
              recommendation: rec
                ? {
                    recommendation: rec.recommendation,
                    decisionReason: rec.decision_reason,
                    expectedImpactType: rec.expected_impact_type,
                    robustness: rec.robustness,
                    backendHumanApprovalRequired: rec.backend_human_approval_required,
                    evidenceLabel: rec.evidence_label,
                    createdAt: rec.created_at,
                  }
                : null,
            };
          });
          /* eslint-enable @typescript-eslint/no-explicit-any */

          const modelVersions = Array.from(new Set(inferences.map((i) => i.modelVersion)));

          return Response.json({
            ok: true,
            generatedAt: new Date().toISOString(),
            runId: runId ?? null,
            shipmentId: shipmentId ?? null,
            count: inferences.length,
            modelVersions,
            inferences,
          });
        } catch (error) {
          return Response.json(
            { ok: false, error: "INFERENCE_READ_FAILED", detail: detailOf(error) },
            { status: 500 },
          );
        }
      },
    },
  },
});
