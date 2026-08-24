import { lazy, Suspense } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";

import { useOrca, useOverview } from "@/lib/orca/context";
import { FIXTURE_NOTICE } from "@/lib/orca/client";
import { money, num } from "@/lib/orca/format";
import { PRIORITY_ATTENTION_SUBLABEL } from "@/lib/orca/risk";
import {
  EvidenceBadge,
  Panel,
  PanelBody,
  PanelError,
  PanelHeader,
  PanelSkeleton,
} from "@/components/orca/primitives";
import { KpiRow } from "@/components/orca/KpiRow";
import { ExceptionSummary, RiskDistributionChart, TopRiskyLanes } from "@/components/orca/Charts";
import { EventStream } from "@/components/orca/EventStream";
import { ExceptionsTable } from "@/components/orca/ExceptionsTable";
import { ShipmentDetail } from "@/components/orca/ShipmentDetail";

const RiskMap = lazy(() => import("@/components/orca/RiskMap"));

const TITLE = "Control Tower — ORCA Supply Chain Decision Intelligence";
const DESCRIPTION =
  "Live shipment risk, exception triage and intervention economics from the ORCA delay-intelligence model.";

export const Route = createFileRoute("/control-tower")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ControlTower,
});

function MapFallback() {
  return (
    <div className="grid h-full w-full place-items-center bg-surface-sunken text-xs text-muted-foreground">
      Loading risk map…
    </div>
  );
}

function ControlTower() {
  const { selectedShipmentId, setSelectedShipmentId } = useOrca();
  const query = useOverview();

  if (query.isPending) {
    return (
      <div className="space-y-3 p-4">
        <PanelSkeleton rows={3} />
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel className="lg:col-span-2 h-72">
            <PanelBody>
              <PanelSkeleton rows={6} />
            </PanelBody>
          </Panel>
          <Panel className="h-72">
            <PanelBody>
              <PanelSkeleton rows={6} />
            </PanelBody>
          </Panel>
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4">
        <Panel>
          <PanelBody>
            <PanelError message={(query.error as Error).message} onRetry={() => query.refetch()} />
          </PanelBody>
        </Panel>
      </div>
    );
  }

  const { data: overview, source, reason } = query.data;
  const focusId = selectedShipmentId ?? overview.priority_exceptions[0]?.id ?? null;

  return (
    <div className="space-y-3 p-3 lg:p-4">
      {source === "fixture" ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          <span className="font-semibold tracking-wide">{FIXTURE_NOTICE}</span>
          <span className="text-danger/80">
            The ORCA API is unreachable{reason ? ` (${reason})` : ""}. Every figure below is deterministic
            stand-in data and must not be read as a model output.
          </span>
        </div>
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Control Tower</h1>
          <p className="text-xs text-muted-foreground">
            Portfolio of {num(overview.kpis.active_shipments)} scored shipments · seed {overview.seed} · model{" "}
            {overview.model_version}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <EvidenceBadge label={overview.evidence.real_data} />
          <EvidenceBadge label={overview.evidence.model_output} />
          <EvidenceBadge label={overview.evidence.simulated} />
          <button
            onClick={() => query.refetch()}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className={query.isFetching ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
            Refresh
          </button>
        </div>
      </header>

      <KpiRow kpis={overview.kpis} source={source} />

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Global Risk Heat Map"
            hint={`${overview.map_points.length} positions from ORCA map_points`}
            source={source}
          />
          <div className="h-[380px] w-full">
            <ClientOnly fallback={<MapFallback />}>
              <Suspense fallback={<MapFallback />}>
                <RiskMap
                  points={overview.map_points}
                  selectedId={focusId}
                  onSelect={setSelectedShipmentId}
                />
              </Suspense>
            </ClientOnly>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Live Event Stream" hint="Newest first" source={source} />
          <PanelBody className="p-2">
            <EventStream
              events={overview.events}
              shipments={overview.map_points}
              onSelect={setSelectedShipmentId}
            />
          </PanelBody>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel>
          <PanelHeader title="Exception Distribution" hint="By ORCA issue label" source={source} />
          <PanelBody>
            <ExceptionSummary shipments={overview.map_points} />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Risk Tier Distribution" hint="Backend model tiers" source={source} />
          <PanelBody>
            <RiskDistributionChart distribution={overview.risk_distribution} />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Top Risky Lanes" hint="Mean risk by destination" source={source} />
          <PanelBody>
            <TopRiskyLanes destinations={overview.top_destinations} />
          </PanelBody>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Priority Exceptions"
            hint={PRIORITY_ATTENTION_SUBLABEL}
            source={source}
            actions={
              <span className="orca-num hidden text-[11px] text-muted-foreground sm:inline">
                exposure {money(overview.kpis.estimated_exposure)} · net benefit{" "}
                {money(overview.kpis.potential_net_benefit)}
              </span>
            }
          />
          <ExceptionsTable
            shipments={overview.priority_exceptions}
            selectedId={focusId}
            onSelect={setSelectedShipmentId}
          />
        </Panel>

        <Panel>
          <PanelHeader title="Shipment Intelligence" hint="Explainability" source={source} />
          <PanelBody className="overflow-y-auto">
            <ShipmentDetail shipmentId={focusId} />
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
