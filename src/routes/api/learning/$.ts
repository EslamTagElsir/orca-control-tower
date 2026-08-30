import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";

const PROVENANCE = {
  twin: "SYNTHETIC OPERATIONAL DIGITAL TWIN",
  model: "MODEL OUTPUT",
  scenario: "SIMULATED SCENARIO",
  human: "HUMAN DECISION ON SYNTHETIC SIMULATION",
  outcome: "SYNTHETIC SIMULATION OUTCOME",
} as const;

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

const recommendationSchema = z.object({
  recommendation: z.string().min(1).max(64),
  decision_reason: z.array(z.string().max(600)).max(24),
  expected_impact_type: z.string().max(120),
  robustness: z.string().max(120),
  human_approval_required: z.boolean(),
});

const stateSchema = z.object({
  shipmentStatus: z.string().min(1).max(32),
  progress: z.number(),
  position: z.tuple([z.number(), z.number()]),
  etaVarianceHours: z.number(),
  exceptionOpen: z.boolean(),
  exceptionFamily: z.string().max(48).nullable(),
});

function noStore(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function safeMessage(error: unknown): string {
  if (error instanceof z.ZodError) return "Invalid learning-persistence payload.";
  if (error instanceof Error) return error.message.slice(0, 300);
  return "Unknown learning-persistence error.";
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Db = Awaited<ReturnType<typeof db>>;
type Run = z.infer<typeof runSchema>;

async function ensureRun(client: Db, run: Run) {
  const { error } = await client.from("orca_simulation_runs").upsert(
    {
      run_id: run.runId,
      seed: run.seed,
      speed: run.speed,
      status: "RUNNING",
      provenance: PROVENANCE.twin,
    },
    { onConflict: "run_id" },
  );
  if (error) throw new Error(`Learning DB run write failed: ${error.message}`);
}

async function parseJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("Expected application/json.");
  return request.json();
}

async function handleStart(request: Request) {
  const run = runSchema.parse(await parseJson(request));
  const client = await db();
  await ensureRun(client, run);
  return noStore({ ok: true, runId: run.runId });
}

async function handleEnd(request: Request) {
  const body = z
    .object({ runId: z.string().min(1).max(64), status: z.enum(["PAUSED", "STOPPED"]) })
    .parse(await parseJson(request));
  const client = await db();
  const { error } = await client
    .from("orca_simulation_runs")
    .update({ status: body.status, ended_at: new Date().toISOString() })
    .eq("run_id", body.runId);
  if (error) throw new Error(`Learning DB run lifecycle write failed: ${error.message}`);
  return noStore({ ok: true });
}

async function handleShipments(request: Request) {
  const body = z
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
    .parse(await parseJson(request));
  const client = await db();
  await ensureRun(client, body.run);

  const ids = body.shipments.map((s) => s.shipmentId);
  const { data: existing, error: readError } = await client
    .from("orca_simulation_shipments")
    .select("shipment_id")
    .eq("run_id", body.run.runId)
    .in("shipment_id", ids);
  if (readError) throw new Error(`Learning DB shipment read failed: ${readError.message}`);
  const seen = new Set((existing ?? []).map((row) => row.shipment_id));
  const rows = body.shipments
    .filter((s) => !seen.has(s.shipmentId))
    .map((s) => ({
      run_id: body.run.runId,
      shipment_id: s.shipmentId,
      template_id: s.templateId,
      origin: s.origin,
      destination: s.destination,
      route: s.route,
      mode: s.mode,
      vendor: s.vendor,
      product_group: s.productGroup,
      created_sim_ms: s.createdSimMs,
      initial_features: s.initialFeatures as Json,
      provenance: PROVENANCE.twin,
    }));
  if (rows.length > 0) {
    const { error } = await client.from("orca_simulation_shipments").insert(rows);
    if (error) throw new Error(`Learning DB shipment write failed: ${error.message}`);
  }
  return noStore({ ok: true, inserted: rows.length, skipped: body.shipments.length - rows.length });
}

async function handleEvents(request: Request) {
  const body = z
    .object({ run: runSchema, events: z.array(eventSchema).min(1).max(120) })
    .parse(await parseJson(request));
  const client = await db();
  await ensureRun(client, body.run);

  const eventIds = body.events.map((e) => e.eventId);
  const { data: existing, error: readError } = await client
    .from("orca_simulation_events")
    .select("event_id")
    .eq("run_id", body.run.runId)
    .in("event_id", eventIds);
  if (readError) throw new Error(`Learning DB event read failed: ${readError.message}`);
  const seen = new Set((existing ?? []).map((row) => row.event_id));
  const rows = body.events
    .filter((e) => !seen.has(e.eventId))
    .map((e) => ({
      run_id: body.run.runId,
      shipment_id: e.shipmentId,
      event_id: e.eventId,
      family: e.family,
      event_type: e.eventType,
      sim_clock_ms: e.simClockMs,
      detail: e.detail,
      risk_before: e.riskBefore ?? null,
      risk_after: e.riskAfter ?? null,
      feature_audit: (e.featureAudit ?? null) as Json | null,
      provenance: e.provenance,
    }));
  if (rows.length > 0) {
    const { error } = await client.from("orca_simulation_events").insert(rows);
    if (error) throw new Error(`Learning DB event write failed: ${error.message}`);
  }
  return noStore({ ok: true, inserted: rows.length, skipped: body.events.length - rows.length });
}

async function handleEpisode(request: Request) {
  const body = z
    .object({
      run: runSchema,
      shipmentId: z.string().min(1).max(64),
      triggerEventId: z.string().max(64).nullable(),
      simClockMs: z.number().int().min(0),
      inferenceKind: z.enum(["INITIAL", "RESCORE", "POST_INTERVENTION"]),
      features: featuresSchema,
      prediction: predictionSchema,
      recommendation: recommendationSchema,
      state: stateSchema,
    })
    .parse(await parseJson(request));
  const client = await db();
  await ensureRun(client, body.run);

  let inferenceQuery = client
    .from("orca_model_inferences")
    .select("id, state_snapshot_id")
    .eq("run_id", body.run.runId)
    .eq("shipment_id", body.shipmentId)
    .eq("inference_kind", body.inferenceKind)
    .eq("sim_clock_ms", body.simClockMs);
  inferenceQuery = body.triggerEventId
    ? inferenceQuery.eq("trigger_event_id", body.triggerEventId)
    : inferenceQuery.is("trigger_event_id", null);
  const { data: existingInference, error: inferenceReadError } = await inferenceQuery.maybeSingle();
  if (inferenceReadError) {
    throw new Error(`Learning DB inference read failed: ${inferenceReadError.message}`);
  }

  let snapshotId = existingInference?.state_snapshot_id ?? null;
  let inferenceId = existingInference?.id ?? null;

  if (!inferenceId) {
    let snapshotQuery = client
      .from("orca_state_snapshots")
      .select("id")
      .eq("run_id", body.run.runId)
      .eq("shipment_id", body.shipmentId)
      .eq("sim_clock_ms", body.simClockMs);
    snapshotQuery = body.triggerEventId
      ? snapshotQuery.eq("trigger_event_id", body.triggerEventId)
      : snapshotQuery.is("trigger_event_id", null);
    const { data: existingSnapshot, error: snapshotReadError } = await snapshotQuery.maybeSingle();
    if (snapshotReadError) {
      throw new Error(`Learning DB snapshot read failed: ${snapshotReadError.message}`);
    }
    snapshotId = existingSnapshot?.id ?? null;
    if (!snapshotId) {
      const { data: snapshot, error } = await client
        .from("orca_state_snapshots")
        .insert({
          run_id: body.run.runId,
          shipment_id: body.shipmentId,
          trigger_event_id: body.triggerEventId,
          sim_clock_ms: body.simClockMs,
          shipment_status: body.state.shipmentStatus,
          progress: body.state.progress,
          position: body.state.position as Json,
          eta_variance_hours: body.state.etaVarianceHours,
          exception_open: body.state.exceptionOpen,
          exception_family: body.state.exceptionFamily,
          features: body.features as Json,
          provenance: PROVENANCE.twin,
        })
        .select("id")
        .single();
      if (error || !snapshot) {
        throw new Error(
          `Learning DB snapshot write failed: ${error?.message ?? "no row returned"}`,
        );
      }
      snapshotId = snapshot.id;
    }

    const { data: inference, error } = await client
      .from("orca_model_inferences")
      .insert({
        run_id: body.run.runId,
        shipment_id: body.shipmentId,
        trigger_event_id: body.triggerEventId,
        state_snapshot_id: snapshotId,
        inference_kind: body.inferenceKind,
        sim_clock_ms: body.simClockMs,
        features: body.features as Json,
        model_version: body.prediction.model_version,
        prediction_contract_version: body.prediction.prediction_contract_version,
        probability_late: body.prediction.probability_late,
        classification_decision: body.prediction.classification_decision,
        decision_threshold: body.prediction.decision_threshold,
        risk_tier: body.prediction.risk_tier,
        severity_p50: body.prediction.severity_p50,
        severity_interval_90: body.prediction.severity_interval_90 as Json,
        evidence_label: PROVENANCE.model,
      })
      .select("id")
      .single();
    if (error || !inference) {
      throw new Error(`Learning DB inference write failed: ${error?.message ?? "no row returned"}`);
    }
    inferenceId = inference.id;
  }

  const { data: existingRecommendation, error: recReadError } = await client
    .from("orca_model_recommendations")
    .select("id")
    .eq("inference_id", inferenceId)
    .maybeSingle();
  if (recReadError)
    throw new Error(`Learning DB recommendation read failed: ${recReadError.message}`);

  let recommendationId = existingRecommendation?.id ?? null;
  if (!recommendationId) {
    const { data: recommendation, error } = await client
      .from("orca_model_recommendations")
      .insert({
        inference_id: inferenceId,
        run_id: body.run.runId,
        shipment_id: body.shipmentId,
        recommendation: body.recommendation.recommendation,
        decision_reason: body.recommendation.decision_reason as Json,
        expected_impact_type: body.recommendation.expected_impact_type,
        robustness: body.recommendation.robustness,
        backend_human_approval_required: body.recommendation.human_approval_required,
        evidence_label: PROVENANCE.model,
      })
      .select("id")
      .single();
    if (error || !recommendation) {
      throw new Error(
        `Learning DB recommendation write failed: ${error?.message ?? "no row returned"}`,
      );
    }
    recommendationId = recommendation.id;
  }

  const { data: existingEpisode, error: episodeReadError } = await client
    .from("orca_decision_episodes")
    .select("id")
    .eq("recommendation_id", recommendationId)
    .maybeSingle();
  if (episodeReadError)
    throw new Error(`Learning DB episode read failed: ${episodeReadError.message}`);

  let episodeId = existingEpisode?.id ?? null;
  if (!episodeId) {
    const { data: episode, error } = await client
      .from("orca_decision_episodes")
      .insert({
        run_id: body.run.runId,
        shipment_id: body.shipmentId,
        trigger_event_id: body.triggerEventId,
        state_snapshot_id: snapshotId,
        inference_id: inferenceId,
        recommendation_id: recommendationId,
        opened_sim_ms: body.simClockMs,
        simulation_human_decision_required: true,
        provenance: PROVENANCE.twin,
      })
      .select("id")
      .single();
    if (error || !episode) {
      throw new Error(`Learning DB episode write failed: ${error?.message ?? "no row returned"}`);
    }
    episodeId = episode.id;
  }

  return noStore({ episodeId, inferenceId, recommendationId });
}

async function handleDecision(request: Request) {
  const body = z
    .object({
      run: runSchema,
      episodeId: z.string().uuid(),
      shipmentId: z.string().min(1).max(64),
      decision: z.enum(["ACCEPT", "MODIFY", "REJECT", "APPROVE", "DEFER"]),
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
    .parse(await parseJson(request));
  const client = await db();
  await ensureRun(client, body.run);

  const { data: existingDecision, error: decisionReadError } = await client
    .from("orca_human_decisions")
    .select("id")
    .eq("episode_id", body.episodeId)
    .maybeSingle();
  if (decisionReadError)
    throw new Error(`Learning DB decision read failed: ${decisionReadError.message}`);

  let decisionId = existingDecision?.id ?? null;
  if (!decisionId) {
    const { data: decision, error } = await client
      .from("orca_human_decisions")
      .insert({
        episode_id: body.episodeId,
        decision:
          body.decision === "APPROVE"
            ? "ACCEPT"
            : body.decision === "DEFER"
              ? "MODIFY"
              : body.decision,
        recommended_action: body.recommendedAction,
        chosen_action: body.chosenAction,
        reason_code: body.reasonCode,
        note: body.note,
        actor_label: body.actorLabel,
        decision_latency_ms: body.decisionLatencyMs,
        provenance: PROVENANCE.human,
      })
      .select("id")
      .single();
    if (error || !decision) {
      throw new Error(`Learning DB decision write failed: ${error?.message ?? "no row returned"}`);
    }
    decisionId = decision.id;
  }

  if (body.intervention) {
    const { data: existingIntervention, error: interventionReadError } = await client
      .from("orca_simulation_interventions")
      .select("id")
      .eq("human_decision_id", decisionId)
      .maybeSingle();
    if (interventionReadError) {
      throw new Error(`Learning DB intervention read failed: ${interventionReadError.message}`);
    }
    if (!existingIntervention) {
      const { error } = await client.from("orca_simulation_interventions").insert({
        episode_id: body.episodeId,
        human_decision_id: decisionId,
        run_id: body.run.runId,
        shipment_id: body.shipmentId,
        action: body.intervention.action,
        effect_spec: body.intervention.effectSpec as Json,
        simulator_policy_version: body.intervention.policyVersion,
        applied_sim_ms: body.intervention.appliedSimMs,
        provenance: PROVENANCE.scenario,
      });
      if (error) throw new Error(`Learning DB intervention write failed: ${error.message}`);
    }
  }

  return noStore({ humanDecisionId: decisionId });
}

async function handleOutcome(request: Request) {
  const body = z
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
    .parse(await parseJson(request));
  const client = await db();
  await ensureRun(client, body.run);

  const { data: existing, error: readError } = await client
    .from("orca_simulation_outcomes")
    .select("id")
    .eq("run_id", body.run.runId)
    .eq("shipment_id", body.shipmentId)
    .maybeSingle();
  if (readError) throw new Error(`Learning DB outcome read failed: ${readError.message}`);
  if (!existing) {
    const { error } = await client.from("orca_simulation_outcomes").insert({
      run_id: body.run.runId,
      shipment_id: body.shipmentId,
      delivered_sim_ms: body.deliveredSimMs,
      delivered_on_time: body.deliveredOnTime,
      simulated_delay_hours: body.simulatedDelayHours,
      final_eta_variance_hours: body.finalEtaVarianceHours,
      final_features: body.finalFeatures as Json,
      intervention_count: body.interventionCount,
      provenance: PROVENANCE.outcome,
    });
    if (error) throw new Error(`Learning DB outcome write failed: ${error.message}`);
  }
  return noStore({ ok: true, inserted: !existing });
}

async function handleHealth() {
  const client = await db();
  const { error } = await client
    .from("orca_simulation_runs")
    .select("run_id", { head: true, count: "exact" })
    .limit(1);
  if (error) throw new Error(`Learning DB health check failed: ${error.message}`);
  return noStore({ status: "connected" });
}

async function routeRequest(request: Request, splat: string): Promise<Response> {
  if (!sameOrigin(request)) return noStore({ error: "cross_origin_forbidden" }, 403);
  const path = splat.replace(/^\/+|\/+$/g, "");
  try {
    if (request.method === "GET" && path === "health") return await handleHealth();
    if (request.method !== "POST") return noStore({ error: "method_not_allowed" }, 405);
    if (path === "run/start") return await handleStart(request);
    if (path === "run/end") return await handleEnd(request);
    if (path === "shipments") return await handleShipments(request);
    if (path === "events") return await handleEvents(request);
    if (path === "episode") return await handleEpisode(request);
    if (path === "decision") return await handleDecision(request);
    if (path === "outcome") return await handleOutcome(request);
    return noStore({ error: "learning_route_not_found" }, 404);
  } catch (error) {
    console.error("[Learning DB]", error);
    return noStore({ error: "learning_db_error", detail: safeMessage(error) }, 503);
  }
}

export const Route = createFileRoute("/api/learning/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => routeRequest(request, params._splat ?? ""),
      POST: async ({ request, params }) => routeRequest(request, params._splat ?? ""),
    },
  },
});
