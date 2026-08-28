/**
 * ORCA Human-in-the-Loop Learning System — persistence boundary.
 *
 * Every write here is an APPEND-ONLY audit record of the running Operational
 * Digital Twin. The tables are locked at the database level (RLS on, no
 * policies, no browser grants); only these trusted server handlers can reach
 * them through the service-role client.
 *
 * PROVENANCE CONTRACT: this module stores values, it never derives them.
 * Model fields are the verbatim ORCA /predict and /recommend payloads; the
 * simulation fields are SYNTHETIC LIVE OPERATIONS; human decisions are real
 * decisions recorded against a synthetic simulation.
 */

import { createServerFn } from "@tanstack/react-start";
import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

const runSchema = z.object({
  runId: z.string().min(1).max(64),
  seed: z.number().int(),
  speed: z.number().int().min(1).max(120),
});

const featuresSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

const eventSchema = z.object({
  eventId: z.string().min(1).max(64),
  shipmentId: z.string().min(1).max(64),
  family: z.string().min(1).max(48),
  eventType: z.string().min(1).max(24),
  simClockMs: z.number().int().min(0),
  detail: z.string().min(1).max(2000),
  provenance: z.string().min(1).max(200),
  riskBefore: z.number().nullable().optional(),
  riskAfter: z.number().nullable().optional(),
  featureAudit: z.array(z.string().max(400)).max(60).optional(),
});

const predictionSchema = z.object({
  probability_late: z.number(),
  classification_decision: z.boolean(),
  decision_threshold: z.number(),
  risk_tier: z.string().min(1).max(24),
  severity_p50: z.number(),
  severity_interval_90: z.tuple([z.number(), z.number()]),
  model_version: z.string().min(1).max(64),
  prediction_contract_version: z.string().min(1).max(64),
});

const stateSchema = z.object({
  shipmentStatus: z.string().min(1).max(32),
  progress: z.number(),
  position: z.tuple([z.number(), z.number()]),
  etaVarianceHours: z.number(),
  exceptionOpen: z.boolean(),
  exceptionFamily: z.string().max(48).nullable(),
});

/* ------------------------------------------------------------------ */
/* Run lifecycle                                                       */
/* ------------------------------------------------------------------ */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Idempotently records the run header so foreign keys resolve. */
async function ensureRun(
  db: Awaited<ReturnType<typeof admin>>,
  run: z.infer<typeof runSchema>,
): Promise<void> {
  await db
    .from("orca_simulation_runs")
    .upsert(
      { run_id: run.runId, seed: run.seed, status: "RUNNING", speed: run.speed },
      { onConflict: "run_id", ignoreDuplicates: true },
    );
}

export const startSimulationRun = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => runSchema.parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    await ensureRun(db, data);
    return { ok: true };
  });

export const endSimulationRun = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ runId: z.string().min(1).max(64), status: z.enum(["PAUSED", "STOPPED"]) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    await db
      .from("orca_simulation_runs")
      .update({ status: data.status, ended_at: new Date().toISOString() })
      .eq("run_id", data.runId);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Shipments + events                                                  */
/* ------------------------------------------------------------------ */

export const persistShipments = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        run: runSchema,
        shipments: z
          .array(
            z.object({
              shipmentId: z.string().min(1).max(64),
              templateId: z.string().min(1).max(64),
              origin: z.string().max(160),
              destination: z.string().max(160),
              route: z.string().max(320),
              mode: z.string().max(64),
              vendor: z.string().max(240).nullable(),
              productGroup: z.string().max(160).nullable(),
              createdSimMs: z.number().int().min(0),
              initialFeatures: featuresSchema,
            }),
          )
          .min(1)
          .max(40),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    await ensureRun(db, data.run);
    await db.from("orca_simulation_shipments").insert(
      data.shipments.map((s) => ({
        run_id: data.run.runId,
        shipment_id: s.shipmentId,
        template_id: s.templateId,
        origin: s.origin,
        destination: s.destination,
        route: s.route,
        mode: s.mode,
        vendor: s.vendor,
        product_group: s.productGroup,
        created_sim_ms: s.createdSimMs,
        initial_features: s.initialFeatures,
      })),
    );
    return { ok: true };
  });

export const persistEvents = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ run: runSchema, events: z.array(eventSchema).min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    await ensureRun(db, data.run);
    await db.from("orca_simulation_events").insert(
      data.events.map((e) => ({
        run_id: data.run.runId,
        shipment_id: e.shipmentId,
        event_id: e.eventId,
        family: e.family,
        event_type: e.eventType,
        sim_clock_ms: e.simClockMs,
        detail: e.detail,
        risk_before: e.riskBefore ?? null,
        risk_after: e.riskAfter ?? null,
        feature_audit: e.featureAudit ?? null,
        provenance: e.provenance,
      })),
    );
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Decision episode: snapshot → inference → recommendation → episode   */
/* ------------------------------------------------------------------ */

export const openDecisionEpisode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        run: runSchema,
        shipmentId: z.string().min(1).max(64),
        triggerEventId: z.string().max(64).nullable(),
        simClockMs: z.number().int().min(0),
        inferenceKind: z.enum(["INITIAL", "RESCORE", "POST_INTERVENTION"]),
        features: featuresSchema,
        prediction: predictionSchema,
        recommendation: z.object({
          recommendation: z.string().min(1).max(64),
          decision_reason: z.array(z.string().max(600)).max(24),
          expected_impact_type: z.string().max(120),
          robustness: z.string().max(120),
          human_approval_required: z.boolean(),
        }),
        state: stateSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    await ensureRun(db, data.run);

    const { data: snapshot } = await db
      .from("orca_state_snapshots")
      .insert({
        run_id: data.run.runId,
        shipment_id: data.shipmentId,
        trigger_event_id: data.triggerEventId,
        sim_clock_ms: data.simClockMs,
        shipment_status: data.state.shipmentStatus,
        progress: data.state.progress,
        position: data.state.position,
        eta_variance_hours: data.state.etaVarianceHours,
        exception_open: data.state.exceptionOpen,
        exception_family: data.state.exceptionFamily,
        features: data.features,
      })
      .select("id")
      .single();

    const { data: inference, error: inferenceError } = await db
      .from("orca_model_inferences")
      .insert({
        run_id: data.run.runId,
        shipment_id: data.shipmentId,
        trigger_event_id: data.triggerEventId,
        state_snapshot_id: snapshot?.id ?? null,
        inference_kind: data.inferenceKind,
        sim_clock_ms: data.simClockMs,
        features: data.features,
        model_version: data.prediction.model_version,
        prediction_contract_version: data.prediction.prediction_contract_version,
        probability_late: data.prediction.probability_late,
        classification_decision: data.prediction.classification_decision,
        decision_threshold: data.prediction.decision_threshold,
        risk_tier: data.prediction.risk_tier,
        severity_p50: data.prediction.severity_p50,
        severity_interval_90: data.prediction.severity_interval_90,
      })
      .select("id")
      .single();
    if (inferenceError || !inference) throw new Error("Failed to record model inference");

    const { data: recommendation, error: recError } = await db
      .from("orca_model_recommendations")
      .insert({
        inference_id: inference.id,
        run_id: data.run.runId,
        shipment_id: data.shipmentId,
        recommendation: data.recommendation.recommendation,
        decision_reason: data.recommendation.decision_reason,
        expected_impact_type: data.recommendation.expected_impact_type,
        robustness: data.recommendation.robustness,
        backend_human_approval_required: data.recommendation.human_approval_required,
      })
      .select("id")
      .single();
    if (recError || !recommendation) throw new Error("Failed to record model recommendation");

    const { data: episode, error: episodeError } = await db
      .from("orca_decision_episodes")
      .insert({
        run_id: data.run.runId,
        shipment_id: data.shipmentId,
        trigger_event_id: data.triggerEventId,
        state_snapshot_id: snapshot?.id ?? null,
        inference_id: inference.id,
        recommendation_id: recommendation.id,
        opened_sim_ms: data.simClockMs,
        simulation_human_decision_required: true,
      })
      .select("id")
      .single();
    if (episodeError || !episode) throw new Error("Failed to open decision episode");

    return { episodeId: episode.id, inferenceId: inference.id };
  });

/* ------------------------------------------------------------------ */
/* Human decision + intervention                                       */
/* ------------------------------------------------------------------ */

export const recordHumanDecision = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        run: runSchema,
        episodeId: z.string().uuid(),
        shipmentId: z.string().min(1).max(64),
        decision: z.enum(["APPROVE", "MODIFY", "REJECT", "DEFER"]),
        recommendedAction: z.string().min(1).max(64),
        chosenAction: z.string().min(1).max(64),
        reasonCode: z.string().min(1).max(64),
        note: z.string().max(600).nullable(),
        actorLabel: z.string().min(1).max(48),
        decisionLatencyMs: z.number().int().min(0),
        intervention: z
          .object({
            action: z.string().min(1).max(64),
            effectSpec: z.record(z.string(), z.unknown()),
            appliedSimMs: z.number().int().min(0),
            policyVersion: z.string().min(1).max(64),
          })
          .nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();

    const { data: decision, error } = await db
      .from("orca_human_decisions")
      .insert({
        episode_id: data.episodeId,
        decision: data.decision,
        recommended_action: data.recommendedAction,
        chosen_action: data.chosenAction,
        reason_code: data.reasonCode,
        note: data.note,
        actor_label: data.actorLabel,
        decision_latency_ms: data.decisionLatencyMs,
      })
      .select("id")
      .single();
    if (error || !decision) throw new Error("Failed to record human decision");

    if (data.intervention) {
      await db.from("orca_simulation_interventions").insert({
        episode_id: data.episodeId,
        human_decision_id: decision.id,
        run_id: data.run.runId,
        shipment_id: data.shipmentId,
        action: data.intervention.action,
        effect_spec: data.intervention.effectSpec as unknown as Json,
        simulator_policy_version: data.intervention.policyVersion,
        applied_sim_ms: data.intervention.appliedSimMs,
      });
    }

    return { humanDecisionId: decision.id };
  });

/* ------------------------------------------------------------------ */
/* Outcomes                                                            */
/* ------------------------------------------------------------------ */

export const persistOutcome = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        run: runSchema,
        shipmentId: z.string().min(1).max(64),
        deliveredSimMs: z.number().int().min(0),
        deliveredOnTime: z.boolean(),
        simulatedDelayHours: z.number(),
        finalEtaVarianceHours: z.number(),
        finalFeatures: featuresSchema,
        interventionCount: z.number().int().min(0).max(50),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    await ensureRun(db, data.run);
    await db.from("orca_simulation_outcomes").insert({
      run_id: data.run.runId,
      shipment_id: data.shipmentId,
      delivered_sim_ms: data.deliveredSimMs,
      delivered_on_time: data.deliveredOnTime,
      simulated_delay_hours: data.simulatedDelayHours,
      final_eta_variance_hours: data.finalEtaVarianceHours,
      final_features: data.finalFeatures,
      intervention_count: data.interventionCount,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Read side — persisted audit trail for the Resolution Hub            */
/* ------------------------------------------------------------------ */

export interface PersistedDecisionRow {
  episodeId: string;
  runId: string;
  shipmentId: string;
  openedAt: string;
  probabilityLate: number | null;
  riskTier: string | null;
  severityP50: number | null;
  modelVersion: string | null;
  recommendation: string | null;
  decision: string | null;
  chosenAction: string | null;
  reasonCode: string | null;
  note: string | null;
  actorLabel: string | null;
  decisionLatencyMs: number | null;
  decidedAt: string | null;
  interventionAction: string | null;
}

export const listPersistedDecisions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        runId: z.string().min(1).max(64).nullable().optional(),
        limit: z.number().int().min(1).max(100).default(40),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<{ rows: PersistedDecisionRow[]; totalDecisions: number }> => {
    const db = await admin();

    let query = db
      .from("orca_decision_episodes")
      .select(
        `id, run_id, shipment_id, opened_at,
         orca_model_inferences ( probability_late, risk_tier, severity_p50, model_version ),
         orca_model_recommendations ( recommendation ),
         orca_human_decisions ( decision, chosen_action, reason_code, note, actor_label, decision_latency_ms, decided_at ),
         orca_simulation_interventions ( action )`,
      )
      .order("opened_at", { ascending: false })
      .limit(data.limit);
    if (data.runId) query = query.eq("run_id", data.runId);

    const { data: rows, error } = await query;
    if (error) throw new Error("Failed to read the decision audit trail");

    const { count } = await db
      .from("orca_human_decisions")
      .select("id", { count: "exact", head: true });

    type Nested = {
      id: string;
      run_id: string;
      shipment_id: string;
      opened_at: string;
      orca_model_inferences: {
        probability_late: number;
        risk_tier: string;
        severity_p50: number;
        model_version: string;
      } | null;
      orca_model_recommendations: { recommendation: string } | null;
      orca_human_decisions: {
        decision: string;
        chosen_action: string;
        reason_code: string;
        note: string | null;
        actor_label: string;
        decision_latency_ms: number;
        decided_at: string;
      }[];
      orca_simulation_interventions: { action: string }[];
    };

    const mapped = ((rows ?? []) as unknown as Nested[]).map((row): PersistedDecisionRow => {
      const decision = row.orca_human_decisions[0] ?? null;
      const intervention = row.orca_simulation_interventions[0] ?? null;
      return {
        episodeId: row.id,
        runId: row.run_id,
        shipmentId: row.shipment_id,
        openedAt: row.opened_at,
        probabilityLate: row.orca_model_inferences?.probability_late ?? null,
        riskTier: row.orca_model_inferences?.risk_tier ?? null,
        severityP50: row.orca_model_inferences?.severity_p50 ?? null,
        modelVersion: row.orca_model_inferences?.model_version ?? null,
        recommendation: row.orca_model_recommendations?.recommendation ?? null,
        decision: decision?.decision ?? null,
        chosenAction: decision?.chosen_action ?? null,
        reasonCode: decision?.reason_code ?? null,
        note: decision?.note ?? null,
        actorLabel: decision?.actor_label ?? null,
        decisionLatencyMs: decision?.decision_latency_ms ?? null,
        decidedAt: decision?.decided_at ?? null,
        interventionAction: intervention?.action ?? null,
      };
    });

    return { rows: mapped, totalDecisions: count ?? 0 };
  });
