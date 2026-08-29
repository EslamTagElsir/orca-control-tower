/**
 * ORCA Human-in-the-Loop decision-learning domain types.
 *
 * PROVENANCE CONTRACT:
 *  - Nothing in this module produces, adjusts or infers a risk value, tier,
 *    severity or model recommendation. Model fields are always copied verbatim
 *    from a real ORCA /predict + /recommend call.
 *  - Human decisions are real decisions recorded against a SYNTHETIC
 *    simulation; outcomes observed in the simulation are synthetic.
 *
 * Framework-agnostic: plain TypeScript, no framework imports.
 */

import type { DecisionAction, DisplayTier } from "../types";

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

export const LEARNING_PROVENANCE = {
  /** A real operator decision recorded against the synthetic simulation. */
  humanDecision: "HUMAN DECISION ON SYNTHETIC SIMULATION",
  /** An outcome observed inside the synthetic simulation. */
  syntheticOutcome: "SYNTHETIC SIMULATION OUTCOME",
  /** A bounded pre-outcome feature/state edit produced by an intervention. */
  simulatedScenario: "SIMULATED SCENARIO",
  /** Verbatim ORCA model output. */
  model: "MODEL OUTPUT",
} as const;

export type LearningProvenance = (typeof LEARNING_PROVENANCE)[keyof typeof LEARNING_PROVENANCE];

/* ------------------------------------------------------------------ */
/* Decision vocabulary                                                 */
/* ------------------------------------------------------------------ */

export const HUMAN_DECISION_TYPES = ["ACCEPT", "REJECT", "MODIFY"] as const;
export type HumanDecisionType = (typeof HUMAN_DECISION_TYPES)[number];

export const HUMAN_DECISION_TYPE_LABEL: Record<HumanDecisionType, string> = {
  ACCEPT: "Accept the recommended action",
  REJECT: "Reject — take no action",
  MODIFY: "Modify — choose a different action",
};

export const DECISION_EPISODE_STATUSES = [
  "AWAITING_HUMAN_DECISION",
  "DECIDED",
  "INTERVENTION_APPLIED",
  "OUTCOME_RECORDED",
] as const;
export type DecisionEpisodeStatus = (typeof DECISION_EPISODE_STATUSES)[number];

export const DECISION_EPISODE_STATUS_LABEL: Record<DecisionEpisodeStatus, string> = {
  AWAITING_HUMAN_DECISION: "Awaiting human decision",
  DECIDED: "Decided",
  INTERVENTION_APPLIED: "Intervention applied",
  OUTCOME_RECORDED: "Outcome recorded",
};

export const DECISION_REASON_CODES = [
  "COST_CONSTRAINT",
  "SERVICE_PRIORITY",
  "OPERATIONAL_CONSTRAINT",
  "INSUFFICIENT_EVIDENCE",
  "PREFER_ALTERNATIVE_ACTION",
  "OTHER",
] as const;
export type DecisionReasonCode = (typeof DECISION_REASON_CODES)[number];

export const DECISION_REASON_CODE_LABEL: Record<DecisionReasonCode, string> = {
  COST_CONSTRAINT: "Cost not justified at this risk level",
  SERVICE_PRIORITY: "Customer / service commitment takes priority",
  OPERATIONAL_CONSTRAINT: "Operational or capacity constraint",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence to act",
  PREFER_ALTERNATIVE_ACTION: "A different action fits better",
  OTHER: "Other (see note)",
};

export function isHumanDecisionType(value: string): value is HumanDecisionType {
  return (HUMAN_DECISION_TYPES as readonly string[]).includes(value);
}

export function isDecisionEpisodeStatus(value: string): value is DecisionEpisodeStatus {
  return (DECISION_EPISODE_STATUSES as readonly string[]).includes(value);
}

export function isDecisionReasonCode(value: string): value is DecisionReasonCode {
  return (DECISION_REASON_CODES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Episode structures                                                  */
/* ------------------------------------------------------------------ */

/** Verbatim ORCA inference captured at the moment an episode opened. */
export interface EpisodeModelSnapshot {
  risk: number | null;
  tier: DisplayTier;
  severity_p50: number | null;
  severity_interval_90: [number, number] | null;
  classification_decision: boolean | null;
  decision_threshold: number | null;
  model_version: string | null;
  provenance: LearningProvenance;
}

/** Verbatim ORCA /recommend output an episode is asking a human to answer. */
export interface EpisodeRecommendation {
  /** Validated action; `UNKNOWN` when the backend returned an unmodelled value. */
  action: DecisionAction;
  /** The backend string exactly as received. */
  raw: string;
  reasons: string[];
  human_approval_required: boolean;
  provenance: LearningProvenance;
}

/** A human decision recorded against an episode. */
export interface HumanDecisionRecord {
  type: HumanDecisionType;
  /** The action the operator actually chose (equals the recommendation on ACCEPT). */
  chosenAction: DecisionAction;
  /** Verbatim recommended action the operator responded to. */
  recommendedActionRaw: string;
  reasonCode: DecisionReasonCode;
  note: string | null;
  actorLabel: string;
  decidedAtEpoch: number;
  decidedSimMs: number;
  /** Wall-clock ms between the episode opening and the decision. */
  latencyMs: number;
  provenance: LearningProvenance;
}

/** Outcome observed for an episode inside the synthetic simulation. */
export interface EpisodeOutcomeRecord {
  delivered: boolean;
  /** Synthetic ETA variance in hours at the moment of the outcome. */
  etaVarianceHours: number | null;
  /** Verbatim post-intervention /predict probability, when re-scored. */
  riskAfter: number | null;
  tierAfter: DisplayTier;
  observedAtEpoch: number;
  observedSimMs: number;
  provenance: LearningProvenance;
}

/** The auditable unit binding a model inference to the human answer. */
export interface DecisionEpisodeRecord {
  id: string;
  runId: string;
  shipmentId: string;
  route: string;
  status: DecisionEpisodeStatus;
  openedAtEpoch: number;
  openedSimMs: number;
  triggerEventId: string | null;
  model: EpisodeModelSnapshot;
  recommendation: EpisodeRecommendation;
  decision: HumanDecisionRecord | null;
  /** Feature/state audit lines from the applied intervention, if any. */
  interventionAudit: string[];
  outcome: EpisodeOutcomeRecord | null;
}
