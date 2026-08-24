import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  Database,
  Gauge,
  Info,
  Radar,
  Target,
  TimerOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { cn } from "@/lib/utils";
import { days, num, pct } from "@/lib/orca/format";
import { sourceRow } from "@/lib/orca/source-data";
import {
  CATEGORY_DEFINITION,
  CATEGORY_LABEL,
  CATEGORY_TONE,
  GROUP_DIMENSIONS,
  delayDistribution,
  groupPerformance,
  type GroupDimension,
  type JourneyAnalytics as JourneyAnalyticsData,
  type PredictionCategory,
  type ScoredJourney,
} from "@/lib/orca/analytics";
import { RiskBadge, Panel, PanelBody, PanelEmpty, PanelHeader } from "./primitives";

const REAL = "REAL DATA — HOLDOUT OUTCOMES";
const MODEL = "MODEL OUTPUT";

const tooltipStyle = {
  background: "var(--surface-raised)",
  border: "1px solid var(--hairline)",
  borderRadius: 8,
  fontSize: 11,
  color: "var(--foreground)",
} as const;

/* --------------------------------------------------------------- KPI strip */

function KpiStat({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  provenance = REAL,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: string;
  provenance?: string;
}) {
  return (
    <article className="orca-panel flex min-w-0 flex-col gap-2 p-3.5" title={hint}>
      <div className="flex items-start justify-between gap-2">
        <h3 className={cn("orca-label leading-4", tone)}>{label}</h3>
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-md border border-hairline bg-surface-raised",
            tone,
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </span>
      </div>
      <p className="orca-num truncate text-[26px] font-semibold leading-none tracking-tight">
        {value}
      </p>
      <p className="text-[11px] leading-4 text-muted-foreground">{hint}</p>
      <p className="text-[10px] font-semibold tracking-wide text-muted-foreground/70">
        {provenance}
      </p>
    </article>
  );
}

/* ------------------------------------------------------------ Outcome donut */

function OutcomeDonut({ onTime, late }: { onTime: number; late: number }) {
  const total = onTime + late;
  const data = [
    { name: "On Time", value: onTime, fill: "var(--success)" },
    { name: "Late", value: late, fill: "var(--danger)" },
  ].filter((d) => d.value > 0);

  if (total === 0) return <PanelEmpty message="No completed journeys in the holdout export." />;

  return (
    <div className="flex h-full min-h-[190px] flex-col items-center gap-4 sm:flex-row">
      <div className="relative size-[164px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={56}
              outerRadius={80}
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number, name: string) => [
                `${value} (${pct(value / total, 1)})`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="orca-num text-xl font-semibold leading-none">{pct(onTime / total, 1)}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              On-Time
            </p>
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
          <span style={{ width: `${(onTime / total) * 100}%`, background: "var(--success)" }} />
          <span style={{ width: `${(late / total) * 100}%`, background: "var(--danger)" }} />
        </div>
        <ul className="space-y-1.5 text-xs">
          <li className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-[3px]"
              style={{ background: "var(--success)" }}
              aria-hidden
            />
            <span className="flex-1 text-foreground/85">On Time — Delay_Flag = 0</span>
            <span className="orca-num text-muted-foreground">
              {num(onTime)} · {pct(onTime / total, 1)}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-[3px]"
              style={{ background: "var(--danger)" }}
              aria-hidden
            />
            <span className="flex-1 text-foreground/85">Late — Delay_Flag = 1</span>
            <span className="orca-num text-muted-foreground">
              {num(late)} · {pct(late / total, 1)}
            </span>
          </li>
        </ul>
        <p className="text-[11px] leading-4 text-muted-foreground">
          Recorded completion labels from the frozen holdout export. {num(onTime)} + {num(late)} ={" "}
          {num(total)} completed journeys.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- Delay distribution */

function DelayDistribution({ data }: { data: JourneyAnalyticsData }) {
  const bins = delayDistribution(data.journeys);
  const max = Math.max(...bins.map((b) => b.count), 1);
  return (
    <ul className="space-y-2.5">
      {bins.map((bin) => (
        <li key={bin.label} className="text-xs" title={bin.hint}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-foreground/85">{bin.label}</span>
            <span className="orca-num text-muted-foreground">
              {num(bin.count)} · {pct(bin.count / data.journeys.length, 0)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${(bin.count / max) * 100}%`,
                background: bin.label.includes("late") ? "var(--danger)" : "var(--primary)",
              }}
            />
          </div>
        </li>
      ))}
      <li className="pt-1 text-[11px] leading-4 text-muted-foreground">
        Bins use the export&rsquo;s raw signed <span className="orca-num">Delay_Days</span> column
        in days. Negative values mean the journey completed ahead of schedule.
      </li>
    </ul>
  );
}

/* --------------------------------------------------- Prediction vs actual */

const MATRIX_CELLS: { category: PredictionCategory; icon: LucideIcon }[] = [
  { category: "CORRECT_DELAY_ALERT", icon: Target },
  { category: "MISSED_DELAY", icon: TimerOff },
  { category: "FALSE_ALERT", icon: Radar },
  { category: "CORRECT_ON_TIME", icon: CheckCircle2 },
];

function PredictionVsActual({ data }: { data: JourneyAnalyticsData }) {
  const m = data.matrix;
  if (!m) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-danger/40 bg-danger/10 p-4 text-xs text-danger">
        <span className="font-semibold tracking-wide">
          PREDICTION QUALITY UNAVAILABLE — BACKEND OFFLINE
        </span>
        <p className="text-danger/85">
          Prediction-vs-actual needs real <span className="orca-num">/predict</span> scores. The
          ORCA API is unreachable
          {data.predictionUnavailableReason ? ` (${data.predictionUnavailableReason})` : ""}, and
          fixture risk values are never presented as model quality. Actual outcomes above remain
          real recorded holdout data.
        </p>
      </div>
    );
  }

  const counts: Record<PredictionCategory, number> = {
    CORRECT_DELAY_ALERT: m.truePositive,
    MISSED_DELAY: m.falseNegative,
    FALSE_ALERT: m.falsePositive,
    CORRECT_ON_TIME: m.trueNegative,
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        {MATRIX_CELLS.map(({ category, icon: Icon }) => (
          <div
            key={category}
            title={CATEGORY_DEFINITION[category]}
            className="rounded-lg border border-hairline bg-surface-sunken p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={cn("orca-label leading-4", CATEGORY_TONE[category])}>
                {CATEGORY_LABEL[category]}
              </span>
              <Icon className={cn("size-3.5 shrink-0", CATEGORY_TONE[category])} aria-hidden />
            </div>
            <p className="orca-num mt-1.5 text-2xl font-semibold leading-none">
              {num(counts[category])}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {pct(counts[category] / m.scored, 1)} of scored journeys
            </p>
          </div>
        ))}
      </div>

      <dl className="grid grid-cols-3 gap-2.5 text-xs">
        {[
          {
            label: "Accuracy",
            value: pct(m.accuracy, 1),
            hint: "(Correct Delay Alerts + Correct On-Time) ÷ scored journeys, this holdout set only.",
          },
          {
            label: "Delay Capture (Recall)",
            value: pct(m.recall, 1),
            hint: "Correct Delay Alerts ÷ actually-late journeys. Undefined when the holdout has no late journeys.",
          },
          {
            label: "Alert Precision",
            value: pct(m.precision, 1),
            hint: "Correct Delay Alerts ÷ all flagged journeys. Undefined when nothing was flagged.",
          },
        ].map((r) => (
          <div
            key={r.label}
            title={r.hint}
            className="rounded-lg border border-hairline bg-surface-raised p-2.5"
          >
            <dt className="orca-label text-muted-foreground">{r.label}</dt>
            <dd className="orca-num mt-1 text-lg font-semibold leading-none">{r.value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-[11px] leading-4 text-muted-foreground">
        Positives use the backend&rsquo;s own{" "}
        <span className="orca-num">classification_decision</span> at decision threshold{" "}
        <span className="orca-num text-foreground/85">{m.decisionThreshold.toFixed(3)}</span> (model{" "}
        <span className="orca-num text-foreground/85">{m.modelVersion}</span>) — no frontend
        threshold. Predictions are {MODEL}; outcomes are REAL DATA. Rates describe this{" "}
        {num(m.scored)}-journey holdout set only.
      </p>
    </div>
  );
}

/* ------------------------------------------------------ Performance groups */

function PerformanceBreakdown({
  data,
  hasDelayMagnitude,
}: {
  data: JourneyAnalyticsData;
  hasDelayMagnitude: boolean;
}) {
  const [dimension, setDimension] = useState<GroupDimension>("country");
  const groups = useMemo(
    () => groupPerformance(data.journeys, dimension).slice(0, 12),
    [data.journeys, dimension],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap gap-1.5 border-b border-hairline px-3 py-2">
        {GROUP_DIMENSIONS.map((d) => (
          <button
            key={d.key}
            type="button"
            title={d.hint}
            onClick={() => setDimension(d.key)}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              dimension === d.key
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-hairline bg-surface-sunken text-muted-foreground hover:text-foreground",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-surface-sunken text-[11px] uppercase tracking-wide">
            <tr className="border-b border-hairline">
              <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
                Group
              </th>
              {["Completed", "On Time", "Late", "On-Time Rate"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-3 py-2 text-right font-medium text-muted-foreground"
                >
                  {h}
                </th>
              ))}
              {hasDelayMagnitude ? (
                <th
                  scope="col"
                  title="Mean signed Delay_Days across LATE journeys in this group"
                  className="px-3 py-2 text-right font-medium text-muted-foreground"
                >
                  Avg Actual Delay
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} className="border-b border-hairline/60 last:border-0">
                <td className="max-w-[18rem] truncate px-3 py-2 text-foreground/85" title={g.key}>
                  {g.key}
                </td>
                <td className="orca-num px-3 py-2 text-right">{num(g.completed)}</td>
                <td className="orca-num px-3 py-2 text-right text-success">{num(g.onTime)}</td>
                <td
                  className={cn(
                    "orca-num px-3 py-2 text-right",
                    g.late > 0 ? "text-danger" : "text-muted-foreground",
                  )}
                >
                  {num(g.late)}
                </td>
                <td className="orca-num px-3 py-2 text-right">{pct(g.onTimeRate, 0)}</td>
                {hasDelayMagnitude ? (
                  <td className="orca-num px-3 py-2 text-right text-muted-foreground">
                    {Number.isFinite(g.avgDelayLate) ? days(g.avgDelayLate, 1) : "—"}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-hairline px-3 py-1.5 text-[10px] text-muted-foreground">
        Grouped on real presentation-safe source columns only — engineered/encoded model features
        are never used as a breakdown dimension. Top 12 groups by late journeys.
      </p>
    </div>
  );
}

/* --------------------------------------------------------- Journey explorer */

type ExplorerFilter = "ALL" | "ON_TIME" | "LATE" | "CORRECT" | "MISSED";

function JourneyExplorer({
  data,
  hasDelayMagnitude,
}: {
  data: JourneyAnalyticsData;
  hasDelayMagnitude: boolean;
}) {
  const [filter, setFilter] = useState<ExplorerFilter>("ALL");
  const scoredById = useMemo(() => {
    const map = new Map<string, ScoredJourney>();
    for (const s of data.scored ?? []) map.set(s.journey.id, s);
    return map;
  }, [data.scored]);

  const filters: { key: ExplorerFilter; label: string; available: boolean }[] = [
    { key: "ALL", label: "All", available: true },
    { key: "ON_TIME", label: "On Time", available: true },
    { key: "LATE", label: "Late", available: true },
    { key: "CORRECT", label: "Correct Predictions", available: Boolean(data.scored) },
    { key: "MISSED", label: "Missed Delays", available: Boolean(data.scored) },
  ];

  const rows = useMemo(() => {
    return data.journeys.filter((j) => {
      const scored = scoredById.get(j.id);
      switch (filter) {
        case "ON_TIME":
          return !j.late;
        case "LATE":
          return j.late;
        case "CORRECT":
          return (
            scored?.category === "CORRECT_DELAY_ALERT" || scored?.category === "CORRECT_ON_TIME"
          );
        case "MISSED":
          return scored?.category === "MISSED_DELAY";
        default:
          return true;
      }
    });
  }, [data.journeys, filter, scoredById]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline px-3 py-2">
        {filters
          .filter((f) => f.available)
          .map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                filter === f.key
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-hairline bg-surface-sunken text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        <span className="ml-auto orca-num text-[11px] text-muted-foreground">
          {num(rows.length)} journeys
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-surface-sunken text-[11px] uppercase tracking-wide">
            <tr className="border-b border-hairline">
              <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
                Shipment
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
                Route
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
                Actual Outcome
              </th>
              {hasDelayMagnitude ? (
                <th
                  scope="col"
                  title="Real signed Delay_Days (negative = completed early)"
                  className="px-3 py-2 text-right font-medium text-muted-foreground"
                >
                  Actual Delay
                </th>
              ) : null}
              <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
                ORCA Risk Tier
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">
                Late Probability
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
                Prediction Result
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => {
              const scored = scoredById.get(j.id);
              const linkable = Boolean(sourceRow(j.id));
              return (
                <tr key={j.id} className="border-b border-hairline/60 last:border-0">
                  <td className="orca-num px-3 py-2 font-medium">
                    {linkable ? (
                      <Link
                        to="/shipments"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                        title="Open in Shipment Intelligence"
                      >
                        {j.id}
                        <ArrowRight className="size-3" aria-hidden />
                      </Link>
                    ) : (
                      j.id
                    )}
                  </td>
                  <td
                    className="max-w-[18rem] truncate px-3 py-2 text-foreground/85"
                    title={j.route}
                  >
                    {j.route}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
                        j.late
                          ? "border-danger/40 bg-danger/10 text-danger"
                          : "border-success/30 bg-success/10 text-success",
                      )}
                    >
                      {j.late ? "LATE" : "ON TIME"}
                    </span>
                  </td>
                  {hasDelayMagnitude ? (
                    <td
                      className={cn(
                        "orca-num px-3 py-2 text-right",
                        j.delayDays > 0 ? "text-danger" : "text-muted-foreground",
                      )}
                    >
                      {j.delayDays > 0 ? "+" : ""}
                      {j.delayDays} d
                    </td>
                  ) : null}
                  <td className="px-3 py-2">
                    {scored ? (
                      <RiskBadge tier={scored.risk_tier} />
                    ) : (
                      <span className="text-[10px] text-muted-foreground">unscored</span>
                    )}
                  </td>
                  <td className="orca-num px-3 py-2 text-right">
                    {scored ? pct(scored.probability_late, 1) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {scored ? (
                      <span
                        title={CATEGORY_DEFINITION[scored.category]}
                        className={cn("text-[11px] font-medium", CATEGORY_TONE[scored.category])}
                      >
                        {CATEGORY_LABEL[scored.category]}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        model offline — not evaluated
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-hairline px-3 py-1.5 text-[10px] text-muted-foreground">
        Outcome columns REAL DATA · risk tier and late probability {MODEL} from{" "}
        <span className="orca-num">/predict</span>. Linked IDs also exist in the live scored
        portfolio.
      </p>
    </div>
  );
}

/* -------------------------------------------------- Economic impact notice */

function EconomicImpactPanel() {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <span className="grid size-9 shrink-0 place-items-center rounded-md border border-hairline bg-surface-raised text-muted-foreground">
        <Info className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-2 text-xs leading-5 text-muted-foreground">
        <p className="text-sm font-medium text-foreground">
          Economic impact data not available in historical source
        </p>
        <p>
          The frozen holdout export carries no raw monetary fields. Its{" "}
          <span className="orca-num">Unit Price</span>, <span className="orca-num">Pack Price</span>
          , <span className="orca-num">Line Item Value</span>,{" "}
          <span className="orca-num">Line Item Quantity</span> and{" "}
          <span className="orca-num">Line Item Insurance (USD)</span> columns are log-transformed
          model features (e.g. value 3.74 alongside quantity 1.39), not USD amounts, so they are
          never rendered as currency here.
        </p>
        <p>
          Actual profit, loss, savings or ROI would additionally require cost, margin, penalty,
          storage, expedited-freight, SLA and revenue-loss fields that this historical dataset does
          not contain. No dollar figure is therefore claimed on this page.
        </p>
        <Link
          to="/decision-economics"
          className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-raised px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
        >
          Open Decision Economics for SIMULATED SCENARIO impact analysis
          <ArrowRight className="size-3" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/* -------------------------------------------------- Past / Present / Future */

function TemporalStrip() {
  return (
    <div className="grid gap-2.5 lg:grid-cols-3">
      <div className="orca-panel flex items-start gap-3 p-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary">
          <CalendarClock className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="orca-label text-primary">Past — Analytics</p>
          <p className="text-[11px] leading-4 text-muted-foreground">What actually happened?</p>
        </div>
      </div>
      <Link
        to="/control-tower"
        className="orca-panel flex items-start gap-3 p-3 transition-colors hover:bg-accent/40"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-warn/25 bg-warn/10 text-warn">
          <Activity className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="orca-label text-warn">Present — Control Tower</p>
          <p className="text-[11px] leading-4 text-muted-foreground">What is at risk now?</p>
        </div>
        <ArrowRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
      <Link
        to="/simulator"
        className="orca-panel flex items-start gap-3 p-3 transition-colors hover:bg-accent/40"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-model/25 bg-model/10 text-model">
          <Gauge className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="orca-label text-model">Future — What-If</p>
          <p className="text-[11px] leading-4 text-muted-foreground">
            What could happen if we intervene?
          </p>
        </div>
        <ArrowRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------- Page */

export function JourneyAnalyticsView({ data }: { data: JourneyAnalyticsData }) {
  const { kpis } = data;
  const hasDelayMagnitude = data.journeys.some((j) => j.delayDays !== 0);
  const modelSource = data.matrix ? "live" : "fixture";

  return (
    <div className="space-y-3">
      <TemporalStrip />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
        <KpiStat
          label="Completed Journeys"
          value={num(kpis.completed)}
          hint="Frozen holdout rows with a recorded completion outcome"
          icon={Database}
          tone="text-primary"
        />
        <KpiStat
          label="On Time"
          value={num(kpis.onTime)}
          hint="Delay_Flag = 0 in the holdout export"
          icon={BadgeCheck}
          tone="text-success"
        />
        <KpiStat
          label="Late"
          value={num(kpis.late)}
          hint="Delay_Flag = 1 in the holdout export"
          icon={TimerOff}
          tone="text-danger"
        />
        <KpiStat
          label="On-Time Rate"
          value={pct(kpis.onTimeRate, 1)}
          hint="On Time ÷ Completed Journeys"
          icon={Gauge}
          tone="text-warn"
        />
        {hasDelayMagnitude ? (
          <KpiStat
            label="Avg Delay (late only)"
            value={Number.isFinite(kpis.avgDelayLate) ? days(kpis.avgDelayLate, 1) : "—"}
            hint={`Mean Delay_Days across late journeys · worst +${kpis.worstDelayDays} d`}
            icon={Clock}
            tone="text-model"
          />
        ) : null}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Journey Outcome Overview"
            hint="On time vs late — recorded completion labels, no time axis"
            source="live"
          />
          <PanelBody>
            <OutcomeDonut onTime={kpis.onTime} late={kpis.late} />
          </PanelBody>
        </Panel>

        {hasDelayMagnitude ? (
          <Panel>
            <PanelHeader
              title="Actual Schedule Variance"
              hint="Distribution of the real signed Delay_Days column"
              source="live"
            />
            <PanelBody>
              <DelayDistribution data={data} />
            </PanelBody>
          </Panel>
        ) : null}
      </div>

      <Panel>
        <PanelHeader
          title="ORCA Prediction vs Actual"
          hint="Backend classification_decision against recorded outcomes"
          source={modelSource}
        />
        <PanelBody>
          <PredictionVsActual data={data} />
        </PanelBody>
      </Panel>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel className="h-[26rem]">
          <PanelHeader
            title="Performance Breakdown"
            hint="Completed outcomes grouped by real source dimensions"
            source="live"
          />
          <PerformanceBreakdown data={data} hasDelayMagnitude={hasDelayMagnitude} />
        </Panel>

        <Panel>
          <PanelHeader
            title="Financial Performance"
            hint="Conditional on raw monetary source fields"
          />
          <PanelBody>
            <EconomicImpactPanel />
          </PanelBody>
        </Panel>
      </div>

      <Panel className="h-[32rem]">
        <PanelHeader
          title="Completed Journey Explorer"
          hint="Actual outcomes joined to ORCA model scores"
          source={modelSource}
        />
        <JourneyExplorer data={data} hasDelayMagnitude={hasDelayMagnitude} />
      </Panel>
    </div>
  );
}
