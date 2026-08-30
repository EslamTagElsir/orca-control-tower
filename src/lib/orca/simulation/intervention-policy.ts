/**
 * Human-in-the-loop decision vocabulary and deterministic intervention effects.
 *
 * Model risk/tier/severity are never edited here. Interventions can change only
 * synthetic operational state or pre-outcome feature fields and the engine must
 * call the real ORCA /predict endpoint afterwards when an effect is applied.
 */

import { scaleField } from "../adapter";

export const INTERVENTION_POLICY_VERSION = "human-intervention-v1";

/* ------------------------------------------------------------------ */
/* Decision vocabulary                                                 */
/* ------------------------------------------------------------------ */

/** Phase 1 operator choices shown in the Resolution Hub. */
export const HUMAN_DECISIONS = ["ACCEPT", "MODIFY", "REJECT"] as const;
export type CurrentHumanDecisionKind = (typeof HUMAN_DECISIONS)[number];
/** Legacy values are accepted only so an old session snapshot can still load. */
export type HumanDecisionKind = CurrentHumanDecisionKind | "APPROVE" | "DEFER";

export const HUMAN_DECISION_LABEL: Record<CurrentHumanDecisionKind, string> = {
  ACCEPT: "Accept recommended action",
  MODIFY: "Choose a different action",
  REJECT: "Reject — no action",
};

/**
 * Structured action catalog. Values returned by `/recommend` are preserved
 * verbatim whenever they are in this catalog. `INTERVENE` is kept only for
 * compatibility with older policy configurations and is not silently remapped.
 */
export const OPERATOR_ACTIONS = [
  "NO_ACTION",
  "MONITOR",
  "HUMAN_REVIEW",
  "TRANSPORT_MODE_REVIEW",
  "SUPPLIER_ESCALATION",
  "ALTERNATIVE_SUPPLIER_REVIEW",
  "SPLIT_ORDER_REVIEW",
  "EXPEDITE",
  "INTERVENE",
] as const;
export type OperatorAction = (typeof OPERATOR_ACTIONS)[number];

export function isOperatorAction(value: string): value is OperatorAction {
  return (OPERATOR_ACTIONS as readonly string[]).includes(value);
}

export const REASON_CODES = [
  "COST_CONSTRAINT",
  "SERVICE_PRIORITY",
  "OPERATIONAL_CONSTRAINT",
  "INSUFFICIENT_EVIDENCE",
  "PREFER_ALTERNATIVE_ACTION",
  "OTHER",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const REASON_CODE_LABEL: Record<ReasonCode, string> = {
  COST_CONSTRAINT: "Cost constraint",
  SERVICE_PRIORITY: "Service priority",
  OPERATIONAL_CONSTRAINT: "Operational constraint",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  PREFER_ALTERNATIVE_ACTION: "Prefer alternative action",
  OTHER: "Other",
};

export function isReasonCode(value: string): value is ReasonCode {
  return (REASON_CODES as readonly string[]).includes(value);
}

/**
 * ACCEPT must preserve the exact backend action. Unknown backend values cannot
 * be invented into a concrete intervention, so they are held for HUMAN_REVIEW.
 */
export function defaultActionFor(recommendation: string): OperatorAction {
  return isOperatorAction(recommendation) ? recommendation : "HUMAN_REVIEW";
}

/* ------------------------------------------------------------------ */
/* Bounded intervention effects                                        */
/* ------------------------------------------------------------------ */

export interface InterventionEffect {
  action: OperatorAction;
  label: string;
  description: string;
  etaRecoveryHours: number;
  holdReleaseRatio: number;
  mutatesFeatures: boolean;
  mutate: (raw: Record<string, string>) => Record<string, string>;
}

const passthrough = (raw: Record<string, string>) => ({ ...raw });

const EFFECTS: Record<OperatorAction, InterventionEffect> = {
  NO_ACTION: {
    action: "NO_ACTION",
    label: "No action",
    description: "No operational or feature change.",
    etaRecoveryHours: 0,
    holdReleaseRatio: 0,
    mutatesFeatures: false,
    mutate: passthrough,
  },
  MONITOR: {
    action: "MONITOR",
    label: "Monitor",
    description: "Workflow-only monitoring; no feature change.",
    etaRecoveryHours: 0,
    holdReleaseRatio: 0,
    mutatesFeatures: false,
    mutate: passthrough,
  },
  HUMAN_REVIEW: {
    action: "HUMAN_REVIEW",
    label: "Human review",
    description: "Workflow-only review; no feature change.",
    etaRecoveryHours: 0,
    holdReleaseRatio: 0,
    mutatesFeatures: false,
    mutate: passthrough,
  },
  INTERVENE: {
    action: "INTERVENE",
    label: "Generic intervention",
    description:
      "Legacy generic recommendation retained verbatim. No concrete feature edit is invented; a re-score may still audit the unchanged state.",
    etaRecoveryHours: 0,
    holdReleaseRatio: 0,
    mutatesFeatures: false,
    mutate: passthrough,
  },
  EXPEDITE: {
    action: "EXPEDITE",
    label: "Expedite",
    description: "Reduce planned transit days by 25% and release half of the synthetic hold.",
    etaRecoveryHours: 24,
    holdReleaseRatio: 0.5,
    mutatesFeatures: true,
    mutate: (raw) => {
      const next = { ...raw };
      scaleField(next, "Scheduled_Transit_Days", 0.75);
      return next;
    },
  },
  SUPPLIER_ESCALATION: {
    action: "SUPPLIER_ESCALATION",
    label: "Supplier escalation",
    description: "Improve vendor historical-delay scenario fields by a bounded 30%.",
    etaRecoveryHours: 12,
    holdReleaseRatio: 0.3,
    mutatesFeatures: true,
    mutate: (raw) => {
      const next = { ...raw };
      scaleField(next, "vendor_hist_delay_rate", 0.7);
      scaleField(next, "vendor_hist_delay_median", 0.7);
      return next;
    },
  },
  ALTERNATIVE_SUPPLIER_REVIEW: {
    action: "ALTERNATIVE_SUPPLIER_REVIEW",
    label: "Alternative supplier review",
    description: "Model a bounded improvement to vendor historical-delay scenario fields.",
    etaRecoveryHours: 8,
    holdReleaseRatio: 0.2,
    mutatesFeatures: true,
    mutate: (raw) => {
      const next = { ...raw };
      scaleField(next, "vendor_hist_delay_rate", 0.55);
      scaleField(next, "vendor_hist_delay_median", 0.55);
      return next;
    },
  },
  TRANSPORT_MODE_REVIEW: {
    action: "TRANSPORT_MODE_REVIEW",
    label: "Transport mode review",
    description:
      "If the model feature row contains Shipment Mode, switch the simulated scenario to Air and shorten planned transit by a bounded 35%.",
    etaRecoveryHours: 18,
    holdReleaseRatio: 0.4,
    mutatesFeatures: true,
    mutate: (raw) => {
      const next = { ...raw };
      if (Object.prototype.hasOwnProperty.call(next, "Shipment Mode"))
        next["Shipment Mode"] = "Air";
      scaleField(next, "Scheduled_Transit_Days", 0.65);
      return next;
    },
  },
  SPLIT_ORDER_REVIEW: {
    action: "SPLIT_ORDER_REVIEW",
    label: "Split order review",
    description: "Halve line-item quantity and trim planned transit by a bounded 15%.",
    etaRecoveryHours: 10,
    holdReleaseRatio: 0.25,
    mutatesFeatures: true,
    mutate: (raw) => {
      const next = { ...raw };
      scaleField(next, "Line Item Quantity", 0.5);
      scaleField(next, "Scheduled_Transit_Days", 0.85);
      return next;
    },
  },
};

export function interventionEffect(action: OperatorAction): InterventionEffect {
  return EFFECTS[action];
}

export function effectSpec(effect: InterventionEffect) {
  return {
    policy_version: INTERVENTION_POLICY_VERSION,
    action: effect.action,
    description: effect.description,
    eta_recovery_hours: effect.etaRecoveryHours,
    hold_release_ratio: effect.holdReleaseRatio,
    mutates_features: effect.mutatesFeatures,
    provenance: "SIMULATED SCENARIO",
  };
}
