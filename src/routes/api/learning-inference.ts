import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";

const featuresSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

const payloadSchema = z.object({
  run: z.object({
    runId: z.string().min(1).max(64),
    seed: z.number().int(),
    speed: z.number().int().min(1).max(120),
  }),
  shipmentId: z.string().min(1).max(64),
  triggerEventId: z.string().min(1).max(64),
  simClockMs: z.number().int().min(0),
  inferenceKind: z.enum(["INITIAL", "RESCORE", "POST_INTERVENTION"]),
  features: featuresSchema,
  prediction: z.object({
    probability_late: z.number(),
    classification_decision: z.boolean(),
    decision_threshold: z.number(),
    risk_tier: z.string().min(1).max(24),
    severity_p50: z.number(),
    severity_interval_90: z.tuple([z.number(), z.number()]),
    model_version: z.string().min(1).max(64),
    prediction_contract_version: z.string().min(1).max(64),
  }),
  state: z.object({
    shipmentStatus: z.string().min(1).max(32),
    progress: z.number(),
    position: z.tuple([z.number(), z.number()]),
    etaVarianceHours: z.number(),
    exceptionOpen: z.boolean(),
    exceptionFamily: z.string().max(48).nullable(),
  }),
});

function noStore(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function safeMessage(error: unknown): string {
  if (error instanceof z.ZodError) return "Invalid model-inference audit payload.";
  if (error instanceof Error) return error.message.slice(0, 300);
  return "Unknown Learning DB inference error.";
}

async function handle(request: Request) {
  try {
    const body = payloadSchema.parse(await request.json());
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: runError } = await supabaseAdmin.from("orca_simulation_runs").upsert(
      {
        run_id: body.run.runId,
        seed: body.run.seed,
        speed: body.run.speed,
        status: "RUNNING",
        provenance: "SYNTHETIC OPERATIONAL DIGITAL TWIN",
      },
      { onConflict: "run_id" },
    );
    if (runError) throw new Error(`Learning DB run write failed: ${runError.message}`);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("orca_model_inferences")
      .select("id,state_snapshot_id")
      .eq("run_id", body.run.runId)
      .eq("shipment_id", body.shipmentId)
      .eq("trigger_event_id", body.triggerEventId)
      .eq("inference_kind", body.inferenceKind)
      .maybeSingle();
    if (existingError)
      throw new Error(`Learning DB inference read failed: ${existingError.message}`);
    if (existing) return noStore({ ok: true, inferenceId: existing.id, inserted: false });

    const { data: snapshot, error: snapshotError } = await supabaseAdmin
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
        provenance: "SYNTHETIC OPERATIONAL DIGITAL TWIN",
      })
      .select("id")
      .single();
    if (snapshotError || !snapshot) {
      throw new Error(
        `Learning DB snapshot write failed: ${snapshotError?.message ?? "no row returned"}`,
      );
    }

    const { data: inference, error: inferenceError } = await supabaseAdmin
      .from("orca_model_inferences")
      .insert({
        run_id: body.run.runId,
        shipment_id: body.shipmentId,
        trigger_event_id: body.triggerEventId,
        state_snapshot_id: snapshot.id,
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
        evidence_label: "MODEL OUTPUT",
      })
      .select("id")
      .single();
    if (inferenceError || !inference) {
      throw new Error(
        `Learning DB inference write failed: ${inferenceError?.message ?? "no row returned"}`,
      );
    }

    return noStore({ ok: true, inferenceId: inference.id, inserted: true });
  } catch (error) {
    console.error("[Learning DB inference]", error);
    return noStore({ error: "learning_db_inference_error", detail: safeMessage(error) }, 503);
  }
}

export const Route = createFileRoute("/api/learning-inference")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
