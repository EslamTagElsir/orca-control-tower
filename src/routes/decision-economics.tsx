import { createFileRoute } from "@tanstack/react-router";

import { money } from "@/lib/orca/format";
import { routeHead } from "@/components/orca/RouteShell";
import { PageFrame } from "@/components/orca/PageFrame";
import { OverviewBoundary } from "@/components/orca/OverviewBoundary";
import { EvidenceBadge, Panel, PanelBody, PanelHeader } from "@/components/orca/primitives";
import { ScenarioWorkbench } from "@/components/orca/ScenarioWorkbench";

export const Route = createFileRoute("/decision-economics")({
  head: routeHead(
    "Decision Economics — ORCA Control Tower",
    "Expected exposure, intervention cost and net benefit for every ORCA decision candidate.",
  ),
  component: DecisionEconomicsPage,
});

function DecisionEconomicsPage() {
  return (
    <OverviewBoundary>
      {({ overview, source, reason }) => (
        <PageFrame
          title="Decision Economics"
          subtitle="Exposure, benefit and net-benefit ledger per shipment, computed by ORCA from your stated cost assumptions."
          source={source}
          reason={reason}
          actions={<EvidenceBadge label={overview.evidence.simulated} />}
        >
          <Panel>
            <PanelHeader
              title="Portfolio context"
              hint="Aggregated from real /predict + /recommend output over the bundled source rows"
              source={source}
            />
            <PanelBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border border-hairline bg-surface-sunken px-3 py-2">
                <p className="orca-label text-[10px]">Estimated exposure</p>
                <p className="orca-num mt-0.5 text-sm font-semibold">
                  {money(overview.kpis.estimated_exposure)}
                </p>
              </div>
              <div className="rounded-md border border-hairline bg-surface-sunken px-3 py-2">
                <p className="orca-label text-[10px]">Potential net benefit</p>
                <p className="orca-num mt-0.5 text-sm font-semibold">
                  {money(overview.kpis.potential_net_benefit)}
                </p>
              </div>
              <div className="rounded-md border border-hairline bg-surface-sunken px-3 py-2">
                <p className="orca-label text-[10px]">Model positive</p>
                <p className="orca-num mt-0.5 text-sm font-semibold">
                  {overview.kpis.model_positive}
                </p>
              </div>
              <div className="rounded-md border border-hairline bg-surface-sunken px-3 py-2">
                <p className="orca-label text-[10px]">Exceptions</p>
                <p className="orca-num mt-0.5 text-sm font-semibold">{overview.kpis.exceptions}</p>
              </div>
            </PanelBody>
          </Panel>

          <ScenarioWorkbench shipments={overview.map_points} variant="economics" />
        </PageFrame>
      )}
    </OverviewBoundary>
  );
}
