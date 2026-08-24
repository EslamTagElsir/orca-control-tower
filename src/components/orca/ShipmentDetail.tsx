import { useQuery } from "@tanstack/react-query";
import { Check, CircleDot, Circle, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { shipmentQuery } from "@/lib/orca/client";
import { useOrca } from "@/lib/orca/context";
import { days, featureLabel, hours, moneyExact, pct } from "@/lib/orca/format";
import { TIER_RANGE } from "@/lib/orca/risk";
import type { ShipmentDetailResponse } from "@/lib/orca/types";
import { EvidenceBadge, PanelEmpty, PanelError, PanelSkeleton, RiskBadge } from "./primitives";

function Timeline({ stages }: { stages: ShipmentDetailResponse["timeline"] }) {
  return (
    <ol className="space-y-0">
      {stages.map((stage, i) => {
        const Icon =
          stage.state === "complete" ? Check : stage.state === "active" ? CircleDot : Circle;
        const tone =
          stage.state === "complete"
            ? "text-success border-success/40 bg-success/10"
            : stage.state === "active"
              ? "text-primary border-primary/40 bg-primary/10"
              : "text-muted-foreground border-hairline bg-surface-raised";
        return (
          <li key={stage.label} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <span
                className={cn("grid size-5 shrink-0 place-items-center rounded-full border", tone)}
              >
                <Icon className="size-2.5" aria-hidden />
              </span>
              {i < stages.length - 1 ? (
                <span
                  className={cn(
                    "w-px flex-1",
                    stage.state === "complete" ? "bg-success/40" : "bg-hairline",
                  )}
                  aria-hidden
                />
              ) : null}
            </div>
            <span
              className={cn(
                "pb-3 text-xs",
                stage.state === "pending" ? "text-muted-foreground" : "text-foreground/90",
              )}
            >
              {stage.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function RiskDrivers({ drivers }: { drivers: ShipmentDetailResponse["risk_drivers"] }) {
  if (drivers.length === 0)
    return <PanelEmpty message="No SHAP drivers returned for this shipment." />;
  const max = Math.max(...drivers.map((d) => Math.abs(d.shap_value)), 1e-6);

  return (
    <ul className="space-y-2">
      {drivers.map((d) => {
        const raises = d.direction === "raises";
        const width = (Math.abs(d.shap_value) / max) * 100;
        return (
          <li key={d.feature} className="space-y-1">
            <div className="flex items-center gap-2 text-[11px]">
              {raises ? (
                <TrendingUp className="size-3 shrink-0 text-danger" aria-hidden />
              ) : (
                <TrendingDown className="size-3 shrink-0 text-success" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate text-foreground/90" title={d.feature}>
                {featureLabel(d.feature)}
              </span>
              <span className={cn("orca-num shrink-0", raises ? "text-danger" : "text-success")}>
                {d.shap_value > 0 ? "+" : ""}
                {d.shap_value.toFixed(3)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
              <div
                className={cn("h-full rounded-full", raises ? "bg-danger" : "bg-success")}
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ShipmentDetail({ shipmentId }: { shipmentId: string | null }) {
  const { seed } = useOrca();
  const query = useQuery(shipmentQuery(shipmentId, seed));

  if (!shipmentId)
    return <PanelEmpty message="Select a shipment from the map, stream or exception queue." />;
  if (query.isPending) return <PanelSkeleton rows={8} />;
  if (query.isError)
    return <PanelError message={(query.error as Error).message} onRetry={() => query.refetch()} />;

  const s = query.data.data;

  return (
    <div className="space-y-4">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="orca-num text-sm font-semibold">{s.display_id}</h3>
          <RiskBadge tier={s.risk_tier} value={s.risk} />
          <EvidenceBadge label={s.evidence_label} />
        </div>
        <p className="text-xs text-muted-foreground">{s.route}</p>
        <p className="orca-num text-[10px] text-muted-foreground/70">
          {s.provenance} · source id {s.source_shipment_id} · model {s.model_version}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="orca-label text-[10px]">Late probability</dt>
          <dd className="orca-num mt-0.5" title={`Model tier ${TIER_RANGE[s.risk_tier]}`}>
            {pct(s.risk, 1)}
          </dd>
        </div>
        <div>
          <dt className="orca-label text-[10px]">Predicted delay (p50)</dt>
          <dd className="orca-num mt-0.5">
            {days(s.severity_p50)}{" "}
            <span className="text-muted-foreground">
              [{days(s.severity_interval_90[0])} – {days(s.severity_interval_90[1])}]
            </span>
          </dd>
        </div>
        <div>
          <dt className="orca-label text-[10px]">Status</dt>
          <dd className="mt-0.5">
            {s.status} · {s.progress_pct}%
          </dd>
        </div>
        <div>
          <dt className="orca-label text-[10px]">ETA variance</dt>
          <dd className="orca-num mt-0.5">{hours(s.eta_variance_hours)}</dd>
        </div>
        <div>
          <dt className="orca-label text-[10px]">Mode / vendor</dt>
          <dd className="mt-0.5 truncate" title={`${s.shipment_mode} · ${s.vendor}`}>
            {s.shipment_mode} · {s.vendor}
          </dd>
        </div>
        <div>
          <dt className="orca-label text-[10px]">Line item value</dt>
          <dd className="orca-num mt-0.5">{moneyExact(s.line_item_value)}</dd>
        </div>
        <div>
          <dt className="orca-label text-[10px]">Fulfil via</dt>
          <dd className="mt-0.5 truncate">{s.fulfill_via}</dd>
        </div>
        <div>
          <dt className="orca-label text-[10px]">Customer priority</dt>
          <dd className="mt-0.5">{s.customer_priority}</dd>
        </div>
      </dl>

      <section className="space-y-2">
        <h4 className="orca-label text-[10px]">Top risk drivers (SHAP)</h4>
        <RiskDrivers drivers={s.risk_drivers} />
      </section>

      <section className="space-y-2">
        <h4 className="orca-label text-[10px]">Milestones</h4>
        <Timeline stages={s.timeline} />
      </section>
    </div>
  );
}
