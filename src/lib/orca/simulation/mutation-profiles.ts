/**
 * Bounded PRE-OUTCOME feature mutation profiles.
 *
 * Every recipe here is the same class of safe perturbation already used by the
 * What-If adapter: it only touches planning / historical-signal columns that
 * exist on the real feature row, never an outcome column, and never a model
 * output. The result is fed to a real ORCA /predict call — this module NEVER
 * derives a risk value or tier itself.
 *
 * Framework-agnostic: plain TypeScript.
 */

import { scaleField } from "../adapter";
import type { Rng } from "../prng";
import type { SimEventFamily } from "./types";

export interface MutationProfile {
  key: string;
  label: string;
  /** Event family this profile is narrated as. */
  family: SimEventFamily;
  description: string;
  /** Synthetic operational ETA slip range, in hours. */
  etaSlipHours: [number, number];
  /** Synthetic operational hold range, in sim minutes. */
  holdMinutes: [number, number];
  mutate: (raw: Record<string, string>) => Record<string, string>;
}

const clampRate = 1;

/* ------------------------------------------------------------------ */
/* Risk-affecting operational profiles                                 */
/* ------------------------------------------------------------------ */

export const SHOCK_PROFILES: MutationProfile[] = [
  {
    key: "customs_hold",
    label: "Customs hold",
    family: "CUSTOMS_HOLD",
    description:
      "Raises destination-country historical delay signals and planned transit days, then re-scores with /predict.",
    etaSlipHours: [12, 54],
    holdMinutes: [1.5, 4],
    mutate: (raw) => {
      const next = { ...raw };
      scaleField(next, "country_hist_delay_rate", 1.8, clampRate);
      scaleField(next, "Scheduled_Transit_Days", 1.3);
      const median = Number(next["country_hist_delay_median"]);
      if (Number.isFinite(median)) next["country_hist_delay_median"] = String(median + 5);
      return next;
    },
  },
  {
    key: "port_congestion",
    label: "Port congestion",
    family: "PORT_CONGESTION",
    description:
      "Raises site and destination historical delay signals plus planned transit days, then re-scores with /predict.",
    etaSlipHours: [18, 72],
    holdMinutes: [2, 5],
    mutate: (raw) => {
      const next = { ...raw };
      scaleField(next, "site_hist_delay_rate", 1.5, clampRate);
      scaleField(next, "country_hist_delay_rate", 1.6, clampRate);
      scaleField(next, "Scheduled_Transit_Days", 1.45);
      return next;
    },
  },
  {
    key: "carrier_delay",
    label: "Carrier delay",
    family: "CARRIER_DELAY",
    description:
      "Raises vendor historical delay rate and median, then re-scores with /predict (vendor-reliability recipe).",
    etaSlipHours: [8, 40],
    holdMinutes: [1, 3],
    mutate: (raw) => {
      const next = { ...raw };
      scaleField(next, "vendor_hist_delay_rate", 1.7, clampRate);
      const median = Number(next["vendor_hist_delay_median"]);
      if (Number.isFinite(median)) next["vendor_hist_delay_median"] = String(median + 7);
      return next;
    },
  },
  {
    key: "route_disruption",
    label: "Route disruption",
    family: "ROUTE_DISRUPTION",
    description:
      "Lane-disruption recipe: site + destination historical delay signals and planned transit days rise.",
    etaSlipHours: [20, 90],
    holdMinutes: [2, 6],
    mutate: (raw) => {
      const next = { ...raw };
      scaleField(next, "site_hist_delay_rate", 1.6, clampRate);
      scaleField(next, "country_hist_delay_rate", 1.75, clampRate);
      scaleField(next, "Scheduled_Transit_Days", 1.35);
      scaleField(next, "Forecast_Horizon_Days", 1.2);
      return next;
    },
  },
  {
    key: "weather_delay",
    label: "Weather delay",
    family: "WEATHER_DELAY",
    description:
      "Raises planned transit days and destination historical delay rate, then re-scores with /predict.",
    etaSlipHours: [6, 36],
    holdMinutes: [1, 3.5],
    mutate: (raw) => {
      const next = { ...raw };
      scaleField(next, "Scheduled_Transit_Days", 1.5);
      scaleField(next, "country_hist_delay_rate", 1.4, clampRate);
      return next;
    },
  },
];

export function shockProfile(key: string): MutationProfile {
  return SHOCK_PROFILES.find((p) => p.key === key) ?? SHOCK_PROFILES[0]!;
}

/** Weighted family selection so a run shows a varied operational story. */
export function pickShockProfile(rng: Rng): MutationProfile {
  return rng.weighted([
    { item: SHOCK_PROFILES[0]!, weight: 26 }, // customs hold
    { item: SHOCK_PROFILES[1]!, weight: 20 }, // port congestion
    { item: SHOCK_PROFILES[2]!, weight: 24 }, // carrier delay
    { item: SHOCK_PROFILES[3]!, weight: 15 }, // route disruption
    { item: SHOCK_PROFILES[4]!, weight: 15 }, // weather delay
  ]);
}

/* ------------------------------------------------------------------ */
/* Creation-time candidate ladder                                      */
/* ------------------------------------------------------------------ */

/**
 * Observed extremes of the REAL frozen holdout export (measured, not invented).
 * Candidate recipes only move a planning / historical-signal column to a value
 * that actually occurs somewhere in the real data, so every scored candidate
 * stays inside the model's training domain.
 */
export const OBSERVED_DOMAIN = {
  countryDelayRateMax: 0.23218390804597702,
  siteDelayRateMax: 0.2247191011235955,
  vendorDelayRateMax: 0.24339360222531292,
  countryVolumeMin: 64,
  vendorVolumeMin: 0,
  scheduledTransitDaysMax: 177,
} as const;

/** Which part of the model's output range a candidate ladder is aiming at. */
export type TargetBand = "baseline" | "elevated";

/**
 * A creation-time candidate feature state. The engine scores candidates with
 * REAL /predict calls and keeps the one the model actually rated highest for an
 * `elevated` target. No recipe here decides a risk value or a tier.
 */
export interface CandidateProfile {
  key: string;
  label: string;
  mutate: (raw: Record<string, string>) => Record<string, string>;
}

export const CANDIDATE_PROFILES: CandidateProfile[] = [
  { key: "as_planned", label: "As planned (unmodified template)", mutate: (raw) => ({ ...raw }) },
  {
    key: "elevated_lane",
    label: "Destination lane at observed worst historical delay rate",
    mutate: (raw) => ({
      ...raw,
      country_hist_delay_rate: String(OBSERVED_DOMAIN.countryDelayRateMax),
    }),
  },
  {
    key: "lane_and_site",
    label: "Destination lane + origin site at observed worst historical delay rate",
    mutate: (raw) => ({
      ...raw,
      country_hist_delay_rate: String(OBSERVED_DOMAIN.countryDelayRateMax),
      site_hist_delay_rate: String(OBSERVED_DOMAIN.siteDelayRateMax),
    }),
  },
  {
    key: "full_signal_stack",
    label: "Lane + site + vendor worst observed delay signals, thinnest observed lane volume",
    mutate: (raw) => ({
      ...raw,
      country_hist_delay_rate: String(OBSERVED_DOMAIN.countryDelayRateMax),
      site_hist_delay_rate: String(OBSERVED_DOMAIN.siteDelayRateMax),
      vendor_hist_delay_rate: String(OBSERVED_DOMAIN.vendorDelayRateMax),
      country_hist_volume: String(OBSERVED_DOMAIN.countryVolumeMin),
    }),
  },
];

export function candidateProfile(key: string): CandidateProfile {
  return CANDIDATE_PROFILES.find((p) => p.key === key) ?? CANDIDATE_PROFILES[0]!;
}

/**
 * Ordered candidate ladder for a target band.
 *  - `baseline`: one candidate, the unmodified real template row.
 *  - `elevated`: up to three escalating bounded candidates. The engine scores
 *    them in order and stops as soon as the MODEL returns a higher band, so the
 *    resulting tier is always whatever /predict said.
 */
export function candidateLadder(band: TargetBand): CandidateProfile[] {
  if (band === "baseline") return [CANDIDATE_PROFILES[0]!];
  return [CANDIDATE_PROFILES[1]!, CANDIDATE_PROFILES[2]!, CANDIDATE_PROFILES[3]!];
}
