/**
 * OFFLINE FIXTURE DATA — NOT ORCA OUTPUT.
 *
 * Deterministic stand-in payloads shaped byte-for-byte like the real ORCA API
 * responses, used only when the backend is unreachable. Every consumer labels
 * these values as fixtures at panel level. No fixture value is ever presented
 * as a model output.
 *
 * Everything is built lazily inside functions (never at module scope) so the
 * edge runtime never executes generation work in global scope.
 */

import type {
  OrcaEvent,
  OrcaShipment,
  OverviewResponse,
  RiskDistribution,
  ScenarioOption,
  ScenarioRunResponse,
  ShipmentDetailResponse,
  TopDestination,
} from "./types";
import { riskTier } from "./risk";

/** Mulberry32 — small deterministic PRNG so fixtures never shift between renders. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LANES: Array<{
  origin: string;
  destination: string;
  lat: number;
  lon: number;
}> = [
  { origin: "Aurobindo Unit III", destination: "South Africa", lat: -30.5595, lon: 22.9375 },
  { origin: "Cipla Goa", destination: "Nigeria", lat: 9.082, lon: 8.6753 },
  { origin: "Hetero Unit III", destination: "Zambia", lat: -13.1339, lon: 27.8493 },
  { origin: "Mylan Hyderabad", destination: "Tanzania", lat: -6.369, lon: 34.8888 },
  { origin: "Strides Bangalore", destination: "Mozambique", lat: -18.6657, lon: 35.5296 },
  { origin: "Aspen OSD Port Elizabeth", destination: "Zimbabwe", lat: -19.0154, lon: 29.1549 },
  { origin: "Emcure Hinjwadi", destination: "Uganda", lat: 1.3733, lon: 32.2903 },
  { origin: "Macleods Daman", destination: "Kenya", lat: -0.0236, lon: 37.9062 },
  { origin: "Alere Medical Japan", destination: "Vietnam", lat: 14.0583, lon: 108.2772 },
  { origin: "Trinity Biotech Bray", destination: "Haiti", lat: 18.9712, lon: -72.2852 },
  { origin: "Ranbaxy Paonta Sahib", destination: "Rwanda", lat: -1.9403, lon: 29.8739 },
  { origin: "ABBVIE Ludwigshafen", destination: "Guyana", lat: 4.8604, lon: -58.9302 },
];

const STATUSES = ["AT_ORIGIN", "IN_TRANSIT", "CUSTOMS", "OUT_FOR_DELIVERY"];
const PRIORITIES = ["STANDARD", "PRIORITY", "CRITICAL"];

const ISSUE_FOR = (p: number, status: string, eta: number): string => {
  if (p >= 0.6) return "Network disruption";
  if (status === "CUSTOMS") return "Customs review";
  if (eta >= 10) return "ETA variance";
  if (status === "AT_ORIGIN") return "Origin readiness";
  if (p >= 0.3) return "Reliability watch";
  return "Normal operations";
};

function economics(p: number, severity: number) {
  const delayCost = 450;
  const intervention = 500;
  const efficacy = 5;
  const expected_exposure = p * Math.max(severity, 0) * delayCost;
  const expected_benefit = p * Math.min(Math.max(severity, 0), efficacy) * delayCost;
  const net_benefit = expected_benefit - intervention;
  const recommendation = p < 0.3 ? "NO_ACTION" : net_benefit > 0 ? "INTERVENE" : "MONITOR";
  return {
    expected_exposure,
    expected_benefit,
    intervention_cost: intervention,
    net_benefit,
    recommendation,
  } as const;
}

function buildPortfolio(seed: number, n = 120): OrcaShipment[] {
  const r = rng(seed);
  const out: OrcaShipment[] = [];
  for (let i = 0; i < n; i++) {
    const lane = LANES[i % LANES.length]!;
    // Beta-ish skew towards lower risk with a heavy right tail.
    const base = r();
    const risk = Math.min(0.97, Math.max(0.02, Math.pow(base, 1.55) * 0.95 + r() * 0.06));
    const severity = 1.5 + Math.pow(r(), 1.3) * 22;
    const lo = Math.max(0.2, severity * 0.42);
    const hi = severity * (1.9 + r() * 0.7);
    const status = STATUSES[Math.floor(r() * STATUSES.length)]!;
    const eta = Math.round((r() * 36 - 6) * 10) / 10;
    const econ = economics(risk, severity);
    out.push({
      id: String(84000 + i * 7 + Math.floor(r() * 5)),
      source_shipment_id: String(83000 + (i % 100)),
      origin: lane.origin,
      destination: lane.destination,
      route: `${lane.origin} → ${lane.destination}`,
      issue: ISSUE_FOR(risk, status, eta),
      risk,
      risk_tier: riskTier(risk),
      severity_p50: severity,
      severity_interval_90: [lo, hi],
      eta_variance_hours: eta,
      decision: econ.recommendation,
      expected_exposure: econ.expected_exposure,
      net_benefit: econ.net_benefit,
      status,
      progress_pct: Math.floor(r() * 100),
      customer_priority: PRIORITIES[Math.floor(r() * PRIORITIES.length)]!,
      lat: lane.lat + (r() - 0.5) * 5,
      lon: lane.lon + (r() - 0.5) * 5,
      provenance: "OFFLINE FIXTURE DATA — NOT ORCA OUTPUT",
    });
  }
  return out;
}

function attentionScore(s: OrcaShipment): number {
  const prio =
    s.customer_priority === "CRITICAL" ? 0.15 : s.customer_priority === "PRIORITY" ? 0.08 : 0;
  return s.risk * 0.65 + (Math.max(s.eta_variance_hours, 0) / 48) * 0.2 + prio;
}

function buildEvents(portfolio: OrcaShipment[], seed: number, count = 24): OrcaEvent[] {
  const r = rng(seed + 17);
  const types: Array<[OrcaEvent["event_type"], string]> = [
    ["POSITION", "Position update received"],
    ["ETA", "ETA recalculated from latest operational signal"],
    ["EXCEPTION", "Operational exception detected"],
    ["MODEL", "ORCA risk score refreshed"],
    ["DECISION", "Decision policy re-evaluated"],
  ];
  const start = 18 * 3600 + 30 * 60;
  const events: OrcaEvent[] = [];
  for (let i = 0; i < count; i++) {
    const s = portfolio[Math.floor(r() * portfolio.length)]!;
    const [typ, label] = types[i % types.length]!;
    let detail = label;
    if (typ === "MODEL") detail = `Model refresh: late probability ${(s.risk * 100).toFixed(1)}%`;
    else if (typ === "DECISION")
      detail = `Decision support refreshed: ${s.decision.replace(/_/g, " ")}`;
    else if (typ === "EXCEPTION") detail = `Fixture exception on ${s.destination} lane`;
    else if (typ === "ETA")
      detail = `Fixture ETA variance ${s.eta_variance_hours >= 0 ? "+" : ""}${s.eta_variance_hours.toFixed(1)}h`;
    const t = start + i * 11;
    const hh = String(Math.floor(t / 3600) % 24).padStart(2, "0");
    const mm = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
    const ss = String(t % 60).padStart(2, "0");
    events.push({
      timestamp: `${hh}:${mm}:${ss}`,
      shipment_id: s.id,
      event_type: typ,
      detail,
      provenance: "OFFLINE FIXTURE DATA — NOT ORCA OUTPUT",
    });
  }
  return events.reverse();
}

export function fixtureOverview(seed = 20260823): OverviewResponse {
  const frame = buildPortfolio(seed);
  const risks = frame.map((s) => s.risk);
  const mean = risks.reduce((a, b) => a + b, 0) / risks.length;

  const distribution: RiskDistribution = {
    low: frame.filter((s) => s.risk <= 0.3).length,
    watch: frame.filter((s) => s.risk > 0.3 && s.risk <= 0.6).length,
    high: frame.filter((s) => s.risk > 0.6 && s.risk <= 0.85).length,
    critical: frame.filter((s) => s.risk > 0.85).length,
  };

  const byDestination = new Map<string, { risk: number; shipments: number }>();
  for (const s of frame) {
    const cur = byDestination.get(s.destination) ?? { risk: 0, shipments: 0 };
    cur.risk += s.risk;
    cur.shipments += 1;
    byDestination.set(s.destination, cur);
  }
  const top_destinations: TopDestination[] = [...byDestination.entries()]
    .map(([destination, v]) => ({
      destination,
      risk: v.risk / v.shipments,
      shipments: v.shipments,
    }))
    .sort((a, b) => b.risk - a.risk || b.shipments - a.shipments)
    .slice(0, 5);

  const sorted = [...frame].sort((a, b) => attentionScore(b) - attentionScore(a));

  return {
    seed,
    evidence: {
      real_data: "OFFLINE FIXTURE DATA — NOT ORCA OUTPUT",
      model_output: "OFFLINE FIXTURE DATA — NOT ORCA OUTPUT",
      simulated: "OFFLINE FIXTURE DATA — NOT ORCA OUTPUT",
    },
    kpis: {
      active_shipments: frame.length,
      exceptions: frame.filter((s) => s.risk >= 0.3).length,
      critical_exceptions: frame.filter((s) => s.risk >= 0.45).length,
      intervention_candidates: frame.filter((s) => s.decision === "INTERVENE").length,
      estimated_exposure: frame.reduce((a, s) => a + s.expected_exposure, 0),
      potential_net_benefit: frame
        .filter((s) => s.net_benefit > 0)
        .reduce((a, s) => a + s.net_benefit, 0),
      modeled_on_time_likelihood: Math.max(0, 1 - mean),
      average_risk: mean,
    },
    priority_exceptions: sorted.slice(0, 8),
    map_points: sorted.slice(0, 34),
    risk_distribution: distribution,
    top_destinations,
    events: buildEvents(frame, seed),
    model_version: "fixture",
  };
}

export function fixtureShipment(shipmentId: string, seed = 20260823): ShipmentDetailResponse {
  const frame = buildPortfolio(seed);
  const s = frame.find((x) => x.id === shipmentId) ?? frame[0]!;
  const r = rng(Number(s.id) || 1);
  const progress = s.progress_pct;
  const drivers = [
    "vendor_hist_delay_rate",
    "country_hist_delay_rate",
    "Scheduled_Transit_Days",
    "site_hist_delay_rate",
    "Line Item Quantity",
    "Weight (Kilograms)",
  ].map((feature) => {
    const shap = (r() - 0.35) * 0.9;
    return {
      feature,
      shap_value: shap,
      direction: shap > 0 ? ("raises" as const) : ("reduces" as const),
    };
  });

  return {
    display_id: s.id,
    source_shipment_id: s.source_shipment_id,
    origin: s.origin,
    destination: s.destination,
    route: s.route,
    status: s.status,
    progress_pct: progress,
    eta_variance_hours: s.eta_variance_hours,
    customer_priority: s.customer_priority,
    provenance: "OFFLINE FIXTURE DATA — NOT ORCA OUTPUT",
    risk: s.risk,
    risk_tier: s.risk_tier,
    severity_p50: s.severity_p50,
    severity_interval_90: s.severity_interval_90,
    model_version: "fixture",
    shipment_mode: ["Air", "Ocean", "Truck", "Air Charter"][Math.floor(r() * 4)]!,
    vendor: ["SCMS from RDC", "Orgenics, Ltd", "Aurobindo Pharma Ltd", "Ranbaxy Fine Chemicals"][
      Math.floor(r() * 4)
    ]!,
    fulfill_via: r() > 0.5 ? "Direct Drop" : "From RDC",
    line_item_value: Math.round(r() * 480000),
    risk_drivers: drivers.sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value)),
    timeline: [
      { label: "Order confirmed", state: "complete" },
      { label: "Picked up", state: progress >= 20 ? "complete" : "pending" },
      { label: "Departed origin", state: progress >= 40 ? "complete" : "pending" },
      {
        label: "In transit",
        state: progress >= 40 && progress < 82 ? "active" : progress >= 82 ? "complete" : "pending",
      },
      {
        label: "Destination",
        state: progress >= 82 && progress < 96 ? "active" : progress >= 96 ? "complete" : "pending",
      },
      { label: "Delivered", state: progress >= 99 ? "complete" : "pending" },
    ],
    evidence_label: "OFFLINE FIXTURE DATA — NOT ORCA OUTPUT",
  };
}

export function fixtureScenarios(): ScenarioOption[] {
  return [
    {
      key: "steady_state",
      label: "Normal operations",
      description: "No feature shock. Useful as the baseline before an exception is injected.",
      event_label: "Network operating within baseline conditions",
    },
    {
      key: "vendor_reliability",
      label: "Vendor reliability deterioration",
      description: "Raises only pre-outcome vendor historical delay signals for a model what-if.",
      event_label: "Vendor performance alert detected",
    },
    {
      key: "lane_disruption",
      label: "Lane / destination disruption",
      description:
        "Raises pre-outcome site and destination historical delay signals and planned transit time.",
      event_label: "Destination lane disruption detected",
    },
    {
      key: "transport_switch",
      label: "Transport-mode review",
      description: "Changes Shipment Mode to Air as a hypothetical pre-outcome planning input.",
      event_label: "Alternative transport mode proposed",
    },
  ];
}

export function fixtureScenarioRun(
  shipmentId: string,
  scenarioKey: string,
  delayCostPerDay: number,
  interventionCost: number,
  efficacyDays: number,
  seed = 20260823,
): ScenarioRunResponse {
  const detail = fixtureShipment(shipmentId, seed);
  const shift =
    scenarioKey === "vendor_reliability"
      ? 0.13
      : scenarioKey === "lane_disruption"
        ? 0.19
        : scenarioKey === "transport_switch"
          ? -0.11
          : 0;
  const baselineRisk = detail.risk;
  const scenarioRisk = Math.min(0.98, Math.max(0.01, baselineRisk + shift));
  const baseSeverity = detail.severity_p50;
  const scenarioSeverity = Math.max(0.2, baseSeverity * (1 + shift * 0.9));

  const p = Math.min(1, Math.max(0, scenarioRisk));
  const expected_exposure = p * scenarioSeverity * delayCostPerDay;
  const expected_benefit = p * Math.min(scenarioSeverity, efficacyDays) * delayCostPerDay;
  const net_benefit = expected_benefit - interventionCost;

  const audit: Record<string, string[]> = {
    steady_state: [],
    vendor_reliability: [
      "vendor_hist_delay_rate: 0.310 → 0.510",
      "vendor_hist_delay_median: 6.0 → 13.0 days",
    ],
    lane_disruption: [
      "site_hist_delay_rate: 0.280 → 0.460",
      "country_hist_delay_rate: 0.240 → 0.420",
      "Scheduled_Transit_Days: 32.0 → 43.2",
    ],
    transport_switch: ["Shipment Mode: Ocean → Air"],
  };

  return {
    shipment_id: detail.display_id,
    source_shipment_id: detail.source_shipment_id,
    scenario: scenarioKey,
    scenario_label: fixtureScenarios().find((s) => s.key === scenarioKey)?.label ?? scenarioKey,
    baseline: { risk: baselineRisk, risk_tier: riskTier(baselineRisk), severity_p50: baseSeverity },
    result: {
      risk: scenarioRisk,
      risk_tier: riskTier(scenarioRisk),
      severity_p50: scenarioSeverity,
      risk_delta_pp: (scenarioRisk - baselineRisk) * 100,
    },
    economics: {
      expected_exposure,
      expected_benefit,
      intervention_cost: interventionCost,
      net_benefit,
      recommendation: p < 0.3 ? "NO_ACTION" : net_benefit > 0 ? "INTERVENE" : "MONITOR",
    },
    feature_audit: audit[scenarioKey] ?? [],
    human_approval_required: true,
    evidence_label: "OFFLINE FIXTURE DATA — NOT ORCA OUTPUT",
    disclaimer: "Scenario economics are configurable planning assumptions, not realized savings.",
  };
}
