/**
 * Synthetic operational event engine.
 *
 * Produces SYNTHETIC LIVE OPERATIONS narration and applies bounded PRE-OUTCOME
 * feature shocks. It NEVER assigns a risk value, tier, severity or decision —
 * risk-affecting events only mark the shipment for a real /predict re-score.
 *
 * Framework-agnostic: plain TypeScript.
 */

import { auditTrail } from "../adapter";
import { rowToFeatures } from "../source-data";
import type { Rng } from "../prng";
import { shockProfile, type MutationProfile } from "./mutation-profiles";
import {
  FAMILY_EVENT_TYPE,
  SIM_PROVENANCE,
  type SimEvent,
  type SimEventFamily,
  type SimShipment,
  type SimStatus,
} from "./types";

const MINUTE = 60_000;

/** HH:MM:SS operational clock derived from run start + simulated elapsed time. */
export function opsClock(startedAtEpoch: number, simClockMs: number): string {
  const d = new Date(startedAtEpoch + simClockMs);
  return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

let sequence = 0;

export function makeEvent(args: {
  startedAtEpoch: number;
  simClockMs: number;
  shipmentId: string;
  family: SimEventFamily;
  detail: string;
  provenance?: string;
  riskBefore?: number | null;
  riskAfter?: number | null;
  featureAudit?: string[];
}): SimEvent {
  sequence += 1;
  return {
    id: `EV-${sequence.toString(36).toUpperCase()}`,
    at: args.simClockMs,
    clock: opsClock(args.startedAtEpoch, args.simClockMs),
    shipmentId: args.shipmentId,
    family: args.family,
    eventType: FAMILY_EVENT_TYPE[args.family],
    detail: args.detail,
    provenance: args.provenance ?? SIM_PROVENANCE.ops,
    ...(args.riskBefore !== undefined ? { riskBefore: args.riskBefore } : {}),
    ...(args.riskAfter !== undefined ? { riskAfter: args.riskAfter } : {}),
    ...(args.featureAudit !== undefined ? { featureAudit: args.featureAudit } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Routine narration — never calls the model                           */
/* ------------------------------------------------------------------ */

export function stageDetail(shipment: SimShipment, status: SimStatus): string {
  switch (status) {
    case "DISPATCHED":
      return `Dispatched from ${shipment.origin} · ${shipment.mode}`;
    case "ORIGIN_HANDLING":
      return `Origin handling complete at ${shipment.origin}`;
    case "IN_TRANSIT":
      return `Carrier departed ${shipment.origin} for ${shipment.destination}`;
    case "CUSTOMS":
      return `Arrived at ${shipment.destination} customs`;
    case "FINAL_MILE":
      return `Final mile started in ${shipment.destination}`;
    case "DELIVERED":
      return `Delivered in ${shipment.destination}`;
    default:
      return `Status ${status}`;
  }
}

export function stageFamily(status: SimStatus): SimEventFamily {
  switch (status) {
    case "DISPATCHED":
      return "DISPATCH";
    case "ORIGIN_HANDLING":
      return "ORIGIN_HANDLING";
    case "IN_TRANSIT":
      return "IN_TRANSIT";
    case "CUSTOMS":
      return "CUSTOMS_HOLD";
    case "FINAL_MILE":
      return "FINAL_MILE";
    case "DELIVERED":
      return "DELIVERED";
    default:
      return "SPAWN";
  }
}

export function pingDetail(shipment: SimShipment, rng: Rng): string {
  const pct = Math.round(shipment.progress * 100);
  const flavour = rng.pick([
    "position report",
    "leg update",
    "carrier milestone scan",
    "network position ping",
  ]);
  return `${flavour} · ${pct}% of synthetic route · next: ${shipment.nextMilestone}`;
}

/* ------------------------------------------------------------------ */
/* Risk-affecting shocks — mark for a real /predict re-score           */
/* ------------------------------------------------------------------ */

export interface ShockOutcome {
  profile: MutationProfile;
  detail: string;
  audit: string[];
}

/**
 * Applies a bounded pre-outcome feature shock in place and records the audit.
 * The caller is responsible for requesting the /predict re-score.
 */
export function applyShock(shipment: SimShipment, profileKey: string, rng: Rng): ShockOutcome {
  const profile = shockProfile(profileKey);
  const before = shipment.raw;
  const after = profile.mutate(before);
  const audit = auditTrail(before, after);

  shipment.raw = after;
  shipment.features = rowToFeatures(after);
  shipment.featureAudit = [...shipment.featureAudit, ...audit];
  shipment.appliedProfiles = [...shipment.appliedProfiles, profile.label];

  const slip = Math.round(rng.float(profile.etaSlipHours[0], profile.etaSlipHours[1]));
  shipment.etaVarianceHours += slip;
  shipment.holdMs += rng.float(profile.holdMinutes[0], profile.holdMinutes[1]) * MINUTE;
  shipment.exceptionOpen = true;
  shipment.exceptionFamily = profile.family;

  return {
    profile,
    detail: `${profile.label} on ${shipment.route} · ETA slip +${slip}h · pre-outcome features shocked (${SIM_PROVENANCE.shockInput}) → /predict re-score requested`,
    audit,
  };
}

export function resolveShock(shipment: SimShipment, rng: Rng): string {
  const family = shipment.exceptionFamily;
  const recovered = Math.round(
    Math.min(shipment.etaVarianceHours, rng.float(2, Math.max(3, shipment.etaVarianceHours * 0.5))),
  );
  shipment.etaVarianceHours = Math.max(0, shipment.etaVarianceHours - recovered);
  shipment.exceptionOpen = false;
  shipment.exceptionFamily = null;
  const label = family === "CUSTOMS_HOLD" ? "Customs cleared" : "Exception recovered";
  return `${label} · ${shipment.route} · ${recovered}h of ETA slip recovered by expedited handling`;
}

export function recoveryFamily(family: SimEventFamily | null): SimEventFamily {
  return family === "CUSTOMS_HOLD" ? "CUSTOMS_CLEARED" : "RECOVERY";
}
