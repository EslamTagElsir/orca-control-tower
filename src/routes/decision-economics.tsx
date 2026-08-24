import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { money, num, pct } from "@/lib/orca/format";
import { routeHead } from "@/components/orca/RouteShell";
import { PageFrame } from "@/components/orca/PageFrame";
import { OverviewBoundary } from "@/components/orca/OverviewBoundary";
import { EvidenceBadge, Panel, PanelBody, PanelHeader } from "@/components/orca/primitives";
import { ScenarioWorkbench } from "@/components/orca/ScenarioWorkbench";
import { useSimulation } from "@/lib/orca/simulation/context";
import { byRiskDesc, findSim, simKpis, simRows } from "@/lib/orca/simulation/selectors";
import { SIM_PROVENANCE } from "@/lib/orca/simulation/types";
import type { DataSource } from "@/lib/orca/types";

export const Route = createFileRoute("/decision-economics")({
  head: routeHead(
    "Decision Economics — ORCA Control Tower",
    "Expected exposure, intervention cost and net benefit for every ORCA decision candidate.",
  ),
  component: DecisionEconomicsPage,
});

function DecisionEconomicsPage() {
  const { isActive } = useSimulation();
  return isActive ? <SimulationEconomics /> : <PortfolioEconomics />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-surface-sunken px-3 py-2">
      <p className="orca-label text-[10px]">{label}</p>
      <p className="orca-num mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function SimulationEconomics() {
  const { snapshot } = useSimulation();
  const rows = useMemo(() => byRiskDesc(simRows(snapshot)), [snapshot]);
  const kpis = useMemo(() => simKpis(snapshot), [snapshot]);
  const source: DataSource = snapshot.modelOnline === false ? "fixture" : "live";

  return (
    <PageFrame
      title="Decision Economics"
      subtitle="Exposure, benefit and net-benefit ledger per shipment, computed from your stated cost assumptions against live ORCA risk."
      source={source}
      actions={
        <>
          <EvidenceBadge label={SIM_PROVENANCE.twin} />
          <EvidenceBadge label={SIM_PROVENANCE.shockResult} />
        </>
      }
    >
      <Panel>
        <PanelHeader
          title="Run context"
          hint="Counts are run-scoped over the synthetic population; risk figures are ORCA /predict output"
          source={source}
        />
        <PanelBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Active shipments" value={num(kpis.active)} />
          <Stat label="Model positive" value={num(kpis.modelPositive)} />
          <Stat label="At risk (high + critical)" value={num(kpis.atRisk)} />
          <Stat label="Open exceptions" value={num(kpis.openExceptions)} />
          <Stat
            label="Mean model risk"
            value={kpis.averageRisk === null ? "—" : pct(kpis.averageRisk, 1)}
          />
        </PanelBody>
        <PanelBody className="pt-0">
          <p className="text-[11px] text-muted-foreground">
            No portfolio monetary total is shown for a simulated run: ORCA returns no financial
            payload for synthetic shipments. Run a scenario below to get a per-shipment ledger from
            your own cost assumptions.
          </p>
        </PanelBody>
      </Panel>

      <ScenarioWorkbench
        shipments={rows}
        variant="economics"
        baselineRaw={(id) => findSim(snapshot, id)?.raw}
        baselineLabel="Baseline: current simulated feature state of this shipment (includes every applied operational shock)."
      />
    </PageFrame>
  );
}

function PortfolioEconomics() {
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
              <Stat label="Estimated exposure" value={money(overview.kpis.estimated_exposure)} />
              <Stat
                label="Potential net benefit"
                value={money(overview.kpis.potential_net_benefit)}
              />
              <Stat label="Model positive" value={num(overview.kpis.model_positive)} />
              <Stat label="Exceptions" value={num(overview.kpis.exceptions)} />
            </PanelBody>
          </Panel>

          <ScenarioWorkbench shipments={overview.map_points} variant="economics" />
        </PageFrame>
      )}
    </OverviewBoundary>
  );
}
