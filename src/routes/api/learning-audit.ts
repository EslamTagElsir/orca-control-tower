import { createFileRoute } from "@tanstack/react-router";

const MAX_ROWS = 100;

function noStore(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "Unknown Learning DB read error.";
}

async function readAudit(request: Request) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId")?.trim() || null;
    const requestedLimit = Number(url.searchParams.get("limit") ?? 40);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_ROWS, Math.floor(requestedLimit)))
      : 40;

    let episodeQuery = supabaseAdmin
      .from("orca_decision_episodes")
      .select(
        "id,run_id,shipment_id,trigger_event_id,opened_at,opened_sim_ms,inference_id,recommendation_id,provenance",
      )
      .order("opened_at", { ascending: false })
      .limit(limit);
    if (runId) episodeQuery = episodeQuery.eq("run_id", runId);

    const { data: episodes, error: episodeError } = await episodeQuery;
    if (episodeError) throw new Error(`Learning DB episode read failed: ${episodeError.message}`);

    const episodeRows = episodes ?? [];
    const inferenceIds = [...new Set(episodeRows.map((row) => row.inference_id))];
    const recommendationIds = [...new Set(episodeRows.map((row) => row.recommendation_id))];
    const episodeIds = episodeRows.map((row) => row.id);

    const [inferenceResult, recommendationResult, decisionResult, interventionResult] =
      await Promise.all([
        inferenceIds.length
          ? supabaseAdmin
              .from("orca_model_inferences")
              .select(
                "id,probability_late,risk_tier,severity_p50,severity_interval_90,classification_decision,decision_threshold,model_version,prediction_contract_version,evidence_label,created_at",
              )
              .in("id", inferenceIds)
          : Promise.resolve({ data: [], error: null }),
        recommendationIds.length
          ? supabaseAdmin
              .from("orca_model_recommendations")
              .select(
                "id,recommendation,decision_reason,expected_impact_type,robustness,backend_human_approval_required,evidence_label,created_at",
              )
              .in("id", recommendationIds)
          : Promise.resolve({ data: [], error: null }),
        episodeIds.length
          ? supabaseAdmin
              .from("orca_human_decisions")
              .select(
                "id,episode_id,decision,recommended_action,chosen_action,reason_code,note,actor_label,decision_latency_ms,decided_at,provenance",
              )
              .in("episode_id", episodeIds)
          : Promise.resolve({ data: [], error: null }),
        episodeIds.length
          ? supabaseAdmin
              .from("orca_simulation_interventions")
              .select(
                "id,episode_id,action,effect_spec,simulator_policy_version,applied_sim_ms,applied_at,provenance",
              )
              .in("episode_id", episodeIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (inferenceResult.error)
      throw new Error(`Learning DB inference read failed: ${inferenceResult.error.message}`);
    if (recommendationResult.error)
      throw new Error(
        `Learning DB recommendation read failed: ${recommendationResult.error.message}`,
      );
    if (decisionResult.error)
      throw new Error(`Learning DB decision read failed: ${decisionResult.error.message}`);
    if (interventionResult.error)
      throw new Error(`Learning DB intervention read failed: ${interventionResult.error.message}`);

    const shipmentPairs = episodeRows.map((row) => `${row.run_id}\u0000${row.shipment_id}`);
    const runIds = [...new Set(episodeRows.map((row) => row.run_id))];
    const shipmentIds = [...new Set(episodeRows.map((row) => row.shipment_id))];
    let outcomes: Array<{
      id: string;
      run_id: string;
      shipment_id: string;
      delivered_on_time: boolean;
      simulated_delay_hours: number;
      final_eta_variance_hours: number;
      intervention_count: number;
      recorded_at: string;
      provenance: string;
    }> = [];
    if (runIds.length && shipmentIds.length) {
      const { data, error } = await supabaseAdmin
        .from("orca_simulation_outcomes")
        .select(
          "id,run_id,shipment_id,delivered_on_time,simulated_delay_hours,final_eta_variance_hours,intervention_count,recorded_at,provenance",
        )
        .in("run_id", runIds)
        .in("shipment_id", shipmentIds);
      if (error) throw new Error(`Learning DB outcome read failed: ${error.message}`);
      const wanted = new Set(shipmentPairs);
      outcomes = (data ?? []).filter((row) => wanted.has(`${row.run_id}\u0000${row.shipment_id}`));
    }

    const inferenceById = new Map((inferenceResult.data ?? []).map((row) => [row.id, row]));
    const recommendationById = new Map(
      (recommendationResult.data ?? []).map((row) => [row.id, row]),
    );
    const decisionByEpisode = new Map(
      (decisionResult.data ?? []).map((row) => [row.episode_id, row]),
    );
    const interventionByEpisode = new Map(
      (interventionResult.data ?? []).map((row) => [row.episode_id, row]),
    );
    const outcomeByShipment = new Map(
      outcomes.map((row) => [`${row.run_id}\u0000${row.shipment_id}`, row]),
    );

    const rows = episodeRows.map((episode) => {
      const inference = inferenceById.get(episode.inference_id) ?? null;
      const recommendation = recommendationById.get(episode.recommendation_id) ?? null;
      const decision = decisionByEpisode.get(episode.id) ?? null;
      const intervention = interventionByEpisode.get(episode.id) ?? null;
      const outcome =
        outcomeByShipment.get(`${episode.run_id}\u0000${episode.shipment_id}`) ?? null;
      const status = outcome
        ? "OUTCOME_RECORDED"
        : intervention
          ? "INTERVENTION_APPLIED"
          : decision
            ? "DECIDED"
            : "AWAITING_HUMAN_DECISION";
      return {
        episodeId: episode.id,
        runId: episode.run_id,
        shipmentId: episode.shipment_id,
        triggerEventId: episode.trigger_event_id,
        openedAt: episode.opened_at,
        openedSimMs: episode.opened_sim_ms,
        status,
        inference,
        recommendation,
        decision,
        intervention,
        outcome,
        provenance: episode.provenance,
      };
    });

    return noStore({
      status: "connected",
      summary: {
        awaitingHumanDecision: rows.filter((row) => row.status === "AWAITING_HUMAN_DECISION")
          .length,
        decided: rows.filter((row) => row.status === "DECIDED").length,
        interventionApplied: rows.filter((row) => row.status === "INTERVENTION_APPLIED").length,
        outcomeRecorded: rows.filter((row) => row.status === "OUTCOME_RECORDED").length,
      },
      rows,
    });
  } catch (error) {
    console.error("[Learning DB audit]", error);
    return noStore(
      { status: "unavailable", error: "learning_db_read_failed", detail: safeMessage(error) },
      503,
    );
  }
}

export const Route = createFileRoute("/api/learning-audit")({
  server: {
    handlers: {
      GET: async ({ request }) => readAudit(request),
    },
  },
});
