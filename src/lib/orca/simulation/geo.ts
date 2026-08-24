/**
 * SYNTHETIC ROUTE / POSITION geometry.
 *
 * Nothing here is a real road, shipping lane, flight path or GPS track. Origin
 * and destination labels are REAL DATA (manufacturing site / country strings on
 * the source rows); the coordinates are deterministic presentation centroids and
 * the polyline is a curved interpolation between them.
 *
 * Framework-agnostic: plain TypeScript.
 */

import { countryCentroid } from "../source-data";
import type { LatLon } from "./types";

/**
 * Deterministic presentation centroids for the manufacturing sites present in
 * the bundled ORCA export. Matched by keyword so new site spellings degrade to
 * a stable hashed fallback instead of jumping around.
 */
const SITE_CENTROIDS: { match: RegExp; at: LatLon; label: string }[] = [
  { match: /mylan|nashik/i, at: [19.9975, 73.7898], label: "Nashik, IN" },
  { match: /aurobindo/i, at: [17.385, 78.4867], label: "Hyderabad, IN" },
  { match: /hetero.*jadcherla/i, at: [16.7667, 78.15], label: "Jadcherla, IN" },
  { match: /hetero/i, at: [17.4399, 78.4983], label: "Hyderabad, IN" },
  { match: /strides|bangalore/i, at: [12.9716, 77.5946], label: "Bengaluru, IN" },
  { match: /cipla|goa/i, at: [15.2993, 74.124], label: "Goa, IN" },
  { match: /trinity biotech/i, at: [53.3498, -6.2603], label: "Dublin, IE" },
  { match: /alere/i, at: [35.6762, 139.6503], label: "Tokyo, JP" },
  { match: /orgenics/i, at: [32.0853, 34.7818], label: "Yavne, IL" },
  { match: /msd.*haarlem|haarlem/i, at: [52.3874, 4.6462], label: "Haarlem, NL" },
  { match: /ludwigshafen/i, at: [49.4875, 8.466], label: "Ludwigshafen, DE" },
  { match: /abbvie.*france|abbott.*france/i, at: [48.8566, 2.3522], label: "France" },
  { match: /janssen|latina/i, at: [41.4676, 12.9037], label: "Latina, IT" },
  { match: /chembio/i, at: [40.9176, -73.1204], label: "Medford, US" },
  { match: /scms from rdc|from rdc/i, at: [-6.7924, 39.2083], label: "Regional RDC" },
  { match: /pharmacy direct/i, at: [-26.2041, 28.0473], label: "Johannesburg, ZA" },
];

/** Deterministic synthetic coordinate for a manufacturing-site string. */
export function siteCentroid(site: string): LatLon {
  for (const entry of SITE_CENTROIDS) {
    if (entry.match.test(site)) return entry.at;
  }
  let h = 0;
  for (let i = 0; i < site.length; i++) h = (h * 33 + site.charCodeAt(i)) >>> 0;
  return [((h % 100) - 40) / 1.6, ((h >>> 8) % 300) - 150];
}

/** Human presentation label for the synthetic origin coordinate. */
export function siteLabel(site: string): string {
  for (const entry of SITE_CENTROIDS) {
    if (entry.match.test(site)) return entry.label;
  }
  return site;
}

export function destinationCentroid(country: string): LatLon {
  return countryCentroid(country);
}

const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km — used only to size synthetic transit time. */
export function distanceKm(a: LatLon, b: LatLon): number {
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Curved synthetic polyline between two points.
 *
 * A straight lat/lon segment reads as a ruler line on a world map, so the path
 * is bowed by a mode-dependent amount purely for legibility. It is NOT a
 * routing result.
 */
export function buildWaypoints(start: LatLon, end: LatLon, mode: string, steps = 32): LatLon[] {
  const bow = /air/i.test(mode) ? 0.16 : /ocean|sea/i.test(mode) ? 0.1 : 0.05;
  const [lat1, lon1] = start;
  const lat2 = end[0];
  let lon2 = end[1];
  // Keep the polyline on one side of the antimeridian.
  if (Math.abs(lon2 - lon1) > 180) lon2 += lon2 > lon1 ? -360 : 360;

  const dLon = lon2 - lon1;
  const dLat = lat2 - lat1;
  const len = Math.hypot(dLon, dLat) || 1;
  // Perpendicular unit vector in (lon, lat) space, always bowing "upward".
  const sign = dLon >= 0 ? 1 : -1;
  const px = (-dLat / len) * sign;
  const py = (dLon / len) * sign;

  const points: LatLon[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const offset = Math.sin(Math.PI * t) * bow * len;
    const lat = lat1 + dLat * t + py * offset;
    const lon = lon1 + dLon * t + px * offset;
    points.push([Math.max(-84, Math.min(84, lat)), lon]);
  }
  points[0] = [lat1, lon1];
  points[points.length - 1] = [lat2, lon2];
  return points;
}

/** Position at `progress` (0–1) along a synthetic polyline. */
export function positionAt(waypoints: LatLon[], progress: number): LatLon {
  if (waypoints.length === 0) return [0, 0];
  if (waypoints.length === 1) return waypoints[0]!;
  const clamped = Math.max(0, Math.min(1, progress));
  const scaled = clamped * (waypoints.length - 1);
  const i = Math.min(waypoints.length - 2, Math.floor(scaled));
  const t = scaled - i;
  const a = waypoints[i]!;
  const b = waypoints[i + 1]!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Splits a polyline into travelled / remaining segments at `progress`. */
export function splitRoute(
  waypoints: LatLon[],
  progress: number,
): { travelled: LatLon[]; remaining: LatLon[] } {
  if (waypoints.length < 2) return { travelled: waypoints, remaining: waypoints };
  const clamped = Math.max(0, Math.min(1, progress));
  const scaled = clamped * (waypoints.length - 1);
  const i = Math.min(waypoints.length - 2, Math.floor(scaled));
  const here = positionAt(waypoints, clamped);
  return {
    travelled: [...waypoints.slice(0, i + 1), here],
    remaining: [here, ...waypoints.slice(i + 1)],
  };
}
