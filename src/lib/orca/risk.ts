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

import type { DisplayTier, RiskTier } from "./types";

export const RISK_THRESHOLDS = {
  LOW_MAX: 0.3,
  WATCH_MAX: 0.6,
  HIGH_MAX: 0.85,
} as const;

/** Presenter exception-queue cut-off — NOT a model tier. */
export const PRIORITY_ATTENTION_THRESHOLD = 0.3;

export const PRIORITY_ATTENTION_LABEL = "Priority Exceptions";
export const PRIORITY_ATTENTION_SUBLABEL =
  "Highest predicted late-risk shipments — queue ordering, not the CRITICAL model tier";

export function riskTier(p: number): RiskTier {
  if (p <= RISK_THRESHOLDS.LOW_MAX) return "LOW_RISK";
  if (p <= RISK_THRESHOLDS.WATCH_MAX) return "WATCH";
  if (p <= RISK_THRESHOLDS.HIGH_MAX) return "HIGH_RISK";
  return "CRITICAL";
}

export const TIER_LABEL: Record<DisplayTier, string> = {
  LOW_RISK: "Low",
  WATCH: "Watch",
  HIGH_RISK: "High",
  CRITICAL: "Critical",
  UNSCORED: "Unscored",
};

export const TIER_RANGE: Record<DisplayTier, string> = {
  LOW_RISK: "≤ 0.30",
  WATCH: "0.30 – 0.60",
  HIGH_RISK: "0.60 – 0.85",
  CRITICAL: "> 0.85",
  UNSCORED: "no ORCA score available",
};

/** Tailwind classes keyed to semantic risk tokens. UNSCORED stays neutral. */
export const TIER_CLASSES: Record<DisplayTier, string> = {
  LOW_RISK: "bg-risk-low/15 text-risk-low border-risk-low/30",
  WATCH: "bg-risk-watch/15 text-risk-watch border-risk-watch/30",
  HIGH_RISK: "bg-risk-high/15 text-risk-high border-risk-high/30",
  CRITICAL: "bg-risk-critical/20 text-risk-critical border-risk-critical/40",
  UNSCORED: "bg-muted text-muted-foreground border-hairline",
};

export const TIER_CSS_VAR: Record<DisplayTier, string> = {
  LOW_RISK: "var(--risk-low)",
  WATCH: "var(--risk-watch)",
  HIGH_RISK: "var(--risk-high)",
  CRITICAL: "var(--risk-critical)",
  UNSCORED: "var(--muted-foreground)",
};

/**
 * Hex mirror of the risk tokens for renderers that cannot parse CSS custom
 * properties or oklch() — currently MapLibre paint expressions. Keep in sync
 * with --risk-* in src/styles.css.
 */
export const TIER_MAP_HEX: Record<RiskTier, string> = {
  LOW_RISK: "#1cb474",
  WATCH: "#ecab21",
  HIGH_RISK: "#f36c24",
  CRITICAL: "#e8273c",
  UNSCORED: "#8b93ab",
};

export function tierColor(tier: DisplayTier): string {
  return TIER_CSS_VAR[tier];
}

export const DECISION_CLASSES: Record<string, string> = {
  INTERVENE: "bg-danger/15 text-danger border-danger/30",
  MONITOR: "bg-warn/15 text-warn border-warn/30",
  NO_ACTION: "bg-muted text-muted-foreground border-hairline",
};
