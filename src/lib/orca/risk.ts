/**
 * Single source of truth for ORCA risk-tier vocabulary.
 *
 * These thresholds mirror `_risk_tier()` in the FastAPI backend EXACTLY:
 *   LOW_RISK  : p <= 0.30
 *   WATCH     : 0.30 < p <= 0.60
 *   HIGH_RISK : 0.60 < p <= 0.85
 *   CRITICAL  : p > 0.85
 *
 * The word CRITICAL is reserved for the model tier above. Demo/attention
 * cut-offs (e.g. `critical_exceptions` at risk >= 0.45) are a DIFFERENT
 * concept and must never be rendered as CRITICAL risk. Use
 * PRIORITY_ATTENTION_THRESHOLD and its label for that.
 */

import type { RiskTier } from "./types";

export const RISK_THRESHOLDS = {
  LOW_MAX: 0.3,
  WATCH_MAX: 0.6,
  HIGH_MAX: 0.85,
} as const;

/** Presenter/demo exception queue cut-off from demo_service.overview — NOT a model tier. */
export const PRIORITY_ATTENTION_THRESHOLD = 0.45;

export const PRIORITY_ATTENTION_LABEL = "Priority Exceptions";
export const PRIORITY_ATTENTION_SUBLABEL =
  "Demo attention threshold risk ≥ 0.45 — not the CRITICAL model tier";

export function riskTier(p: number): RiskTier {
  if (p <= RISK_THRESHOLDS.LOW_MAX) return "LOW_RISK";
  if (p <= RISK_THRESHOLDS.WATCH_MAX) return "WATCH";
  if (p <= RISK_THRESHOLDS.HIGH_MAX) return "HIGH_RISK";
  return "CRITICAL";
}

export const TIER_LABEL: Record<RiskTier, string> = {
  LOW_RISK: "Low",
  WATCH: "Watch",
  HIGH_RISK: "High",
  CRITICAL: "Critical",
};

export const TIER_RANGE: Record<RiskTier, string> = {
  LOW_RISK: "≤ 0.30",
  WATCH: "0.30 – 0.60",
  HIGH_RISK: "0.60 – 0.85",
  CRITICAL: "> 0.85",
};

/** Tailwind classes keyed to semantic risk tokens. */
export const TIER_CLASSES: Record<RiskTier, string> = {
  LOW_RISK: "bg-risk-low/15 text-risk-low border-risk-low/30",
  WATCH: "bg-risk-watch/15 text-risk-watch border-risk-watch/30",
  HIGH_RISK: "bg-risk-high/15 text-risk-high border-risk-high/30",
  CRITICAL: "bg-risk-critical/20 text-risk-critical border-risk-critical/40",
};

export const TIER_CSS_VAR: Record<RiskTier, string> = {
  LOW_RISK: "var(--risk-low)",
  WATCH: "var(--risk-watch)",
  HIGH_RISK: "var(--risk-high)",
  CRITICAL: "var(--risk-critical)",
};

export function tierColor(tier: RiskTier): string {
  return TIER_CSS_VAR[tier];
}

export const DECISION_CLASSES: Record<string, string> = {
  INTERVENE: "bg-danger/15 text-danger border-danger/30",
  MONITOR: "bg-warn/15 text-warn border-warn/30",
  NO_ACTION: "bg-muted text-muted-foreground border-hairline",
};
