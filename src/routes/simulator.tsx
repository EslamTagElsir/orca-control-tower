import { createFileRoute } from "@tanstack/react-router";

import { num } from "@/lib/orca/format";
import { routeHead } from "@/components/orca/RouteShell";
import { PageFrame } from "@/components/orca/PageFrame";
import { OverviewBoundary } from "@/components/orca/OverviewBoundary";
import { EvidenceBadge } from "@/components/orca/primitives";
import { ScenarioWorkbench } from "@/components/orca/ScenarioWorkbench";

export const Route = createFileRoute("/simulator")({
  head: routeHead(
    "What-If Simulator — ORCA Control Tower",
    "Run ORCA counterfactual scenarios and compare intervention cost against expected benefit.",
  ),
  component: SimulatorPage,
});

function SimulatorPage() {
  return (
    <OverviewBoundary>
      {({ overview, source, reason }) => (
        <PageFrame
          title="What-If Simulator"
          subtitle={`Counterfactual scenarios over ${num(overview.map_points.length)} scored shipments · POST /demo/scenario is authoritative for every value shown`}
          source={source}
          reason={reason}
          actions={<EvidenceBadge label={overview.evidence.simulated} />}
        >
          <ScenarioWorkbench shipments={overview.map_points} variant="simulator" />
        </PageFrame>
      )}
    </OverviewBoundary>
  );
}
