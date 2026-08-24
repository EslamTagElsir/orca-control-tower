/**
 * Detail panel for a SYNTHETIC OPERATIONAL DIGITAL TWIN shipment.
 *
 * Operational fields (status, progress, coordinates, ETA variance, events) are
 * synthetic. Risk, tier, severity and the recommendation are copied verbatim
 * from the real ORCA /predict and /recommend responses stored on the shipment,
 * and /explain is called ON DEMAND for the selected shipment only.
 */

import { useMutation } from "@tanstack/react-query";
import { Cpu, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { explain } from "@/lib/orca/client";
import { featureLabel, hours, pct } from "@/lib/orca/format";
import { TIER_RANGE } from "@/lib/orca/risk";
import { useSimulation } from "@/lib/orca/simulation/context";
import { eventsForShipment, findSim } from "@/lib/orca/simulation/selectors";
import { SIM_PROVENANCE, SIM_STATUS_LABEL } from "@/lib/orca/simulation/types";
import type { ExplainResponse, ShapContribution } from "@/lib/orca/types";
import { DecisionBadge, EvidenceBadge, PanelEmpty, PanelError, RiskBadge } from "./primitives";

function Field({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0">
      <dt className="orca-label text-[10px]">{label}</dt>
      <dd className="orca-num mt-0.5 truncate text-xs text-foreground/90" title={title ?? value}>
        {value}
      </dd>
    </div>
  );
}

function Drivers({ data }: { data: ExplainResponse }) {
  const drivers: ShapContribution[] = data.shap_contributions ?? [];
  if (drivers.length === 0) return <PanelEmpty message="No SHAP drivers returned." />;
  const max = Math.max(...drivers.map((d) => Math.abs(d.shap_value)), 1e-6);
  return (
    <ul className="space-y-2">
      {drivers.map((d) => {
        const raises = d.shap_value > 0;
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
                {raises ? "+" : ""}
                {d.shap_value.toFixed(3)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
              <div
                className={cn("h-full rounded-full", raises ? "bg-danger" : "bg-success")}
                style={{ width: `${(Math.abs(d.shap_value) / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function SimShipmentDetail({ shipmentId }: { shipmentId: string | null }) {
  const { snapshot } = useSimulation();
  const shipment = findSim(snapshot, shipmentId);
  const events = eventsForShipment(snapshot, shipmentId);

  const explainMutation = useMutation<ExplainResponse, Error, void>({
    mutationFn: () => {
      if (!shipment) throw new Error("No shipment selected.");
      return explain({ features: shipment.features });
    },
  });

  if (!shipment)
    return <PanelEmpty message="Select a simulated shipment from the map, list or event stream." />;

  const model = shipment.model;
  const scored = model.phase === "scored";

  return (
    <div className="space-y-4">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="orca-num text-sm font-semibold">{shipment.id}</h3>
          <RiskBadge tier={model.tier} {...(scored ? { value: model.risk ?? 0 } : {})} />
          <EvidenceBadge label={SIM_PROVENANCE.twin} />
          {scored ? <EvidenceBadge label={SIM_PROVENANCE.model} /> : null}
        </div>
        <p className="text-xs text-muted-foreground">{shipment.route}</p>
        <p className="orca-num text-[10px] text-muted-foreground/70">
          Feature template row {shipment.templateId} (REAL DATA, outcomes excluded) · operational
          motion is {SIM_PROVENANCE.ops}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Status" value={SIM_STATUS_LABEL[shipment.status]} />
        <Field label="Progress" value={`${Math.round(shipment.progress * 100)}%`} />
        <Field label="Next milestone" value={shipment.nextMilestone} />
        <Field label="Mode" value={shipment.mode} />
        <Field
          label="Position (synthetic)"
          value={`${shipment.position[0].toFixed(2)}, ${shipment.position[1].toFixed(2)}`}
        />
        <Field label="ETA variance" value={hours(shipment.etaVarianceHours)} />
        <Field
          label="Model risk"
          value={scored ? pct(model.risk ?? 0, 1) : "—"}
          title={scored ? `Model tier ${TIER_RANGE[model.tier]}` : SIM_PROVENANCE.unscored}
        />
        <Field
          label="Severity p50"
          value={scored && model.severity_p50 !== null ? `${model.severity_p50.toFixed(1)} d` : "—"}
        />
        <Field
          label="Decision threshold"
          value={model.decision_threshold !== null ? model.decision_threshold.toFixed(3) : "—"}
        />
      </dl>

      {!scored ? (
        <p className="rounded-md border border-hairline bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          {model.phase === "offline"
            ? `${SIM_PROVENANCE.unscored} — ORCA /predict is unreachable${model.offlineReason ? ` (${model.offlineReason})` : ""}. No substitute risk value is shown.`
            : "Awaiting the first ORCA /predict response for this shipment."}
        </p>
      ) : null}

      {model.previousRisk !== null && model.risk !== null ? (
        <div className="rounded-md border border-hairline bg-surface-sunken px-3 py-2">
          <p className="orca-label text-[10px]">Risk before → after (model re-score)</p>
          <p className="orca-num mt-0.5 text-xs">
            {pct(model.previousRisk, 1)} →{" "}
            <span className="font-semibold">{pct(model.risk, 1)}</span>{" "}
            <span className="text-muted-foreground">
              ({model.risk >= model.previousRisk ? "+" : ""}
              {((model.risk - model.previousRisk) * 100).toFixed(1)} pp)
            </span>
          </p>
        </div>
      ) : null}

      {model.recommendation ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="orca-label text-[10px]">ORCA recommendation</span>
            <DecisionBadge decision={model.recommendation.action} />
            {model.recommendation.human_approval_required ? (
              <span className="rounded-sm border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                HUMAN APPROVAL REQUIRED
              </span>
            ) : null}
          </div>
          <ul className="space-y-0.5">
            {model.recommendation.reasons.map((r) => (
              <li key={r} className="text-[11px] text-muted-foreground">
                · {r}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {shipment.featureAudit.length > 0 ? (
        <div className="space-y-1.5">
          <span className="orca-label text-[10px]">
            Feature audit — {SIM_PROVENANCE.shockInput}
          </span>
          <p className="text-[10px] text-muted-foreground/80">
            Bounded pre-outcome feature shocks applied by synthetic operational events, each
            followed by a real /predict re-score:{" "}
            {shipment.appliedProfiles.join(" · ") || "creation bias only"}
          </p>
          <ul className="orca-num space-y-0.5">
            {shipment.featureAudit.map((line, i) => (
              <li key={`${line}-${i}`} className="text-[10px] text-foreground/80">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {shipment.candidateSearch.length > 1 ? (
        <div className="space-y-1.5">
          <span className="orca-label text-[10px]">
            Creation candidate search — {SIM_PROVENANCE.model}
          </span>
          <p className="text-[10px] text-muted-foreground/80">
            Bounded in-domain candidate feature states, each scored by a real ORCA /predict call.
            The candidate the model rated highest was kept; no tier was assigned locally.
          </p>
          <ul className="orca-num space-y-0.5">
            {shipment.candidateSearch.map((line, i) => (
              <li key={`${line}-${i}`} className="text-[10px] text-foreground/80">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}


      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="orca-label text-[10px]">SHAP risk drivers</span>
          <button
            onClick={() => explainMutation.mutate()}
            disabled={explainMutation.isPending || !scored}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <Sparkles className="size-3" aria-hidden />
            {explainMutation.isPending ? "Explaining…" : "Explain with ORCA"}
          </button>
        </div>
        {explainMutation.isError ? (
          <PanelError
            message={explainMutation.error.message}
            onRetry={() => explainMutation.mutate()}
          />
        ) : explainMutation.data ? (
          <Drivers data={explainMutation.data} />
        ) : (
          <p className="text-[11px] text-muted-foreground">
            /explain is called on demand for the selected shipment only — never for the whole
            generated population.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <span className="orca-label text-[10px]">Operational events — {SIM_PROVENANCE.ops}</span>
        {events.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No events recorded yet.</p>
        ) : (
          <ul className="space-y-1">
            {events.slice(0, 14).map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-[11px]">
                <span className="orca-num shrink-0 text-muted-foreground">{e.clock}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-foreground/85">{e.detail}</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                    {e.eventType === "MODEL" ? <Cpu className="size-2.5" aria-hidden /> : null}
                    {e.provenance}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
