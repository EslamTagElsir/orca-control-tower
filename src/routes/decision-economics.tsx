import { createFileRoute } from "@tanstack/react-router";

import { RouteShell, routeHead } from "@/components/orca/RouteShell";

export const Route = createFileRoute("/decision-economics")({
  head: routeHead(
    "Decision Economics — ORCA Control Tower",
    "Expected exposure, intervention cost and net benefit for every ORCA decision candidate.",
  ),
  component: DecisionEconomicsPage,
});

function DecisionEconomicsPage() {
  return (
    <RouteShell
      title="Decision Economics"
      subtitle="Exposure, benefit and net-benefit ledger per shipment."
      endpoints={["GET /api/orca/demo/overview", "POST /api/orca/demo/scenario", "POST /api/orca/recommend"]}
    />
  );
}
