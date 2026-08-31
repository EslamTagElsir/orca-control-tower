import { queryOptions } from "@tanstack/react-query";

import { orcaRequest } from "./transport";

export interface ProductionMonitoringArtifactSummary {
  contract_version?: string | null;
  generated_utc?: string | null;
  model_version?: string | null;
  prediction_contract_version?: string | null;
  overall_status?: string | null;
  reference_window?: {
    start?: string;
    end?: string;
    rows?: number;
    data_sha256?: string;
  } | null;
  detection_window?: {
    start?: string;
    end?: string;
    rows?: number;
    data_sha256?: string;
  } | null;
  pipeline_run_id?: string | null;
}

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
  production_artifact: {
    path: string;
    present: boolean;
    valid: boolean;
    summary: ProductionMonitoringArtifactSummary | null;
    contract_version: string;
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
