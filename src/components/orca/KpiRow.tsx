import { AlertTriangle, CircleDollarSign, Gauge, ShieldAlert, Target, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DataSource, OrcaKpis } from "@/lib/orca/types";
import { money, num, pct } from "@/lib/orca/format";
import type { SimKpis } from "@/lib/orca/simulation/selectors";
import { DerivedBadge, SourceBadge } from "./primitives";

type Tone = "primary" | "warn" | "danger" | "success" | "model";

const TONE: Record<Tone, { text: string; ring: string; bg: string }> = {
  primary: { text: "text-primary", ring: "border-primary/25", bg: "bg-primary/10" },
  warn: { text: "text-warn", ring: "border-warn/25", bg: "bg-warn/10" },
  danger: { text: "text-danger", ring: "border-danger/25", bg: "bg-danger/10" },
  success: { text: "text-success", ring: "border-success/25", bg: "bg-success/10" },
  model: { text: "text-model", ring: "border-model/25", bg: "bg-model/10" },
};

function KpiCard({
  label,
  value,
  definition,
  icon: Icon,
  tone,
  source,
  derived,
}: {
  label: string;
  value: string;
  definition: string;
  icon: LucideIcon;
  tone: Tone;
  source: DataSource;
  derived?: boolean;
}) {
  const t = TONE[tone];
  return (
    <article className="orca-panel relative flex min-w-0 flex-col gap-2.5 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <h3 className={cn("orca-label leading-4", t.text)}>{label}</h3>
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-md border",
            t.ring,
            t.bg,
            t.text,
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </span>
      </div>
      <p className="orca-num truncate text-[26px] font-semibold leading-none tracking-tight">
        {value}
      </p>
      <div className="flex items-start gap-1.5">
        <p
          className="min-w-0 flex-1 text-[11px] leading-4 text-balance text-muted-foreground"
          title={definition}
        >
          {definition}
        </p>
        {derived ? <DerivedBadge /> : null}
        <SourceBadge source={source} />
      </div>
    </article>
  );
}

export function KpiRow({ kpis, source }: { kpis: OrcaKpis; source: DataSource }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
      <KpiCard
        label="Active Shipments"
        value={num(kpis.active_shipments)}
        definition="Shipments in the scored portfolio"
        icon={Truck}
        tone="primary"
        source={source}
      />
      <KpiCard
        label="Exceptions"
        value={num(kpis.exceptions)}
        definition="Calibrated late risk ≥ 0.30"
        icon={AlertTriangle}
        tone="warn"
        source={source}
      />
      <KpiCard
        label="Critical"
        value={num(kpis.critical_exceptions)}
        definition="CRITICAL model tier — late risk > 0.85"
        icon={ShieldAlert}
        tone="warn"
        source={source}
      />
      <KpiCard
        label="Model Positive"
        value={num(kpis.model_positive)}
        definition="Predictions above the model decision threshold (/predict)"
        icon={Target}
        tone="danger"
        source={source}
      />
      <KpiCard
        label="Modeled On-Time Likelihood"
        value={pct(kpis.modeled_on_time_likelihood)}
        definition="1 − mean calibrated late probability"
        icon={Gauge}
        tone="success"
        source={source}
      />
      <KpiCard
        label="Average Risk"
        value={pct(kpis.average_risk)}
        definition={`Portfolio mean · exposure ${money(kpis.estimated_exposure)}`}
        icon={Gauge}
        tone="model"
        source={source}
      />
    </div>
  );
}

/**
 * KPI strip for the Operational Digital Twin.
 *
 * Counts are run-scoped over the synthetic population; the risk-tier counts are
 * ORCA /predict output. No monetary figure is shown here because the twin has
 * no ORCA economics payload — Decision Economics owns that.
 */
export function SimKpiRow({ kpis, source }: { kpis: SimKpis; source: DataSource }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
      <KpiCard
        label="Active Shipments"
        value={num(kpis.active)}
        definition="Synthetic shipments currently live in the twin"
        icon={Truck}
        tone="primary"
        source={source}
      />
      <KpiCard
        label="In Transit"
        value={num(kpis.inTransit)}
        definition="Moving along a synthetic route leg"
        icon={Gauge}
        tone="primary"
        source={source}
      />
      <KpiCard
        label="Open Exceptions"
        value={num(kpis.openExceptions)}
        definition="Synthetic operational exceptions awaiting recovery"
        icon={AlertTriangle}
        tone="warn"
        source={source}
      />
      <KpiCard
        label="At Risk (High + Critical)"
        value={num(kpis.atRisk)}
        definition="ORCA model tier above 0.60 predicted late-risk"
        icon={ShieldAlert}
        tone="danger"
        source={source}
      />
      <KpiCard
        label="Critical Tier"
        value={num(kpis.critical)}
        definition="ORCA model tier above 0.85 predicted late-risk"
        icon={Target}
        tone="danger"
        source={source}
      />
      <KpiCard
        label="Mean Model Risk"
        value={kpis.averageRisk === null ? "—" : pct(kpis.averageRisk, 1)}
        definition={
          kpis.averageRisk === null
            ? "No ORCA score yet for the active population"
            : `Mean /predict probability over ${kpis.modelScored} scored shipments`
        }
        icon={CircleDollarSign}
        tone="model"
        source={source}
        derived
      />
    </div>
  );
}
