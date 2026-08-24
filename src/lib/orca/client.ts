/**
 * Centralised ORCA service layer.
 *
 * Rules:
 *  - No component ever calls fetch directly.
 *  - The only URL used here is the relative `/api/orca/*` proxy path. A FastAPI
 *    URL never appears in client code.
 *  - When the proxy reports the backend unreachable or unconfigured, we fall
 *    back to labelled fixtures and mark the payload `source: "fixture"`.
 *
 * Framework-agnostic apart from the TanStack Query option factories at the
 * bottom (queryOptions objects are plain data and port cleanly).
 */

import { queryOptions } from "@tanstack/react-query";

import {
  fixtureOverview,
  fixtureScenarioRun,
  fixtureScenarios,
  fixtureShipment,
} from "./fixtures";
import type {
  DataSource,
  HealthResponse,
  OverviewResponse,
  ScenarioOption,
  ScenarioRunResponse,
  ShipmentDetailResponse,
} from "./types";

export const ORCA_BASE_PATH = "/api/orca";

export const FIXTURE_NOTICE = "OFFLINE FIXTURE DATA — NOT ORCA OUTPUT";

export interface Sourced<T> {
  data: T;
  source: DataSource;
  /** Present when we fell back; human-readable reason. */
  reason?: string;
}

export class OrcaUnavailableError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OrcaUnavailableError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${ORCA_BASE_PATH}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (error) {
    throw new OrcaUnavailableError(
      error instanceof Error ? error.message : "Network request failed",
      0,
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  const record = (payload ?? {}) as Record<string, unknown>;

  // The proxy reports "no live ORCA backend" as a 200 envelope so the browser
  // does not treat an expected fixture-mode state as an HTTP failure.
  if (record["orca_unavailable"] === true) {
    throw new OrcaUnavailableError(
      typeof record["detail"] === "string" ? record["detail"] : "ORCA API unreachable",
      0,
    );
  }

  if (!response.ok) {
    const detail =
      typeof record["detail"] === "string"
        ? record["detail"]
        : typeof record["error"] === "string"
          ? record["error"]
          : `ORCA request failed (${response.status})`;
    throw new OrcaUnavailableError(detail, response.status);
  }

  return payload as T;
}

/** True when the failure means "no live backend", i.e. fixture fallback is correct. */
function isUnreachable(error: unknown): boolean {
  return (
    error instanceof OrcaUnavailableError &&
    (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504)
  );
}

async function withFixture<T>(
  live: () => Promise<T>,
  fallback: () => T,
): Promise<Sourced<T>> {
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

export async function getHealth(): Promise<Sourced<HealthResponse | null>> {
  try {
    return { data: await request<HealthResponse>("/health"), source: "live" };
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
  const query = seed ? `?seed=${seed}` : "";
  return withFixture(
    () => request<OverviewResponse>(`/demo/overview${query}`),
    () => fixtureOverview(seed),
  );
}

export function getShipment(
  shipmentId: string,
  seed?: number,
): Promise<Sourced<ShipmentDetailResponse>> {
  const query = seed ? `?seed=${seed}` : "";
  return withFixture(
    () => request<ShipmentDetailResponse>(`/demo/shipments/${encodeURIComponent(shipmentId)}${query}`),
    () => fixtureShipment(shipmentId, seed),
  );
}

export function getScenarios(): Promise<Sourced<ScenarioOption[]>> {
  return withFixture(
    async () => (await request<{ scenarios: ScenarioOption[] }>("/demo/scenarios")).scenarios,
    () => fixtureScenarios(),
  );
}

export interface ScenarioRunInput {
  shipment_id: string;
  scenario_key: string;
  delay_cost_per_day: number;
  intervention_cost: number;
  efficacy_days: number;
  seed?: number;
}

export function runScenario(input: ScenarioRunInput): Promise<Sourced<ScenarioRunResponse>> {
  return withFixture(
    () =>
      request<ScenarioRunResponse>("/demo/scenario", {
        method: "POST",
        body: JSON.stringify(input),
      }),
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

export const orcaKeys = {
  health: ["orca", "health"] as const,
  overview: (seed?: number) => ["orca", "overview", seed ?? "default"] as const,
  shipment: (id: string, seed?: number) => ["orca", "shipment", id, seed ?? "default"] as const,
  scenarios: ["orca", "scenarios"] as const,
};

export const healthQuery = (refetchInterval: number | false = 20_000) =>
  queryOptions({
    queryKey: orcaKeys.health,
    queryFn: () => getHealth(),
    refetchInterval,
    staleTime: 10_000,
    retry: false,
  });

export const overviewQuery = (seed?: number, refetchInterval: number | false = 30_000) =>
  queryOptions({
    queryKey: orcaKeys.overview(seed),
    queryFn: () => getOverview(seed),
    refetchInterval,
    staleTime: 15_000,
    retry: false,
  });

export const shipmentQuery = (id: string | null, seed?: number) =>
  queryOptions({
    queryKey: orcaKeys.shipment(id ?? "none", seed),
    queryFn: () => getShipment(id as string, seed),
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: false,
  });

export const scenariosQuery = () =>
  queryOptions({
    queryKey: orcaKeys.scenarios,
    queryFn: () => getScenarios(),
    staleTime: 5 * 60_000,
    retry: false,
  });
