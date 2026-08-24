import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OrcaShipment, RiskTier } from "@/lib/orca/types";
import { days, hours, money, pct } from "@/lib/orca/format";
import { TIER_LABEL } from "@/lib/orca/risk";
import { DecisionBadge, PanelEmpty, RiskBadge } from "./primitives";

type SortKey = "id" | "route" | "issue" | "risk" | "severity_p50" | "expected_exposure";

const TIER_FILTERS: Array<{ value: "ALL" | RiskTier; label: string }> = [
  { value: "ALL", label: "All tiers" },
  { value: "CRITICAL", label: TIER_LABEL.CRITICAL },
  { value: "HIGH_RISK", label: TIER_LABEL.HIGH_RISK },
  { value: "WATCH", label: TIER_LABEL.WATCH },
  { value: "LOW_RISK", label: TIER_LABEL.LOW_RISK },
];

export function ExceptionsTable({
  shipments,
  selectedId,
  onSelect,
  compact = false,
}: {
  shipments: OrcaShipment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<"ALL" | RiskTier>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("risk");
  const [desc, setDesc] = useState(true);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = shipments.filter((s) => {
      const matchesTier = tier === "ALL" || s.risk_tier === tier;
      const matchesQuery =
        !q ||
        s.id.toLowerCase().includes(q) ||
        s.route.toLowerCase().includes(q) ||
        s.issue.toLowerCase().includes(q);
      return matchesTier && matchesQuery;
    });
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return desc ? -cmp : cmp;
    });
  }, [shipments, query, tier, sortKey, desc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setDesc((v) => !v);
    else {
      setSortKey(key);
      setDesc(true);
    }
  }

  const SortHead = ({ label, k, align = "left" }: { label: string; k: SortKey; align?: "left" | "right" }) => (
    <th
      scope="col"
      className={cn("px-3 py-2 font-medium", align === "right" ? "text-right" : "text-left")}
    >
      <button
        onClick={() => toggleSort(k)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          sortKey === k ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        {sortKey === k ? (
          desc ? (
            <ArrowDown className="size-3" aria-hidden />
          ) : (
            <ArrowUp className="size-3" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2">
        <div className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shipment, lane or issue"
            className="h-8 w-full rounded-md border border-hairline bg-surface-sunken pl-8 pr-2.5 text-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value as "ALL" | RiskTier)}
          className="h-8 rounded-md border border-hairline bg-surface-sunken px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {TIER_FILTERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <PanelEmpty message="No shipments match the current filters." />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-surface-sunken text-[11px] uppercase tracking-wide">
              <tr className="border-b border-hairline">
                <SortHead label="Shipment" k="id" />
                <SortHead label="Origin → Destination" k="route" />
                <SortHead label="Issue" k="issue" />
                <SortHead label="Risk" k="risk" align="right" />
                <SortHead label="Pred. delay" k="severity_p50" align="right" />
                {!compact ? <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">Decision</th> : null}
                <SortHead label="Exposure" k="expected_exposure" align="right" />
                <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  className={cn(
                    "cursor-pointer border-b border-hairline/60 transition-colors hover:bg-surface-raised",
                    selectedId === s.id && "bg-primary/10 hover:bg-primary/15",
                  )}
                >
                  <td className="orca-num px-3 py-2 font-medium">{s.id}</td>
                  <td className="max-w-[16rem] truncate px-3 py-2 text-foreground/85" title={s.route}>
                    {s.route}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.issue}</td>
                  <td className="px-3 py-2 text-right">
                    <RiskBadge tier={s.risk_tier} value={s.risk} />
                  </td>
                  <td className="orca-num px-3 py-2 text-right" title={`90% interval ${days(s.severity_interval_90[0])} – ${days(s.severity_interval_90[1])}`}>
                    {days(s.severity_p50)}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {hours(s.eta_variance_hours, 0)}
                    </span>
                  </td>
                  {!compact ? (
                    <td className="px-3 py-2">
                      <DecisionBadge decision={s.decision} />
                    </td>
                  ) : null}
                  <td className="orca-num px-3 py-2 text-right text-muted-foreground">{money(s.expected_exposure)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-grid size-6 place-items-center rounded-md border border-hairline text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      <Eye className="size-3.5" aria-hidden />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-hairline px-3 py-1.5 text-[10px] text-muted-foreground">
        Risk is the calibrated late probability; predicted delay is severity p50 with a 90% interval on hover.
        Exposure = risk × severity × configured delay cost. {rows.length} of {shipments.length} shown ·{" "}
        {pct(rows.filter((r) => r.risk > 0.85).length / Math.max(rows.length, 1), 0)} in the CRITICAL tier.
      </p>
    </div>
  );
}
