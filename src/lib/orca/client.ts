/**
 * Centralised ORCA service layer.
 *
 * Rules:
 *  - No component ever calls fetch directly; everything goes through
 *    `src/lib/orca/transport.ts` (proxy mode or direct-browser mode).
 *  - The CURRENT backend exposes only /health, /predict, /explain and
 *    /recommend. There are no /demo/* endpoints, so the Control Tower payloads
 *    are composed in `src/lib/orca/adapter.ts` from the four core endpoints
 *    applied to bundled REAL source rows.
 *  - When /health (or a core call) is unreachable we fall back to labelled
 *    offline fixtures and mark the payload `source: "fixture"`.
 *
 * Framework-agnostic apart from the TanStack Query option factories at the
 * bottom (queryOptions objects are plain data and port cleanly).
 */

import { queryOptions } from "@tanstack/react-query";

import { fixtureOverview, fixtureScenarioRun, fixtureScenarios, fixtureShipment } from "./fixtures";
import {
  composeOverview,
  composeShipmentDetail,
  explain as explainCall,
  health as healthCall,
  PLANNING_DEFAULTS,
  predict as predictCall,
  recommend as recommendCall,
  runWhatIf,
  scenarioOptions,
  type WhatIfInput,
} from "./adapter";
import {
  getConnectionConfig,
  isUnreachable,
  OrcaUnavailableError,
  PROXY_BASE_PATH,
  type ConnectionConfig,
} from "./transport";
import type {
  DataSource,
  ExplainResponse,
  HealthResponse,
  OverviewResponse,
  PredictResponse,
  RecommendResponse,
  ScenarioOption,
  ScenarioRunResponse,
  ShipmentDetailResponse,
} from "./types";

export { OrcaUnavailableError };
export const ORCA_BASE_PATH = PROXY_BASE_PATH;

export const FIXTURE_NOTICE = "OFFLINE FIXTURE DATA — NOT ORCA OUTPUT";

export interface Sourced<T> {
  data: T;
  source: DataSource;
  /** Present when we fell back; human-readable reason. */
  reason?: string;
}

async function withFixture<T>(live: () => Promise<T>, fallback: () => T): Promise<Sourced<T>> {
  try {
    return { data: await live(), source: "live" };
  } catch (error) {
    if (isUnreachable(error)) {
      return {
        data: fallback(),
        source: "fixture",
        reason: error instanceof Error ? error.message : "ORCA API unreachable",
      };
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Endpoint wrappers                                                   */
/* ------------------------------------------------------------------ */

/** Connection state is decided by /health ALONE. */
export async function getHealth(): Promise<Sourced<HealthResponse | null>> {
  try {
    return { data: await healthCall(), source: "live" };
  } catch (error) {
    if (isUnreachable(error)) {
      return {
        data: null,
        source: "fixture",
        reason: error instanceof Error ? error.message : "ORCA API unreachable",
      };
    }
    throw error;
  }
}

export function getOverview(seed?: number): Promise<Sourced<OverviewResponse>> {
  return withFixture(composeOverview, () => fixtureOverview(seed));
}

export function getShipment(
  shipmentId: string,
  seed?: number,
): Promise<Sourced<ShipmentDetailResponse>> {
  return withFixture(
    () => composeShipmentDetail(shipmentId),
    () => fixtureShipment(shipmentId, seed),
  );
}

export function getScenarios(): Promise<Sourced<ScenarioOption[]>> {
  return Promise.resolve({ data: scenarioOptions(), source: "live" as const });
}

export interface ScenarioRunInput extends WhatIfInput {
  seed?: number;
}

export function runScenario(input: ScenarioRunInput): Promise<Sourced<ScenarioRunResponse>> {
  return withFixture(
    () => runWhatIf(input),
    () =>
      fixtureScenarioRun(
        input.shipment_id,
        input.scenario_key,
        input.delay_cost_per_day,
        input.intervention_cost,
        input.efficacy_days,
        input.seed,
      ),
  );
}

/* ------------------------------------------------------------------ */
/* Query option factories                                              */
/* ------------------------------------------------------------------ */

/** Connection identity so switching mode / base URL refetches cleanly. */
function connectionKey(config: ConnectionConfig = getConnectionConfig()): string {
  return config.mode === "direct" ? `direct:${config.baseUrl}` : "proxy";
}

export const orcaKeys = {
  health: () => ["orca", connectionKey(), "health"] as const,
  overview: (seed?: number) => ["orca", connectionKey(), "overview", seed ?? "default"] as const,
  shipment: (id: string, seed?: number) =>
    ["orca", connectionKey(), "shipment", id, seed ?? "default"] as const,
  scenarios: () => ["orca", connectionKey(), "scenarios"] as const,
};

export const healthQuery = (refetchInterval: number | false = 20_000) =>
  queryOptions({
    queryKey: orcaKeys.health(),
    queryFn: () => getHealth(),
    refetchInterval,
    staleTime: 10_000,
    retry: false,
  });

/**
 * Overview is composed from N model calls, so it is cached aggressively and
 * never re-scored on render. Auto-refresh remains opt-in.
 */
export const overviewQuery = (seed?: number, refetchInterval: number | false = false) =>
  queryOptions({
    queryKey: orcaKeys.overview(seed),
    queryFn: () => getOverview(seed),
    refetchInterval,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });

export const shipmentQuery = (id: string | null, seed?: number) =>
  queryOptions({
    queryKey: orcaKeys.shipment(id ?? "none", seed),
    queryFn: () => getShipment(id as string, seed),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
    retry: false,
  });

export const scenariosQuery = () =>
  queryOptions({
    queryKey: orcaKeys.scenarios(),
    queryFn: () => getScenarios(),
    staleTime: Infinity,
    retry: false,
  });

/* ------------------------------------------------------------------ */
/* Model endpoints (/predict, /explain, /recommend)                    */
/* ------------------------------------------------------------------ */

/**
 * Deliberately NO fixture fallback: there is no legitimate fixture for a model
 * inference. When the backend is unreachable these throw
 * `OrcaUnavailableError` so callers surface an explicit unavailable state.
 */
export interface ModelFeaturesRequest {
  features: Record<string, unknown>;
}

export function predict(input: ModelFeaturesRequest): Promise<PredictResponse> {
  return predictCall(input.features as Record<string, string | number>);
}

export function explain(input: ModelFeaturesRequest): Promise<ExplainResponse> {
  return explainCall(input.features as Record<string, string | number>);
}

export function recommend(input: ModelFeaturesRequest): Promise<RecommendResponse> {
  return recommendCall(input.features as Record<string, string | number>);
}

/* ------------------------------------------------------------------ */
/* Scenario economics assumptions                                      */
/* ------------------------------------------------------------------ */

/** Operator planning assumptions applied to real model output. */
export const SCENARIO_DEFAULTS = PLANNING_DEFAULTS;

export const SCENARIO_INPUT_BOUNDS = {
  delay_cost_per_day: { min: 50, max: 1500, step: 50 },
  intervention_cost: { min: 0, max: 5000, step: 100 },
  efficacy_days: { min: 0, max: 20, step: 0.5 },
} as const;

export const scenarioMutationKey = ["orca", "scenario", "run"] as const;
