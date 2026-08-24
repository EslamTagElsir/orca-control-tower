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

export const Route = createFileRoute("/exceptions")({
  head: routeHead(
    "Exceptions — ORCA Control Tower",
    "Triage the ORCA priority exception queue with search, sort, risk-tier filters and SHAP drill-down.",
  ),
  component: ExceptionsPage,
});

function ExceptionsPage() {
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
