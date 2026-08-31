import { queryOptions } from "@tanstack/react-query";

import { orcaRequest } from "./transport";

export interface ReliabilitySplits {
  train?: {
    rows?: number;
    end_exclusive?: string;
  };
  embargo_days?: number;
  calibration?: {
    rows?: number;
    start?: string;
    end_exclusive?: string;
  };
  holdout?: {
    rows?: number;
    start?: string;
    end?: string;
  };
}

export interface ClassificationReliability {
  pr_auc?: number;
  roc_auc?: number;
  f1?: number;
  precision?: number;
  recall?: number;
  balanced_accuracy?: number;
  brier_score?: number;
  decision_threshold?: number;
}

export interface SeverityCqrReliability {
  target?: string;
  holdout_delayed_rows?: number;
  nominal_coverage?: number;
  empirical_coverage_delayed_only?: number;
  mean_interval_width_delayed_only?: number;
  median_interval_width_delayed_only?: number;
  q_adjustment?: number;
  median_prediction_mean?: number;
}

export interface ReliabilityResponse {
  status: string;
  model_version?: string | null;
  prediction_contract_version?: string | null;
  registry_role?: string | null;
  created_utc?: string | null;
  evidence_label?: string | null;
  evaluation_role?: string | null;
  data_sha256?: string | null;
  splits: ReliabilitySplits;
  classification: ClassificationReliability;
  severity_cqr: SeverityCqrReliability;
}

export function getReliability(): Promise<ReliabilityResponse> {
  return orcaRequest<ReliabilityResponse>("/reliability", { timeoutMs: 15_000 });
}

export const reliabilityQuery = () =>
  queryOptions({
    queryKey: ["orca", "reliability"] as const,
    queryFn: getReliability,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });
