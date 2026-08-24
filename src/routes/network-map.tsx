import { lazy, Suspense, useMemo } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";

import { useOrca } from "@/lib/orca/context";
import { num } from "@/lib/orca/format";
import { routeHead } from "@/components/orca/RouteShell";
import { PageFrame } from "@/components/orca/PageFrame";
import { OverviewBoundary } from "@/components/orca/OverviewBoundary";
import { EvidenceBadge, Panel, PanelBody, PanelHeader } from "@/components/orca/primitives";
import { ShipmentDetail } from "@/components/orca/ShipmentDetail";
import { SimShipmentDetail } from "@/components/orca/SimShipmentDetail";
import { useSimulation } from "@/lib/orca/simulation/context";
import { byRiskDesc, simRoutes, simRows } from "@/lib/orca/simulation/selectors";
import { SIM_PROVENANCE } from "@/lib/orca/simulation/types";
import type { DataSource } from "@/lib/orca/types";

const RiskMap = lazy(() => import("@/components/orca/RiskMap"));

export const Route = createFileRoute("/network-map")({
  head: routeHead(
    "Network Map — ORCA Control Tower",
    "Full-screen geospatial view of ORCA-scored shipment positions with per-shipment risk drill-down.",
  ),
  component: NetworkMapPage,
});

function MapFallback() {
  return (
    <div className="grid h-full w-full place-items-center bg-surface-sunken text-xs text-muted-foreground">
      Loading risk map…
    </div>
  );
}

function NetworkMapPage() {
  const { isActive } = useSimulation();
  return isActive ? <SimulationMap /> : <PortfolioMap />;
}

function SimulationMap() {
  const { selectedShipmentId, setSelectedShipmentId } = useOrca();
  const { snapshot } = useSimulation();

  const rows = useMemo(() => byRiskDesc(simRows(snapshot)), [snapshot]);
  const routes = useMemo(() => simRoutes(snapshot), [snapshot]);
  const source: DataSource = snapshot.modelOnline === false ? "fixture" : "live";
  const focusId = selectedShipmentId ?? rows[0]?.id ?? null;

  return (
    <PageFrame
      title="Network Map"
      subtitle={`${num(rows.length)} synthetic shipments moving along synthetic routes · risk tier from ORCA /predict`}
      source={source}
      actions={
        <>
          <EvidenceBadge label={SIM_PROVENANCE.twin} />
          <EvidenceBadge label={SIM_PROVENANCE.model} />
        </>
      }
    >
      <div className="grid gap-3 xl:grid-cols-4">
        <Panel className="h-[calc(100vh-15rem)] min-h-[26rem] xl:col-span-3">
          <PanelHeader
            title="Global Risk Heat Map"
            hint="Solid trail = travelled leg, dashed = remaining leg (synthetic geometry)"
            source={source}
          />
          <div className="min-h-0 flex-1">
            <ClientOnly fallback={<MapFallback />}>
              <Suspense fallback={<MapFallback />}>
                <RiskMap
                  points={rows}
                  routes={routes}
                  selectedId={focusId}
                  onSelect={setSelectedShipmentId}
                />
              </Suspense>
            </ClientOnly>
          </div>
        </Panel>

        <Panel className="h-[calc(100vh-15rem)] min-h-[26rem]">
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

function PortfolioMap() {
  const { selectedShipmentId, setSelectedShipmentId } = useOrca();

  return (
    <OverviewBoundary>
      {({ overview, source, reason }) => {
        const points = overview.map_points;
        const focusId = selectedShipmentId ?? points[0]?.id ?? null;

        return (
          <PageFrame
            title="Network Map"
            subtitle={`${num(points.length)} scored shipments · risk from ORCA /predict, map placement is a synthetic demo overlay`}
            source={source}
            reason={reason}
            actions={<EvidenceBadge label={overview.evidence.real_data} />}
          >
            <div className="grid gap-3 xl:grid-cols-4">
              <Panel className="h-[calc(100vh-13rem)] min-h-[26rem] xl:col-span-3">
                <PanelHeader
                  title="Global Risk Heat Map"
                  hint="Marker colour follows the backend risk tier"
                  source={source}
                />
                <div className="min-h-0 flex-1">
                  <ClientOnly fallback={<MapFallback />}>
                    <Suspense fallback={<MapFallback />}>
                      <RiskMap
                        points={points}
                        selectedId={focusId}
                        onSelect={setSelectedShipmentId}
                      />
                    </Suspense>
                  </ClientOnly>
                </div>
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
