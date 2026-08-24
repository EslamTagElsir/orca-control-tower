import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { useOrca } from "@/lib/orca/context";
import { money, num } from "@/lib/orca/format";
import { PRIORITY_ATTENTION_SUBLABEL } from "@/lib/orca/risk";
import { routeHead } from "@/components/orca/RouteShell";
import { PageFrame } from "@/components/orca/PageFrame";
import { OverviewBoundary } from "@/components/orca/OverviewBoundary";
import { EvidenceBadge, Panel, PanelBody, PanelHeader } from "@/components/orca/primitives";
import { ExceptionsTable } from "@/components/orca/ExceptionsTable";
import { ShipmentDetail } from "@/components/orca/ShipmentDetail";
import { SimShipmentDetail } from "@/components/orca/SimShipmentDetail";
import { useSimulation } from "@/lib/orca/simulation/context";
import { simExceptions } from "@/lib/orca/simulation/selectors";
import { SIM_PROVENANCE } from "@/lib/orca/simulation/types";
import { RiskBadge } from "@/components/orca/primitives";
import { pct } from "@/lib/orca/format";
import type { DataSource } from "@/lib/orca/types";

export const Route = createFileRoute("/exceptions")({
  head: routeHead(
    "Exceptions — ORCA Control Tower",
    "Triage the ORCA priority exception queue with search, sort, risk-tier filters and SHAP drill-down.",
  ),
  component: ExceptionsPage,
});

function ExceptionsPage() {
  const { isActive } = useSimulation();
  return isActive ? <SimulationExceptions /> : <PortfolioExceptions />;
}

/** Live exception queue derived from the same global twin state. */
function SimulationExceptions() {
  const { selectedShipmentId, setSelectedShipmentId } = useOrca();
  const { snapshot } = useSimulation();

  const exceptions = useMemo(() => simExceptions(snapshot), [snapshot]);
  const rows = useMemo(() => exceptions.map((e) => e.row), [exceptions]);
  const source: DataSource = snapshot.modelOnline === false ? "fixture" : "live";
  const focusId = selectedShipmentId ?? rows[0]?.id ?? null;

  return (
    <PageFrame
      title="Exceptions"
      subtitle={`${num(rows.length)} open exceptions in the running twin · ${PRIORITY_ATTENTION_SUBLABEL}`}
      source={source}
      actions={
        <>
          <EvidenceBadge label={SIM_PROVENANCE.twin} />
          <EvidenceBadge label={SIM_PROVENANCE.model} />
        </>
      }
    >
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="h-[calc(100vh-15rem)] min-h-[26rem] xl:col-span-2">
          <PanelHeader
            title="Exception queue"
            hint="Synthetic operational trigger · ORCA model risk after re-score"
            source={source}
          />
          <ExceptionsTable shipments={rows} selectedId={focusId} onSelect={setSelectedShipmentId} />
        </Panel>

        <div className="flex min-w-0 flex-col gap-3">
          <Panel className="max-h-[18rem]">
            <PanelHeader
              title="Trigger &amp; model reaction"
              hint="Risk before → after each synthetic shock"
              source={source}
            />
            <PanelBody className="space-y-1.5 overflow-y-auto">
              {exceptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No open exceptions right now.</p>
              ) : (
                exceptions.map((e) => (
                  <button
                    key={e.shipment.id}
                    onClick={() => setSelectedShipmentId(e.shipment.id)}
                    className="flex w-full flex-wrap items-center gap-2 rounded-md border border-hairline bg-surface-sunken px-2 py-1.5 text-left text-[11px] hover:bg-accent"
                  >
                    <span className="orca-num font-semibold">{e.shipment.id}</span>
                    <RiskBadge
                      tier={e.shipment.model.tier}
                      {...(e.riskAfter !== null ? { value: e.riskAfter } : {})}
                    />
                    <span className="text-muted-foreground">{e.triggerLabel}</span>
                    {e.riskBefore !== null && e.riskAfter !== null ? (
                      <span className="orca-num ml-auto text-muted-foreground">
                        {pct(e.riskBefore, 1)} → {pct(e.riskAfter, 1)}
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </PanelBody>
          </Panel>

          <Panel className="min-h-0 flex-1">
            <PanelHeader
              title="Shipment Intelligence"
              hint="Model explanation — SHAP attribution is not causal proof"
              source={source}
            />
            <PanelBody className="overflow-y-auto">
              <SimShipmentDetail shipmentId={focusId} />
            </PanelBody>
          </Panel>
        </div>
      </div>
    </PageFrame>
  );
}

function PortfolioExceptions() {
  const { selectedShipmentId, setSelectedShipmentId } = useOrca();

  return (
    <OverviewBoundary>
      {({ overview, source, reason }) => {
        const rows = overview.priority_exceptions;
        const focusId = selectedShipmentId ?? rows[0]?.id ?? null;

        return (
          <PageFrame
            title="Exceptions"
            subtitle={`${num(rows.length)} shipments in the ORCA priority queue · ${PRIORITY_ATTENTION_SUBLABEL}`}
            source={source}
            reason={reason}
            actions={
              <>
                <EvidenceBadge label={overview.evidence.model_output} />
                <span className="orca-num hidden text-[11px] text-muted-foreground sm:inline">
                  exposure {money(overview.kpis.estimated_exposure)} · net benefit{" "}
                  {money(overview.kpis.potential_net_benefit)}
                </span>
              </>
            }
          >
            <div className="grid gap-3 xl:grid-cols-3">
              <Panel className="h-[calc(100vh-13rem)] min-h-[26rem] xl:col-span-2">
                <PanelHeader
                  title="Priority Exceptions"
                  hint={PRIORITY_ATTENTION_SUBLABEL}
                  source={source}
                />
                <ExceptionsTable
                  shipments={rows}
                  selectedId={focusId}
                  onSelect={setSelectedShipmentId}
                />
              </Panel>

              <Panel className="h-[calc(100vh-13rem)] min-h-[26rem]">
                <PanelHeader
                  title="Shipment Intelligence"
                  hint="Model explanation — SHAP attribution is not causal proof"
                  source={source}
                />
                <PanelBody className="overflow-y-auto">
                  <ShipmentDetail shipmentId={focusId} />
                </PanelBody>
              </Panel>
            </div>
          </PageFrame>
        );
      }}
    </OverviewBoundary>
  );
}
