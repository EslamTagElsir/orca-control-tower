/**
 * Journey Performance Analytics derivation layer.
 *
 * Two strictly separated halves:
 *
 *  1. OUTCOMES — REAL DATA. Computed purely from the bundled frozen holdout
 *     export (`holdout-data.ts`): Delay_Flag (late/on-time label) and
 *     Delay_Days (signed actual schedule variance). No backend needed, never
 *     fabricated, never labelled model output.
 *
 *  2. PREDICTION QUALITY — MODEL OUTPUT. Requires real `/predict` calls over
 *     the same rows. The backend's own `classification_decision` and
 *     `decision_threshold` decide positives; the UI never invents a threshold.
 *     If the backend is unreachable this half is simply UNAVAILABLE — fixture
 *     values are never presented as model quality.
 *
 * No monetary aggregation exists here on purpose: the export's price/value/
 * insurance columns are log-transformed model features, not raw USD.
 *
 * Framework-agnostic: plain TypeScript, no framework imports.
 */

import { predict } from "./adapter";
import { holdoutJourneys, type HoldoutJourney } from "./holdout-data";
import { mapWithConcurrency } from "./transport";
import type { PredictResponse, RiskTier } from "./types";

const CONCURRENCY = 6;

export type PredictionCategory =
  "CORRECT_DELAY_ALERT" | "MISSED_DELAY" | "FALSE_ALERT" | "CORRECT_ON_TIME";

export const CATEGORY_LABEL: Record<PredictionCategory, string> = {
  CORRECT_DELAY_ALERT: "Correct Delay Alert",
  MISSED_DELAY: "Missed Delay",
  FALSE_ALERT: "False Alert",
  CORRECT_ON_TIME: "Correct On-Time",
};

export const CATEGORY_DEFINITION: Record<PredictionCategory, string> = {
  CORRECT_DELAY_ALERT:
    "True positive — the journey actually completed LATE and ORCA flagged it above the backend decision threshold.",
  MISSED_DELAY:
    "False negative — the journey actually completed LATE but ORCA stayed below the backend decision threshold.",
  FALSE_ALERT:
    "False positive — ORCA flagged the journey above the decision threshold but it actually completed ON TIME.",
  CORRECT_ON_TIME: "True negative — the journey completed ON TIME and ORCA did not flag it.",
};

export const CATEGORY_TONE: Record<PredictionCategory, string> = {
  CORRECT_DELAY_ALERT: "text-success",
  MISSED_DELAY: "text-danger",
  FALSE_ALERT: "text-warn",
  CORRECT_ON_TIME: "text-primary",
};

/* ------------------------------------------------------------------ */
/* Outcome-only analytics (REAL DATA)                                  */
/* ------------------------------------------------------------------ */

export interface OutcomeKpis {
  completed: number;
  onTime: number;
  late: number;
  onTimeRate: number;
  /** Mean signed Delay_Days across LATE journeys only. NaN when none exist. */
  avgDelayLate: number;
  /** Mean signed Delay_Days across every completed journey (early = negative). */
  avgVarianceAll: number;
  worstDelayDays: number;
  earliestDays: number;
}

export interface DelayBin {
  label: string;
  hint: string;
  count: number;
}

export interface GroupPerformance {
  key: string;
  completed: number;
  onTime: number;
  late: number;
  onTimeRate: number;
  /** Mean signed Delay_Days for LATE journeys in the group; NaN when none. */
  avgDelayLate: number;
}

export type GroupDimension = "country" | "route" | "shipment_mode" | "vendor" | "product_group";

export const GROUP_DIMENSIONS: { key: GroupDimension; label: string; hint: string }[] = [
  { key: "country", label: "Destination Country", hint: "Real `Country` column" },
  { key: "route", label: "Lane", hint: "Real Manufacturing Site → Country" },
  { key: "shipment_mode", label: "Shipment Mode", hint: "Real `Shipment Mode` column" },
  { key: "vendor", label: "Vendor", hint: "Real `Vendor` column" },
  { key: "product_group", label: "Product Group", hint: "Real `Product Group` column" },
];

export function outcomeKpis(journeys: HoldoutJourney[]): OutcomeKpis {
  const completed = journeys.length;
  const late = journeys.filter((j) => j.late);
  const onTime = completed - late.length;
  const lateDays = late.map((j) => j.delayDays);
  const allDays = journeys.map((j) => j.delayDays);
  return {
    completed,
    onTime,
    late: late.length,
    onTimeRate: completed ? onTime / completed : Number.NaN,
    avgDelayLate: lateDays.length ? mean(lateDays) : Number.NaN,
    avgVarianceAll: allDays.length ? mean(allDays) : Number.NaN,
    worstDelayDays: allDays.length ? Math.max(...allDays) : Number.NaN,
    earliestDays: allDays.length ? Math.min(...allDays) : Number.NaN,
  };
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Bins the REAL signed Delay_Days column. Bins are expressed in the export's
 * own unit (days) — nothing is rescaled or inferred.
 */
export function delayDistribution(journeys: HoldoutJourney[]): DelayBin[] {
  const bins: DelayBin[] = [
    { label: "Early", hint: "Delay_Days < 0 — completed ahead of schedule", count: 0 },
    { label: "On schedule", hint: "Delay_Days = 0", count: 0 },
    { label: "1–3 d late", hint: "Delay_Days 1 to 3", count: 0 },
    { label: "4–7 d late", hint: "Delay_Days 4 to 7", count: 0 },
    { label: "> 7 d late", hint: "Delay_Days greater than 7", count: 0 },
  ];
  for (const j of journeys) {
    const d = j.delayDays;
    const index = d < 0 ? 0 : d === 0 ? 1 : d <= 3 ? 2 : d <= 7 ? 3 : 4;
    bins[index]!.count += 1;
  }
  return bins;
}

export function groupPerformance(
  journeys: HoldoutJourney[],
  dimension: GroupDimension,
): GroupPerformance[] {
  const buckets = new Map<string, HoldoutJourney[]>();
  for (const j of journeys) {
    const key = String(j[dimension] || "Unknown");
    const list = buckets.get(key);
    if (list) list.push(j);
    else buckets.set(key, [j]);
  }
  return [...buckets.entries()]
    .map(([key, list]) => {
      const late = list.filter((j) => j.late);
      return {
        key,
        completed: list.length,
        onTime: list.length - late.length,
        late: late.length,
        onTimeRate: (list.length - late.length) / list.length,
        avgDelayLate: late.length ? mean(late.map((j) => j.delayDays)) : Number.NaN,
      } satisfies GroupPerformance;
    })
    .sort((a, b) => b.late - a.late || b.completed - a.completed || a.key.localeCompare(b.key));
}

/* ------------------------------------------------------------------ */
/* Prediction vs actual (MODEL OUTPUT × REAL DATA)                     */
/* ------------------------------------------------------------------ */

export interface ScoredJourney {
  journey: HoldoutJourney;
  probability_late: number;
  flagged: boolean;
  risk_tier: RiskTier;
  severity_p50: number;
  category: PredictionCategory;
}

export interface ConfusionMatrix {
  scored: number;
  truePositive: number;
  falseNegative: number;
  falsePositive: number;
  trueNegative: number;
  /** Backend-supplied decision threshold, surfaced verbatim. */
  decisionThreshold: number;
  accuracy: number;
  /** Delay capture (recall) — NaN when the holdout has no late journeys. */
  recall: number;
  /** Precision — NaN when nothing was flagged. */
  precision: number;
  modelVersion: string;
}

export interface JourneyAnalytics {
  journeys: HoldoutJourney[];
  kpis: OutcomeKpis;
  /** Present only when real /predict scores were obtained. */
  scored: ScoredJourney[] | null;
  matrix: ConfusionMatrix | null;
  /** Why prediction quality is unavailable, when it is. */
  predictionUnavailableReason: string | null;
}

export function categorise(late: boolean, flagged: boolean): PredictionCategory {
  if (late) return flagged ? "CORRECT_DELAY_ALERT" : "MISSED_DELAY";
  return flagged ? "FALSE_ALERT" : "CORRECT_ON_TIME";
}

function buildMatrix(scored: ScoredJourney[], threshold: number, version: string): ConfusionMatrix {
  const count = (c: PredictionCategory) => scored.filter((s) => s.category === c).length;
  const tp = count("CORRECT_DELAY_ALERT");
  const fn = count("MISSED_DELAY");
  const fp = count("FALSE_ALERT");
  const tn = count("CORRECT_ON_TIME");
  const total = scored.length;
  return {
    scored: total,
    truePositive: tp,
    falseNegative: fn,
    falsePositive: fp,
    trueNegative: tn,
    decisionThreshold: threshold,
    accuracy: total ? (tp + tn) / total : Number.NaN,
    recall: tp + fn ? tp / (tp + fn) : Number.NaN,
    precision: tp + fp ? tp / (tp + fp) : Number.NaN,
    modelVersion: version,
  };
}

/**
 * Scores the frozen holdout rows with the REAL /predict endpoint (bounded
 * concurrency, one call per row, no /explain). Throws when unreachable — the
 * caller then renders prediction quality as unavailable rather than guessing.
 */
export async function scoreHoldout(journeys = holdoutJourneys()): Promise<{
  scored: ScoredJourney[];
  matrix: ConfusionMatrix;
}> {
  const results = await mapWithConcurrency(journeys, CONCURRENCY, async (journey) => {
    const prediction: PredictResponse = await predict(journey.features);
    return { journey, prediction };
  });

  const scored: ScoredJourney[] = results.map(({ journey, prediction }) => ({
    journey,
    probability_late: prediction.probability_late,
    flagged: prediction.classification_decision,
    risk_tier: prediction.risk_tier,
    severity_p50: prediction.severity_p50,
    category: categorise(journey.late, prediction.classification_decision),
  }));

  const first = results[0]?.prediction;
  return {
    scored,
    matrix: buildMatrix(
      scored,
      first?.decision_threshold ?? Number.NaN,
      first?.model_version ?? "unknown",
    ),
  };
}
