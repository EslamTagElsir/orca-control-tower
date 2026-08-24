/**
 * AutomaticGeneratorSource — creates SYNTHETIC OPERATIONAL DIGITAL TWIN
 * shipments from the bundled REAL ORCA feature rows used as TEMPLATES ONLY.
 *
 * Rules:
 *  - Actual outcome columns (`Delay_Flag`, `Delay_Days`) are stripped: the twin
 *    has no known outcome.
 *  - The template `ID` is kept only as `templateId` for audit; the generated
 *    shipment gets a new synthetic operational id.
 *  - One bounded creation-time bias profile is applied so the population spans
 *    the model's output range. The tier itself always comes from /predict.
 *
 * Framework-agnostic: plain TypeScript.
 */

import { holdoutJourneys, type HoldoutJourney } from "../holdout-data";
import { rowToFeatures } from "../source-data";
import type { Rng } from "../prng";
import { buildWaypoints, destinationCentroid, distanceKm, siteCentroid, siteLabel } from "./geo";
import { candidateLadder, pickShockProfile, type TargetBand } from "./mutation-profiles";
import { nextMilestoneFor } from "./route-engine";
import { UNSCORED_MODEL, type PlannedShock, type ShipmentSource, type SimShipment } from "./types";

const MINUTE = 60_000;

/** Sim-time journey duration band, before mode weighting. */
const JOURNEY_MINUTES: [number, number] = [9, 22];

function modeFactor(mode: string): number {
  if (/air/i.test(mode)) return 0.75;
  if (/ocean|sea/i.test(mode)) return 1.35;
  return 1;
}

function runShort(runId: string): string {
  return runId.replace(/^RUN-/, "");
}

/**
 * Real-signal template weight: templates whose REAL historical delay signals
 * are already at the top of the observed distribution have the most model
 * headroom, so an `elevated` candidate search starts from one of them. This
 * only biases which real row is used as a template — it never sets a risk value.
 */
function signalWeight(j: HoldoutJourney): number {
  const n = (k: string) => {
    const v = Number(j.raw[k]);
    return Number.isFinite(v) ? v : 0;
  };
  const base =
    n("country_hist_delay_rate") * 3 + n("site_hist_delay_rate") * 2 + n("vendor_hist_delay_rate");
  const rdc = /from rdc/i.test(j.raw["Fulfill Via"] ?? "") ? 0.35 : 0;
  return 0.05 + base + rdc;
}

export function createAutomaticGeneratorSource(rng: Rng): ShipmentSource {
  const templates = holdoutJourneys().filter((j) => j.raw["Manufacturing Site"]);
  const weighted = templates.map((item) => ({ item, weight: signalWeight(item) }));

  return {
    kind: "automatic",
    label: "Automatic operational generator",
    next({ simClockMs, sequence, runId, targetBand }) {
      const band: TargetBand =
        targetBand ?? (rng.chance(0.55) ? "elevated" : "baseline");
      const template = band === "elevated" ? rng.weighted(weighted) : rng.pick(templates);

      // Template features only — outcomes are removed from the twin.
      const raw: Record<string, string> = { ...template.raw };
      delete raw["Delay_Flag"];
      delete raw["Delay_Days"];
      delete raw["ID"];

      const ladder = candidateLadder(band);
      const candidates = ladder.map((p) => ({ key: p.key, label: p.label, raw: p.mutate(raw) }));
      const first = candidates[0]!;

      const mode = template.shipment_mode;
      const start = siteCentroid(template.manufacturing_site);
      const end = destinationCentroid(template.country);
      const waypoints = buildWaypoints(start, end, mode);
      const km = distanceKm(start, end);


      const baseMinutes =
        rng.float(JOURNEY_MINUTES[0], JOURNEY_MINUTES[1]) * modeFactor(mode) +
        Math.min(6, km / 2500);
      const journeyMs = Math.round(baseMinutes * MINUTE);

      const requiresCustoms = !/from rdc/i.test(template.fulfill_via) && rng.chance(0.6);

      // Plan 0–2 risk-affecting shocks up front: deterministic, bounded, and
      // the only thing in the run that triggers a /predict re-score.
      const shockCount = rng.weighted([
        { item: 0, weight: 34 },
        { item: 1, weight: 46 },
        { item: 2, weight: 20 },
      ]);
      const plannedShocks: PlannedShock[] = [];
      let cursor = rng.float(0.18, 0.34);
      for (let i = 0; i < shockCount; i++) {
        const profile = pickShockProfile(rng);
        const atProgress = Math.min(0.86, cursor);
        plannedShocks.push({
          atProgress,
          family: profile.family,
          profileKey: profile.key,
          applied: false,
          recoverAtProgress: Math.min(0.96, atProgress + rng.float(0.08, 0.2)),
          recovered: false,
        });
        cursor = atProgress + rng.float(0.22, 0.38);
        if (cursor > 0.86) break;
      }

      const shipment: SimShipment = {
        id: `SIM-${runShort(runId)}-${String(sequence).padStart(3, "0")}`,
        templateId: template.id,
        origin: siteLabel(template.manufacturing_site),
        destination: template.country,
        route: `${siteLabel(template.manufacturing_site)} \u2192 ${template.country}`,
        mode,
        vendor: template.vendor,
        productGroup: template.product_group,

        status: "CREATED",
        progress: 0,
        start,
        end,
        waypoints,
        position: start,

        createdAt: simClockMs,
        deliveredAt: null,
        journeyMs,
        travelledMs: 0,
        holdMs: 0,

        etaVarianceHours: 0,
        requiresCustoms,
        exceptionOpen: false,
        exceptionFamily: null,
        nextMilestone: "Dispatch from origin",
        latestEvent: null,

        raw: biased,
        features: rowToFeatures(biased),
        featureAudit: [],
        appliedProfiles: bias.key === "as_planned" ? [] : [bias.label],
        model: { ...UNSCORED_MODEL },
        plannedShocks,
        plannedPings: [rng.float(0.4, 0.52), rng.float(0.6, 0.72)],
        firedPings: [],
        eventCount: 0,
        lastScoreRequestAt: -Infinity,
      };
      shipment.nextMilestone = nextMilestoneFor(shipment);
      return shipment;
    },
  };
}
