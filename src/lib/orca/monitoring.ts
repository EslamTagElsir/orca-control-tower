import { queryOptions } from "@tanstack/react-query";

import { orcaRequest } from "./transport";

export interface MonitoringReadinessResponse {
  status: "CONNECTED" | "NOT_CONNECTED" | string;
  evidence_label: string;
  production_monitoring_connected: boolean;
  live_window_connected: boolean;
  drift_engine: {
    available: boolean;
    config_available: boolean;
    engine_files: Record<string, boolean>;
    dimensions: string[];
    methods: string[];
  };
  historical_evaluation: {
    runner_available: boolean;
    scope: string;
    final_holdout_quarantined_by_design: boolean;
    artifacts_available: boolean;
    artifact_files: Record<string, boolean>;
  };
  claim_boundary: string;
  blockers: string[];
}

export function getMonitoringReadiness(): Promise<MonitoringReadinessResponse> {
  return orcaRequest<MonitoringReadinessResponse>("/monitoring-readiness", { timeoutMs: 15_000 });
}

export const monitoringReadinessQuery = () =>
  queryOptions({
    queryKey: ["orca", "monitoring-readiness"] as const,
    queryFn: getMonitoringReadiness,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: false,
  });
