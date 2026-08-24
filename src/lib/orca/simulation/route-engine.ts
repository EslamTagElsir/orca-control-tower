/**
 * Synthetic route / lifecycle progression.
 *
 * Moves a generated shipment along its SYNTHETIC ROUTE PLAN and derives its
 * operational status from progress. No model value is read or written here.
 *
 * Framework-agnostic: plain TypeScript.
 */

import { positionAt } from "./geo";
import type { SimShipment, SimStatus } from "./types";

/** Progress at which each lifecycle stage begins. */
export const STAGE_GATES: { at: number; status: SimStatus }[] = [
  { at: 0, status: "CREATED" },
  { at: 0.02, status: "DISPATCHED" },
  { at: 0.07, status: "ORIGIN_HANDLING" },
  { at: 0.16, status: "IN_TRANSIT" },
  { at: 0.78, status: "CUSTOMS" },
  { at: 0.9, status: "FINAL_MILE" },
  { at: 1, status: "DELIVERED" },
];

/** Base lifecycle stage for a progress value (ignores exception overlay). */
export function stageFor(progress: number, requiresCustoms: boolean): SimStatus {
  let current: SimStatus = "CREATED";
  for (const gate of STAGE_GATES) {
    if (progress + 1e-9 < gate.at) break;
    if (gate.status === "CUSTOMS" && !requiresCustoms) continue;
    current = gate.status;
  }
  return current;
}

export function nextMilestoneFor(shipment: SimShipment): string {
  const stage = stageFor(shipment.progress, shipment.requiresCustoms);
  switch (stage) {
    case "CREATED":
      return "Dispatch from origin";
    case "DISPATCHED":
      return "Origin handling";
    case "ORIGIN_HANDLING":
      return "Carrier departure";
    case "IN_TRANSIT":
      return shipment.requiresCustoms ? "Destination customs" : "Final mile";
    case "CUSTOMS":
      return "Customs clearance";
    case "FINAL_MILE":
      return "Delivery";
    default:
      return "Journey complete";
  }
}

export interface AdvanceResult {
  /** Stage boundaries crossed by this tick, in order. */
  transitions: SimStatus[];
  /** True when the shipment reached DELIVERED on this tick. */
  delivered: boolean;
  /** True when the tick was consumed by a synthetic hold. */
  held: boolean;
}

/**
 * Advances one shipment by `simDeltaMs` of simulated time. Mutates in place —
 * the engine owns the object and publishes an immutable snapshot afterwards.
 */
export function advance(shipment: SimShipment, simDeltaMs: number): AdvanceResult {
  const transitions: SimStatus[] = [];
  if (shipment.status === "DELIVERED") return { transitions, delivered: false, held: false };

  let remaining = simDeltaMs;
  let held = false;

  if (shipment.holdMs > 0) {
    const used = Math.min(shipment.holdMs, remaining);
    shipment.holdMs -= used;
    remaining -= used;
    held = used > 0;
  }

  const before = stageFor(shipment.progress, shipment.requiresCustoms);

  if (remaining > 0) {
    shipment.travelledMs = Math.min(shipment.journeyMs, shipment.travelledMs + remaining);
    shipment.progress = Math.min(1, shipment.travelledMs / shipment.journeyMs);
    shipment.position = positionAt(shipment.waypoints, shipment.progress);
  }

  const after = stageFor(shipment.progress, shipment.requiresCustoms);
  if (after !== before) {
    // Record every gate crossed, so a fast tick still narrates in order.
    const order = STAGE_GATES.filter(
      (g) => !(g.status === "CUSTOMS" && !shipment.requiresCustoms),
    ).map((g) => g.status);
    const from = order.indexOf(before);
    const to = order.indexOf(after);
    for (let i = from + 1; i <= to; i++) transitions.push(order[i]!);
  }

  // The exception overlay wins the displayed status until it is recovered.
  if (shipment.progress >= 1) {
    shipment.status = "DELIVERED";
    shipment.exceptionOpen = false;
  } else if (shipment.exceptionOpen) {
    shipment.status = "EXCEPTION";
  } else {
    shipment.status = after;
  }
  shipment.nextMilestone = nextMilestoneFor(shipment);

  return { transitions, delivered: shipment.progress >= 1, held };
}
