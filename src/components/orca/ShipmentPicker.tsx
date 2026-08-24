import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { pct } from "@/lib/orca/format";
import type { OrcaShipment } from "@/lib/orca/types";
import { PanelEmpty, RiskBadge } from "./primitives";

/**
 * Search + select over the shipments ORCA already returned in /demo/overview.
 * No shipment fields are invented; the list is exactly what the payload holds.
 */
export function ShipmentPicker({
  shipments,
  selectedId,
  onSelect,
  className,
}: {
  shipments: OrcaShipment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? shipments.filter(
          (s) =>
            s.id.toLowerCase().includes(q) ||
            s.source_shipment_id.toLowerCase().includes(q) ||
            s.route.toLowerCase().includes(q) ||
            s.issue.toLowerCase().includes(q),
        )
      : shipments;
    return [...list].sort((a, b) => b.risk - a.risk);
  }, [shipments, query]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="border-b border-hairline px-3 py-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shipment id, lane or issue"
            className="h-8 w-full rounded-md border border-hairline bg-surface-sunken pl-8 pr-2.5 text-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <PanelEmpty message="No shipments match this search." />
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => onSelect(s.id)}
                className={cn(
                  "flex w-full items-center gap-2 border-b border-hairline/60 px-3 py-2 text-left transition-colors hover:bg-surface-raised",
                  selectedId === s.id && "bg-primary/10 hover:bg-primary/15",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="orca-num block text-xs font-medium">{s.id}</span>
                  <span
                    className="block truncate text-[11px] text-muted-foreground"
                    title={s.route}
                  >
                    {s.route}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <RiskBadge tier={s.risk_tier} />
                  <span className="orca-num mt-0.5 block text-[10px] text-muted-foreground">
                    {pct(s.risk, 1)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Compact <select> variant for toolbars. */
export function ShipmentSelect({
  shipments,
  selectedId,
  onSelect,
  id,
}: {
  shipments: OrcaShipment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={selectedId ?? ""}
      onChange={(e) => onSelect(e.target.value)}
      className="h-8 w-full rounded-md border border-hairline bg-surface-sunken px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <option value="" disabled>
        Select a shipment
      </option>
      {shipments.map((s) => (
        <option key={s.id} value={s.id}>
          {s.id} · {s.route} · {pct(s.risk, 0)}
        </option>
      ))}
    </select>
  );
}
