/**
 * ORCA synthetic intervention policy — version `human-intervention-v1`.
 *
 * PROVENANCE CONTRACT:
 *  - Every effect produced here is a SIMULATED SCENARIO: a deterministic,
 *    bounded edit to synthetic operational state or to PRE-OUTCOME feature
 *    fields only.
 *  - This module NEVER sets or adjusts risk, tier, severity, thresholds or any
 *    model recommendation. After an effect is applied, the shipment must be
 *    re-scored by a real ORCA /predict call — that is the caller's job.
 *  - Pure planning only: the functions below return a plan, they do not mutate
 *    anything and are deliberately NOT wired into the simulation engine yet.
 *
 * Framework-agnostic: plain TypeScript, no framework imports.
 */

import { LEARNING_PROVENANCE } from "./types";
import type { DecisionAction } from "../types";

export const INTERVENTION_POLICY_VERSION = "human-intervention-v1";

/** Actions this policy version can plan an effect for. */
export const PLANNABLE_ACTIONS = [
  "NO_ACTION",
  "MONITOR",
  "HUMAN_REVIEW",
  "EXPEDITE",
  "TRANSPORT_MODE_REVIEW",
  "SUPPLIER_ESCALATION",
] as const;
export type PlannableAction = (typeof PLANNABLE_ACTIONS)[number];

export function isPlannableAction(value: string): value is PlannableAction {
  return (PLANNABLE_ACTIONS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Plan shapes                                                         */
/* ------------------------------------------------------------------ */

/**
 * A single bounded multiplicative edit to a PRE-OUTCOME feature field.
 * Only fields that describe the plan (never an outcome) may appear here.
 */
export interface FeatureMutation {
  field: PreOutcomeFeatureField;
  /** Multiplicative factor applied to the current value (0 < factor <= 1.5). */
  factor: number;
  rationale: string;
}

/**
 * Allow-list of editable pre-outcome feature fields. Outcome fields (actual
 * delivery dates, realised delay, labels) are intentionally absent.
 */
export const PRE_OUTCOME_FEATURE_FIELDS = [
  "Scheduled_Transit_Days",
  "vendor_hist_delay_rate",
  "vendor_hist_delay_median",
  "country_hist_delay_rate",
  "Line Item Quantity",
] as const;
export type PreOutcomeFeatureField = (typeof PRE_OUTCOME_FEATURE_FIELDS)[number];

/** Bounded synthetic operational state changes (no model fields). */
export interface OperationalStateMutation {
  /** Synthetic ETA recovery, in hours. */
  etaRecoveryHours: number;
  /** Fraction of any remaining synthetic hold released (0 → 1). */
  holdReleaseRatio: number;
}

/** Serializable, persistable description of a planned effect. */
export interface EffectSpec {
  policy_version: typeof INTERVENTION_POLICY_VERSION;
  action: PlannableAction;
  label: string;
  description: string;
  mutates_features: boolean;
  eta_recovery_hours: number;
  hold_release_ratio: number;
  feature_mutations: FeatureMutation[];
  requires_rescore: boolean;
  provenance: typeof LEARNING_PROVENANCE.simulatedScenario;
}

export interface InterventionPlan {
  effect_spec: EffectSpec;
  operational: OperationalStateMutation;
  featureMutations: FeatureMutation[];
  /** Human-readable audit lines, deterministic for a given action. */
  audit: string[];
}

/* ------------------------------------------------------------------ */
/* Deterministic planning functions                                    */
/* ------------------------------------------------------------------ */

interface PlanDefinition {
  label: string;
  description: string;
  etaRecoveryHours: number;
  holdReleaseRatio: number;
  featureMutations: FeatureMutation[];
}

const DEFINITIONS: Record<PlannableAction, PlanDefinition> = {
  NO_ACTION: {
    label: "No action",
    description: "No operational change and no feature edit. The shipment is released as-is.",
    etaRecoveryHours: 0,
    holdReleaseRatio: 0,
    featureMutations: [],
  },
  MONITOR: {
    label: "Monitor",
    description:
      "Keeps the shipment under watch. No feature edit; it is re-scored on its next operational trigger.",
    etaRecoveryHours: 0,
    holdReleaseRatio: 0,
    featureMutations: [],
  },
  HUMAN_REVIEW: {
    label: "Hold for human review",
    description: "Logs the review without changing the operational plan. No feature edit applied.",
    etaRecoveryHours: 0,
    holdReleaseRatio: 0,
    featureMutations: [],
  },
  EXPEDITE: {
    label: "Expedite",
    description: "Compresses planned transit days by 25% and releases half of any open hold.",
    etaRecoveryHours: 24,
    holdReleaseRatio: 0.5,
    featureMutations: [
      {
        field: "Scheduled_Transit_Days",
        factor: 0.75,
        rationale: "Expedited handling compresses the planned transit window.",
      },
    ],
  },
  TRANSPORT_MODE_REVIEW: {
    label: "Transport mode review",
    description:
      "Models a faster lane: planned transit days drop 35% and the destination delay signal eases 10%.",
    etaRecoveryHours: 18,
    holdReleaseRatio: 0.4,
    featureMutations: [
      {
        field: "Scheduled_Transit_Days",
        factor: 0.65,
        rationale: "A faster lane shortens the planned transit window.",
      },
      {
        field: "country_hist_delay_rate",
        factor: 0.9,
        rationale: "Alternate lane avoids part of the destination congestion history.",
      },
    ],
  },
  SUPPLIER_ESCALATION: {
    label: "Supplier escalation",
    description: "Reduces the vendor historical delay signals by 30%.",
    etaRecoveryHours: 12,
    holdReleaseRatio: 0.3,
    featureMutations: [
      {
        field: "vendor_hist_delay_rate",
        factor: 0.7,
        rationale: "Escalation prioritises this order in the vendor's queue.",
      },
      {
        field: "vendor_hist_delay_median",
        factor: 0.7,
        rationale: "Escalation prioritises this order in the vendor's queue.",
      },
    ],
  },
};

function buildPlan(action: PlannableAction): InterventionPlan {
  const def = DEFINITIONS[action];
  const effect_spec: EffectSpec = {
    policy_version: INTERVENTION_POLICY_VERSION,
    action,
    label: def.label,
    description: def.description,
    mutates_features: def.featureMutations.length > 0,
    eta_recovery_hours: def.etaRecoveryHours,
    hold_release_ratio: def.holdReleaseRatio,
    feature_mutations: def.featureMutations,
    requires_rescore: true,
    provenance: LEARNING_PROVENANCE.simulatedScenario,
  };
  return {
    effect_spec,
    operational: {
      etaRecoveryHours: def.etaRecoveryHours,
      holdReleaseRatio: def.holdReleaseRatio,
    },
    featureMutations: def.featureMutations,
    audit: [
      `${INTERVENTION_POLICY_VERSION} · ${action}: ${def.description}`,
      ...def.featureMutations.map(
        (m) =>
          `${m.field} × ${m.factor} — ${m.rationale} [${LEARNING_PROVENANCE.simulatedScenario}]`,
      ),
    ],
  };
}

export const planNoAction = (): InterventionPlan => buildPlan("NO_ACTION");
export const planMonitor = (): InterventionPlan => buildPlan("MONITOR");
export const planHumanReview = (): InterventionPlan => buildPlan("HUMAN_REVIEW");
export const planExpedite = (): InterventionPlan => buildPlan("EXPEDITE");
export const planTransportModeReview = (): InterventionPlan => buildPlan("TRANSPORT_MODE_REVIEW");
export const planSupplierEscalation = (): InterventionPlan => buildPlan("SUPPLIER_ESCALATION");

/** Deterministic dispatcher. Returns null for actions this version cannot plan. */
export function planIntervention(action: DecisionAction | string): InterventionPlan | null {
  return isPlannableAction(action) ? buildPlan(action) : null;
}
