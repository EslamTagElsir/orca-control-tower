import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { num } from "@/lib/orca/format";
import { routeHead } from "@/components/orca/RouteShell";
import { PageFrame } from "@/components/orca/PageFrame";
import { OverviewBoundary } from "@/components/orca/OverviewBoundary";
import { EvidenceBadge } from "@/components/orca/primitives";
import { ScenarioWorkbench } from "@/components/orca/ScenarioWorkbench";
import { useSimulation } from "@/lib/orca/simulation/context";
import { byRiskDesc, findSim, simRows } from "@/lib/orca/simulation/selectors";
import { SIM_PROVENANCE } from "@/lib/orca/simulation/types";
import type { DataSource } from "@/lib/orca/types";

export const Route = createFileRoute("/simulator")({
  head: routeHead(
    "What-If Simulator — ORCA Control Tower",
    "Run ORCA counterfactual scenarios and compare intervention cost against expected benefit.",
  ),
  component: SimulatorPage,
});

function SimulatorPage() {
  const { isActive } = useSimulation();
  return isActive ? <SimulationSimulator /> : <PortfolioSimulator />;
}

/**
 * With the twin running, the what-if baseline is the shipment's CURRENT
 * simulated feature state (creation bias + every applied shock), so the
 * counterfactual is measured against live conditions, not the template row.
 */
function SimulationSimulator() {
  const { snapshot } = useSimulation();
  const rows = useMemo(() => byRiskDesc(simRows(snapshot)), [snapshot]);
  const source: DataSource = snapshot.modelOnline === false ? "fixture" : "live";

  return (
    <PageFrame
      title="What-If Simulator"
      subtitle={`Counterfactual scenarios over ${num(rows.length)} live synthetic shipments · risk scored by real POST /predict, recommendation by POST /recommend`}
      source={source}
      actions={
        <>
          <EvidenceBadge label={SIM_PROVENANCE.twin} />
          <EvidenceBadge label={SIM_PROVENANCE.shockResult} />
        </>
      }
    >
      <ScenarioWorkbench
        shipments={rows}
        variant="simulator"
        baselineRaw={(id) => findSim(snapshot, id)?.raw}
        baselineLabel="Baseline: current simulated feature state of this shipment (includes every applied operational shock)."
      />
    </PageFrame>
  );
}

function PortfolioSimulator() {
  return (
    <OverviewBoundary>
      {({ overview, source, reason }) => (
        <PageFrame
          title="What-If Simulator"
          subtitle={`Counterfactual scenarios over ${num(overview.map_points.length)} scored shipments · risk scored by real POST /predict, recommendation by POST /recommend`}
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
