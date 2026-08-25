/**
 * Human-in-the-loop decision vocabulary and bounded intervention effects.
 *
 * PROVENANCE CONTRACT:
 *  - Nothing in this module computes or adjusts a risk value, tier, severity or
 *    model recommendation. It only produces BOUNDED PRE-OUTCOME feature edits
 *    (the same class of edit the What-If adapter already uses) plus synthetic
 *    operational effects (ETA recovery, hold reduction).
 *  - After an effect is applied the shipment MUST be re-scored by a real ORCA
 *    /predict call. The engine owns that step.
 *  - Effects are deterministic: the same action always produces the same edit,
 *    so a persisted intervention row can be replayed exactly.
 *
 * Framework-agnostic: plain TypeScript.
 */

import { scaleField } from "../adapter";

export const INTERVENTION_POLICY_VERSION = "human-intervention-v1";

/* ------------------------------------------------------------------ */
/* Decision vocabulary                                                 */
/* ------------------------------------------------------------------ */

export const HUMAN_DECISIONS = ["APPROVE", "MODIFY", "REJECT", "DEFER"] as const;
export type HumanDecisionKind = (typeof HUMAN_DECISIONS)[number];

export const HUMAN_DECISION_LABEL: Record<HumanDecisionKind, string> = {
  APPROVE: "Approve recommendation",
  MODIFY: "Approve a different action",
  REJECT: "Reject — no intervention",
  DEFER: "Defer — keep monitoring",
};

/**
 * Operator action catalog. These are exactly the actions declared in the ORCA
 * backend `configs/decision.yaml` policy file — the frontend does not invent
 * operational actions.
 */
export const OPERATOR_ACTIONS = [
  "NO_ACTION",
  "MONITOR",
  "EXPEDITE",
  "SUPPLIER_ESCALATION",
  "ALTERNATIVE_SUPPLIER_REVIEW",
  "TRANSPORT_MODE_REVIEW",
  "SPLIT_ORDER_REVIEW",
  "HUMAN_REVIEW",
] as const;
export type OperatorAction = (typeof OPERATOR_ACTIONS)[number];

export function isOperatorAction(value: string): value is OperatorAction {
  return (OPERATOR_ACTIONS as readonly string[]).includes(value);
}

export const REASON_CODES = [
  "MODEL_AGREES_WITH_OPS",
  "MODEL_MISSES_CONTEXT",
  "CUSTOMER_COMMITMENT",
  "COST_NOT_JUSTIFIED",
  "CAPACITY_UNAVAILABLE",
  "SUPPLIER_ALREADY_ENGAGED",
  "INSUFFICIENT_EVIDENCE",
  "POLICY_REQUIRES_REVIEW",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const REASON_CODE_LABEL: Record<ReasonCode, string> = {
  MODEL_AGREES_WITH_OPS: "Model agrees with operational read",
  MODEL_MISSES_CONTEXT: "Model misses operational context",
  CUSTOMER_COMMITMENT: "Customer commitment forces action",
  COST_NOT_JUSTIFIED: "Cost not justified at this risk",
  CAPACITY_UNAVAILABLE: "Required capacity unavailable",
  SUPPLIER_ALREADY_ENGAGED: "Supplier already engaged",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence to act",
  POLICY_REQUIRES_REVIEW: "Policy requires manual review",
};

export function isReasonCode(value: string): value is ReasonCode {
  return (REASON_CODES as readonly string[]).includes(value);
}

/**
 * Maps the verbatim ORCA /recommend output onto the operator action the
 * recommendation implies. `INTERVENE` is deliberately mapped to HUMAN_REVIEW:
 * the backend does not name a concrete intervention, so the operator picks it.
 */
export function defaultActionFor(recommendation: string): OperatorAction {
  if (isOperatorAction(recommendation)) return recommendation;
  if (recommendation === "INTERVENE") return "EXPEDITE";
  return "MONITOR";
}

/* ------------------------------------------------------------------ */
/* Bounded intervention effects                                        */
/* ------------------------------------------------------------------ */

export interface InterventionEffect {
  action: OperatorAction;
  label: string;
  /** Plain-language description of the bounded pre-outcome edit. */
  description: string;
  /** Synthetic operational ETA recovery, in hours (deterministic). */
  etaRecoveryHours: number;
  /** Fraction of any remaining synthetic hold released (0 → 1). */
  holdReleaseRatio: number;
  /** Whether the effect changes the feature row at all. */
  mutatesFeatures: boolean;
  mutate: (raw: Record<string, string>) => Record<string, string>;
}

const passthrough = (raw: Record<string, string>) => ({ ...raw });

const EFFECTS: Record<OperatorAction, InterventionEffect> = {
  NO_ACTION: {
    action: "NO_ACTION",
    label: "No action",
    description: "No operational change and no feature edit. The shipment is released as-is.",
    etaRecoveryHours: 0,
    holdReleaseRatio: 0,
    mutatesFeatures: false,
    mutate: passthrough,
  },
  MONITOR: {
    action: "MONITOR",
    label: "Monitor",
    description:
      "Keeps the shipment under watch. No feature edit; the shipment is re-scored on its next operational trigger.",
    etaRecoveryHours: 0,
    holdReleaseRatio: 0,
    mutatesFeatures: false,
    mutate: passthrough,
  },
  EXPEDITE: {
    action: "EXPEDITE",
    label: "Expedite",
    description: "Compresses planned transit days by 25% and releases half of the open hold.",
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
    description: "Reduces the vendor historical delay signals by 30%.",
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
    description:
      "Models a better-performing vendor: vendor historical delay rate and median drop by 45%.",
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
      "Models a faster lane: planned transit days drop 35% and the destination delay signal eases 10%.",
    etaRecoveryHours: 18,
    holdReleaseRatio: 0.4,
    mutatesFeatures: true,
    mutate: (raw) => {
      const next = { ...raw };
      scaleField(next, "Scheduled_Transit_Days", 0.65);
      scaleField(next, "country_hist_delay_rate", 0.9);
      return next;
    },
  },
  SPLIT_ORDER_REVIEW: {
    action: "SPLIT_ORDER_REVIEW",
    label: "Split order review",
    description: "Halves the line item quantity and trims planned transit days by 15%.",
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
  HUMAN_REVIEW: {
    action: "HUMAN_REVIEW",
    label: "Hold for human review",
    description:
      "Logs the review without changing the operational plan. No feature edit is applied.",
    etaRecoveryHours: 0,
    holdReleaseRatio: 0,
    mutatesFeatures: false,
    mutate: passthrough,
  },
};

export function interventionEffect(action: OperatorAction): InterventionEffect {
  return EFFECTS[action];
}

/** Serializable description of an applied effect, stored on the audit row. */
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
