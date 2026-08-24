import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { useOrca } from "@/lib/orca/context";
import { num } from "@/lib/orca/format";
import { routeHead } from "@/components/orca/RouteShell";
import { PageFrame } from "@/components/orca/PageFrame";
import { OverviewBoundary } from "@/components/orca/OverviewBoundary";
import { Panel, PanelBody, PanelHeader, EvidenceBadge } from "@/components/orca/primitives";
import { ShipmentPicker } from "@/components/orca/ShipmentPicker";
import { ShipmentDetail } from "@/components/orca/ShipmentDetail";
import { SimShipmentDetail } from "@/components/orca/SimShipmentDetail";
import { useSimulation } from "@/lib/orca/simulation/context";
import { byRiskDesc, simRows } from "@/lib/orca/simulation/selectors";
import { SIM_PROVENANCE } from "@/lib/orca/simulation/types";
import type { DataSource } from "@/lib/orca/types";

export const Route = createFileRoute("/shipments")({
  head: routeHead(
    "Shipments — ORCA Control Tower",
    "Investigate any scored shipment: risk tier, severity interval, ETA variance and SHAP risk drivers from ORCA.",
  ),
  component: ShipmentsPage,
});

function ShipmentsPage() {
  const { isActive } = useSimulation();
  return isActive ? <SimulationShipments /> : <PortfolioShipments />;
}

function SimulationShipments() {
  const { selectedShipmentId, setSelectedShipmentId } = useOrca();
  const { snapshot } = useSimulation();

  const rows = useMemo(() => byRiskDesc(simRows(snapshot)), [snapshot]);
  const source: DataSource = snapshot.modelOnline === false ? "fixture" : "live";
  const focusId = selectedShipmentId ?? rows[0]?.id ?? null;

  return (
    <PageFrame
      title="Shipments"
      subtitle={`Investigation workspace over ${num(rows.length)} live synthetic shipments · risk, tier and severity from ORCA /predict`}
      source={source}
      actions={
        <>
          <EvidenceBadge label={SIM_PROVENANCE.twin} />
          <EvidenceBadge label={SIM_PROVENANCE.model} />
        </>
      }
    >
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="h-[calc(100vh-15rem)] min-h-[24rem]">
          <PanelHeader
            title="Shipment index"
            hint="Active twin population, highest model risk first"
            source={source}
          />
          <ShipmentPicker shipments={rows} selectedId={focusId} onSelect={setSelectedShipmentId} />
        </Panel>

        <Panel className="h-[calc(100vh-15rem)] min-h-[24rem] xl:col-span-2">
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
    </PageFrame>
  );
}

function PortfolioShipments() {
  const { selectedShipmentId, setSelectedShipmentId } = useOrca();

  return (
    <OverviewBoundary>
      {({ overview, source, reason }) => {
        const shipments = overview.map_points;
        const focusId = selectedShipmentId ?? shipments[0]?.id ?? null;

        return (
          <PageFrame
            title="Shipments"
            subtitle={`Investigation workspace over ${num(shipments.length)} scored source rows · model ${overview.model_version}`}
            source={source}
            reason={reason}
            actions={<EvidenceBadge label={overview.evidence.model_output} />}
          >
            <div className="grid gap-3 xl:grid-cols-3">
              <Panel className="h-[calc(100vh-13rem)] min-h-[24rem]">
                <PanelHeader
                  title="Shipment index"
                  hint="Bundled real source rows, highest predicted risk first"
                  source={source}
                />
                <ShipmentPicker
                  shipments={shipments}
                  selectedId={focusId}
                  onSelect={setSelectedShipmentId}
                />
              </Panel>

              <Panel className="h-[calc(100vh-13rem)] min-h-[24rem] xl:col-span-2">
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
