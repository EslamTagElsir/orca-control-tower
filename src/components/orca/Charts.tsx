import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { RiskDistribution, ShipmentRow, TopDestination } from "@/lib/orca/types";
import { TIER_CSS_VAR, TIER_LABEL, TIER_RANGE } from "@/lib/orca/risk";
import { num, pct } from "@/lib/orca/format";
import { PanelEmpty } from "./primitives";

const ISSUE_COLORS: Record<string, string> = {
  "Network disruption": "var(--risk-critical)",
  "Customs review": "var(--chart-5)",
  "ETA variance": "var(--risk-watch)",
  "Origin readiness": "var(--chart-6)",
  "Reliability watch": "var(--risk-high)",
  "Normal operations": "var(--risk-low)",
};

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--hairline)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "var(--popover-foreground)",
  padding: "8px 10px",
} as const;

/* ------------------------------------------------- Exception summary donut */

export function ExceptionSummary({ shipments }: { shipments: ShipmentRow[] }) {
  const data = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of shipments) counts.set(s.issue, (counts.get(s.issue) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [shipments]);

  const total = data.reduce((a, d) => a + d.value, 0);
  if (total === 0) return <PanelEmpty message="No shipments in the current portfolio view." />;

  return (
    <div className="flex h-full min-h-[220px] flex-col items-center gap-3 sm:flex-row">
      <div className="relative h-[160px] w-[160px] shrink-0 xl:h-[150px] xl:w-[150px] 2xl:h-[180px] 2xl:w-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={84}
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={ISSUE_COLORS[d.name] ?? "var(--chart-1)"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number, name: string) => [
                `${value} (${pct(value / total, 0)})`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="orca-num text-2xl font-semibold leading-none">{num(total)}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Shipments
            </p>
          </div>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d) => (
          <li key={d.name} className="flex items-start gap-2 text-xs">
            <span
              className="mt-0.5 size-2.5 shrink-0 rounded-[3px]"
              style={{ background: ISSUE_COLORS[d.name] ?? "var(--chart-1)" }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 leading-tight text-foreground/85">{d.name}</span>
            <span className="orca-num shrink-0 text-muted-foreground">
              {pct(d.value / total, 0)} ({d.value})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------- Risk distribution */

const TIER_ORDER = ["LOW_RISK", "WATCH", "HIGH_RISK", "CRITICAL"] as const;

export function RiskDistributionChart({ distribution }: { distribution: RiskDistribution }) {
  const map = {
    LOW_RISK: distribution.low,
    WATCH: distribution.watch,
    HIGH_RISK: distribution.high,
    CRITICAL: distribution.critical,
  } as const;

  const data = TIER_ORDER.map((tier) => ({
    tier,
    name: TIER_LABEL[tier],
    value: map[tier],
    fill: TIER_CSS_VAR[tier],
  }));
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total === 0) return <PanelEmpty message="No risk distribution returned." />;

  return (
    <div className="flex h-full min-h-[200px] flex-col items-center gap-3 sm:flex-row">
      <div className="relative h-[160px] w-[160px] shrink-0 xl:h-[150px] xl:w-[150px] 2xl:h-[168px] 2xl:w-[168px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={54}
              outerRadius={80}
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              {data.map((d) => (
                <Cell key={d.tier} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number, name: string) => [
                `${value} (${pct(value / total, 0)})`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="orca-num text-xl font-semibold leading-none">{num(total)}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
          </div>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d) => (
          <li key={d.tier} className="flex items-start gap-2 text-xs">
            <span
              className="mt-0.5 size-2.5 shrink-0 rounded-[3px]"
              style={{ background: d.fill }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="text-foreground/85">{d.name}</span>{" "}
              <span className="orca-num text-muted-foreground/70">({TIER_RANGE[d.tier]})</span>
            </span>
            <span className="orca-num shrink-0 text-muted-foreground">
              {d.value} · {pct(d.value / total, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------- Risky lanes */

export function TopRiskyLanes({
  destinations,
  onSelect,
}: {
  destinations: TopDestination[];
  onSelect?: (destination: string) => void;
}) {
  if (destinations.length === 0)
    return <PanelEmpty message="No destination aggregates returned." />;

  const data = destinations.map((d) => ({ ...d, riskPct: d.risk * 100 }));

  return (
    <div className="h-full min-h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 40, bottom: 4, left: 4 }}
          barSize={16}
        >
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: number) => `${v}%`}
            axisLine={{ stroke: "var(--hairline)" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="destination"
            width={104}
            tick={{ fontSize: 11, fill: "var(--foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-raised)" }}
            contentStyle={tooltipStyle}
            formatter={(value: number, _n, entry) => [
              `${value.toFixed(1)}% mean risk · ${(entry?.payload as TopDestination)?.shipments ?? 0} shipments`,
              "Lane",
            ]}
          />
          <Bar
            dataKey="riskPct"
            radius={[0, 3, 3, 0]}
            onClick={(entry) => onSelect?.((entry as unknown as TopDestination).destination)}
            cursor={onSelect ? "pointer" : undefined}
          >
            {data.map((d) => (
              <Cell
                key={d.destination}
                fill={
                  d.risk > 0.85
                    ? TIER_CSS_VAR.CRITICAL
                    : d.risk > 0.6
                      ? TIER_CSS_VAR.HIGH_RISK
                      : d.risk > 0.3
                        ? TIER_CSS_VAR.WATCH
                        : TIER_CSS_VAR.LOW_RISK
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
