/**
 * ORCA Human-in-the-Loop Learning System — same-origin persistence API.
 *
 * Every write here is an APPEND-ONLY audit record of the running Operational
 * Digital Twin. The learning tables are locked at the database level (RLS on,
 * no policies, no browser grants); only this trusted server handler reaches
 * them, through the server-only service-role client. The service role key is
 * never exposed to browser code — the browser talks to these same-origin
 * endpoints and nothing else.
 *
 * PROVENANCE CONTRACT: this module stores values, it never derives them. Model
 * fields are the verbatim ORCA /predict and /recommend payloads; simulation
 * fields are SYNTHETIC LIVE OPERATIONS; human decisions are real decisions
 * recorded against a synthetic simulation.
 *
 * IDEMPOTENCY: every endpoint is duplicate-safe. Redelivery of the same logical
 * run / shipment / event / inference / episode / decision / intervention /
 * outcome resolves to the existing row instead of appending a second one. No
 * schema change is required: each record already carries a natural key.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";

/* ------------------------------------------------------------------ */
/* Server-only admin client                                            */
/* ------------------------------------------------------------------ */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Db = Awaited<ReturnType<typeof admin>>;

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

const runSchema = z.object({
  runId: z.string().min(1).max(64),
  seed: z.number().int(),
  speed: z.number().int().min(1).max(120),
});
type RunInput = z.infer<typeof runSchema>;

const featuresSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

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

const inferenceKindSchema = z.enum(["INITIAL", "RESCORE", "POST_INTERVENTION"]);

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

const shipmentSchema = z.object({
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
});

/** ACCEPT / MODIFY / REJECT are current; APPROVE / DEFER stay readable. */
const decisionKindSchema = z.enum(["ACCEPT", "MODIFY", "REJECT", "APPROVE", "DEFER"]);

/* ------------------------------------------------------------------ */
/* Responses                                                           */
/* ------------------------------------------------------------------ */

function ok(body: Record<string, unknown>) {
  return Response.json({ ok: true, ...body });
}

function bad(detail: string) {
  return Response.json({ ok: false, error: "INVALID_REQUEST", detail }, { status: 400 });
}

function fail(detail: string) {
  return Response.json({ ok: false, error: "PERSISTENCE_FAILED", detail }, { status: 500 });
}

/** Compact, non-leaky detail string for a Supabase error. */
function detailOf(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message).slice(0, 300);
  }
  return String(error).slice(0, 300);
}

/* ------------------------------------------------------------------ */
/* Idempotent writers                                                  */
/* ------------------------------------------------------------------ */

/** Records the run header so foreign keys resolve. Safe to call repeatedly. */
async function ensureRun(db: Db, run: RunInput): Promise<void> {
  const { error } = await db
    .from("orca_simulation_runs")
    .upsert(
      { run_id: run.runId, seed: run.seed, status: "RUNNING", speed: run.speed },
      { onConflict: "run_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(detailOf(error));
}

/**
 * Natural key: (run_id, shipment_id, sim_clock_ms). One operational state of one
 * shipment at one point on the simulation clock.
 */
async function ensureSnapshot(
  db: Db,
  run: RunInput,
  input: {
    shipmentId: string;
    triggerEventId: string | null;
    simClockMs: number;
    features: Record<string, string | number | boolean | null>;
    state: z.infer<typeof stateSchema>;
  },
): Promise<string | null> {
  const { data: existing } = await db
    .from("orca_state_snapshots")
    .select("id")
    .eq("run_id", run.runId)
    .eq("shipment_id", input.shipmentId)
    .eq("sim_clock_ms", input.simClockMs)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db
    .from("orca_state_snapshots")
    .insert({
      run_id: run.runId,
      shipment_id: input.shipmentId,
      trigger_event_id: input.triggerEventId,
      sim_clock_ms: input.simClockMs,
      shipment_status: input.state.shipmentStatus,
      progress: input.state.progress,
      position: input.state.position as unknown as Json,
      eta_variance_hours: input.state.etaVarianceHours,
      exception_open: input.state.exceptionOpen,
      exception_family: input.state.exceptionFamily,
      features: input.features as unknown as Json,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(detailOf(error ?? "state snapshot insert returned no row"));
  return data.id;
}

/**
 * Natural key: (run_id, shipment_id, sim_clock_ms, inference_kind). The engine
 * only ever produces one model call per shipment per clock position per kind,
 * so a redelivery resolves to the same inference row.
 */
async function ensureInference(
  db: Db,
  run: RunInput,
  input: {
    shipmentId: string;
    triggerEventId: string | null;
    simClockMs: number;
    inferenceKind: z.infer<typeof inferenceKindSchema>;
    features: Record<string, string | number | boolean | null>;
    prediction: z.infer<typeof predictionSchema>;
    state: z.infer<typeof stateSchema>;
  },
): Promise<{ inferenceId: string; snapshotId: string | null; created: boolean }> {
  const { data: existing } = await db
    .from("orca_model_inferences")
    .select("id, state_snapshot_id")
    .eq("run_id", run.runId)
    .eq("shipment_id", input.shipmentId)
    .eq("sim_clock_ms", input.simClockMs)
    .eq("inference_kind", input.inferenceKind)
    .maybeSingle();
  if (existing) {
    return { inferenceId: existing.id, snapshotId: existing.state_snapshot_id, created: false };
  }

  const snapshotId = await ensureSnapshot(db, run, {
    shipmentId: input.shipmentId,
    triggerEventId: input.triggerEventId,
    simClockMs: input.simClockMs,
    features: input.features,
    state: input.state,
  });

  const { data, error } = await db
    .from("orca_model_inferences")
    .insert({
      run_id: run.runId,
      shipment_id: input.shipmentId,
      trigger_event_id: input.triggerEventId,
      state_snapshot_id: snapshotId,
      inference_kind: input.inferenceKind,
      sim_clock_ms: input.simClockMs,
      features: input.features as unknown as Json,
      model_version: input.prediction.model_version,
      prediction_contract_version: input.prediction.prediction_contract_version,
      probability_late: input.prediction.probability_late,
      classification_decision: input.prediction.classification_decision,
      decision_threshold: input.prediction.decision_threshold,
      risk_tier: input.prediction.risk_tier,
      severity_p50: input.prediction.severity_p50,
      severity_interval_90: input.prediction.severity_interval_90 as unknown as Json,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(detailOf(error ?? "model inference insert returned no row"));
  return { inferenceId: data.id, snapshotId, created: true };
}

/** Natural key: inference_id. One /recommend answer per inference. */
async function ensureRecommendation(
  db: Db,
  run: RunInput,
  shipmentId: string,
  inferenceId: string,
  rec: z.infer<typeof recommendationSchema>,
): Promise<string> {
  const { data: existing } = await db
    .from("orca_model_recommendations")
    .select("id")
    .eq("inference_id", inferenceId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db
    .from("orca_model_recommendations")
    .insert({
      inference_id: inferenceId,
      run_id: run.runId,
      shipment_id: shipmentId,
      recommendation: rec.recommendation,
      decision_reason: rec.decision_reason as unknown as Json,
      expected_impact_type: rec.expected_impact_type,
      robustness: rec.robustness,
      backend_human_approval_required: rec.human_approval_required,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(detailOf(error ?? "recommendation insert returned no row"));
  return data.id;
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

async function handleHealth(): Promise<Response> {
  try {
    const db = await admin();
    const { error, count } = await db
      .from("orca_simulation_runs")
      .select("run_id", { count: "exact", head: true });
    if (error) {
      return Response.json(
        { connected: false, status: "unavailable", detail: detailOf(error) },
        { status: 500 },
      );
    }
    return Response.json({
      connected: true,
      status: "connected",
      runs: count ?? 0,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { connected: false, status: "unavailable", detail: detailOf(error) },
      { status: 500 },
    );
  }
}

const HANDLERS: Record<string, (db: Db, body: unknown) => Promise<Response>> = {
  "run/start": async (db, body) => {
    const run = runSchema.parse(body);
    await ensureRun(db, run);
    return ok({ runId: run.runId });
  },

  "run/end": async (db, body) => {
    const input = z
      .object({ runId: z.string().min(1).max(64), status: z.enum(["PAUSED", "STOPPED"]) })
      .parse(body);
    // Append-only guard blocks UPDATE on audit tables; the run header is not one
    // of them, so the terminal status is recorded in place.
    const { error } = await db
      .from("orca_simulation_runs")
      .update({ status: input.status, ended_at: new Date().toISOString() })
      .eq("run_id", input.runId);
    if (error) throw new Error(detailOf(error));
    return ok({ runId: input.runId, status: input.status });
  },

  shipments: async (db, body) => {
    const input = z
      .object({ run: runSchema, shipments: z.array(shipmentSchema).min(1).max(40) })
      .parse(body);
    await ensureRun(db, input.run);

    const ids = input.shipments.map((s) => s.shipmentId);
    const { data: existing, error: readError } = await db
      .from("orca_simulation_shipments")
      .select("shipment_id")
      .eq("run_id", input.run.runId)
      .in("shipment_id", ids);
    if (readError) throw new Error(detailOf(readError));
    const seen = new Set((existing ?? []).map((r) => r.shipment_id));
    const fresh = input.shipments.filter((s) => !seen.has(s.shipmentId));
    if (fresh.length === 0) return ok({ inserted: 0, skipped: ids.length });

    const { error } = await db.from("orca_simulation_shipments").insert(
      fresh.map((s) => ({
        run_id: input.run.runId,
        shipment_id: s.shipmentId,
        template_id: s.templateId,
        origin: s.origin,
        destination: s.destination,
        route: s.route,
        mode: s.mode,
        vendor: s.vendor,
        product_group: s.productGroup,
        created_sim_ms: s.createdSimMs,
        initial_features: s.initialFeatures as unknown as Json,
      })),
    );
    if (error) throw new Error(detailOf(error));
    return ok({ inserted: fresh.length, skipped: ids.length - fresh.length });
  },

  events: async (db, body) => {
    const input = z
      .object({ run: runSchema, events: z.array(eventSchema).min(1).max(120) })
      .parse(body);
    await ensureRun(db, input.run);

    const ids = input.events.map((e) => e.eventId);
    const { data: existing, error: readError } = await db
      .from("orca_simulation_events")
      .select("event_id")
      .eq("run_id", input.run.runId)
      .in("event_id", ids);
    if (readError) throw new Error(detailOf(readError));
    const seen = new Set((existing ?? []).map((r) => r.event_id));
    const fresh = input.events.filter((e) => !seen.has(e.eventId));
    if (fresh.length === 0) return ok({ inserted: 0, skipped: ids.length });

    const { error } = await db.from("orca_simulation_events").insert(
      fresh.map((e) => ({
        run_id: input.run.runId,
        shipment_id: e.shipmentId,
        event_id: e.eventId,
        family: e.family,
        event_type: e.eventType,
        sim_clock_ms: e.simClockMs,
        detail: e.detail,
        risk_before: e.riskBefore ?? null,
        risk_after: e.riskAfter ?? null,
        feature_audit: (e.featureAudit ?? null) as unknown as Json,
        provenance: e.provenance,
      })),
    );
    if (error) throw new Error(detailOf(error));
    return ok({ inserted: fresh.length, skipped: ids.length - fresh.length });
  },

  /**
   * A REAL ORCA /predict result that is NOT (or not yet) attached to a decision
   * episode — for example a re-score, or an inference whose /recommend call
   * failed. Persisted independently so the model evidence is never lost.
   */
  inference: async (db, body) => {
    const input = z
      .object({
        run: runSchema,
        shipmentId: z.string().min(1).max(64),
        triggerEventId: z.string().max(64).nullable(),
        simClockMs: z.number().int().min(0),
        inferenceKind: inferenceKindSchema,
        features: featuresSchema,
        prediction: predictionSchema,
        state: stateSchema,
      })
      .parse(body);
    await ensureRun(db, input.run);
    const result = await ensureInference(db, input.run, input);
    return ok({
      inferenceId: result.inferenceId,
      snapshotId: result.snapshotId,
      created: result.created,
    });
  },

  /**
   * Owns the whole snapshot → inference → recommendation → episode chain so a
   * concurrent standalone inference write cannot duplicate the model row.
   */
  episode: async (db, body) => {
    const input = z
      .object({
        run: runSchema,
        shipmentId: z.string().min(1).max(64),
        triggerEventId: z.string().max(64).nullable(),
        simClockMs: z.number().int().min(0),
        inferenceKind: inferenceKindSchema,
        features: featuresSchema,
        prediction: predictionSchema,
        recommendation: recommendationSchema,
        state: stateSchema,
      })
      .parse(body);
    await ensureRun(db, input.run);

    const inference = await ensureInference(db, input.run, input);
    const recommendationId = await ensureRecommendation(
      db,
      input.run,
      input.shipmentId,
      inference.inferenceId,
      input.recommendation,
    );

    const { data: existing } = await db
      .from("orca_decision_episodes")
      .select("id")
      .eq("run_id", input.run.runId)
      .eq("shipment_id", input.shipmentId)
      .eq("opened_sim_ms", input.simClockMs)
      .maybeSingle();
    if (existing) {
      return ok({
        episodeId: existing.id,
        inferenceId: inference.inferenceId,
        recommendationId,
        created: false,
      });
    }

    const { data, error } = await db
      .from("orca_decision_episodes")
      .insert({
        run_id: input.run.runId,
        shipment_id: input.shipmentId,
        trigger_event_id: input.triggerEventId,
        state_snapshot_id: inference.snapshotId,
        inference_id: inference.inferenceId,
        recommendation_id: recommendationId,
        opened_sim_ms: input.simClockMs,
        simulation_human_decision_required: true,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(detailOf(error ?? "episode insert returned no row"));
    return ok({
      episodeId: data.id,
      inferenceId: inference.inferenceId,
      recommendationId,
      created: true,
    });
  },

  /** One human decision (and at most one intervention) per episode. */
  decision: async (db, body) => {
    const input = z
      .object({
        run: runSchema,
        episodeId: z.string().uuid(),
        shipmentId: z.string().min(1).max(64),
        decision: decisionKindSchema,
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
      .parse(body);

    const { data: existing } = await db
      .from("orca_human_decisions")
      .select("id")
      .eq("episode_id", input.episodeId)
      .maybeSingle();

    let humanDecisionId = existing?.id ?? null;
    if (!humanDecisionId) {
      const { data, error } = await db
        .from("orca_human_decisions")
        .insert({
          episode_id: input.episodeId,
          decision: input.decision,
          recommended_action: input.recommendedAction,
          chosen_action: input.chosenAction,
          reason_code: input.reasonCode,
          note: input.note,
          actor_label: input.actorLabel,
          decision_latency_ms: input.decisionLatencyMs,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(detailOf(error ?? "decision insert returned no row"));
      humanDecisionId = data.id;
    }

    let interventionCreated = false;
    if (input.intervention) {
      const { data: existingIntervention } = await db
        .from("orca_simulation_interventions")
        .select("id")
        .eq("episode_id", input.episodeId)
        .maybeSingle();
      if (!existingIntervention) {
        const { error } = await db.from("orca_simulation_interventions").insert({
          episode_id: input.episodeId,
          human_decision_id: humanDecisionId,
          run_id: input.run.runId,
          shipment_id: input.shipmentId,
          action: input.intervention.action,
          effect_spec: input.intervention.effectSpec as unknown as Json,
          simulator_policy_version: input.intervention.policyVersion,
          applied_sim_ms: input.intervention.appliedSimMs,
        });
        if (error) throw new Error(detailOf(error));
        interventionCreated = true;
      }
    }

    return ok({
      humanDecisionId,
      created: !existing,
      interventionCreated,
    });
  },

  /** One final simulated outcome per (run, shipment). */
  outcome: async (db, body) => {
    const input = z
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
      .parse(body);
    await ensureRun(db, input.run);

    const { data: existing } = await db
      .from("orca_simulation_outcomes")
      .select("id")
      .eq("run_id", input.run.runId)
      .eq("shipment_id", input.shipmentId)
      .maybeSingle();
    if (existing) return ok({ outcomeId: existing.id, created: false });

    const { data, error } = await db
      .from("orca_simulation_outcomes")
      .insert({
        run_id: input.run.runId,
        shipment_id: input.shipmentId,
        delivered_sim_ms: input.deliveredSimMs,
        delivered_on_time: input.deliveredOnTime,
        simulated_delay_hours: input.simulatedDelayHours,
        final_eta_variance_hours: input.finalEtaVarianceHours,
        final_features: input.finalFeatures as unknown as Json,
        intervention_count: input.interventionCount,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(detailOf(error ?? "outcome insert returned no row"));
    return ok({ outcomeId: data.id, created: true });
  },
};

function segment(params: { _splat?: string | undefined }): string {
  return (params._splat ?? "").replace(/^\/+|\/+$/g, "");
}

export const Route = createFileRoute("/api/learning/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = segment(params);
        if (path !== "health") {
          return bad(`Unknown learning endpoint: GET /api/learning/${path || "(root)"}`);
        }
        return handleHealth();
      },

      POST: async ({ request, params }) => {
        const path = segment(params);
        const handler = HANDLERS[path];
        if (!handler) {
          return bad(`Unknown learning endpoint: POST /api/learning/${path || "(root)"}`);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return bad("Request body is not valid JSON.");
        }

        try {
          const db = await admin();
          return await handler(db, body);
        } catch (error) {
          if (error instanceof z.ZodError) {
            return bad(error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
          }
          return fail(detailOf(error));
        }
      },
    },
  },
});
