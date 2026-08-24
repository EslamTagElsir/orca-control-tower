import { createFileRoute } from "@tanstack/react-router";

import { RouteShell, routeHead } from "@/components/orca/RouteShell";

export const Route = createFileRoute("/simulator")({
  head: routeHead(
    "What-If Simulator — ORCA Control Tower",
    "Run ORCA counterfactual scenarios and compare intervention cost against expected benefit.",
  ),
  component: SimulatorPage,
});

function SimulatorPage() {
  return (
    <RouteShell
      title="What-If Simulator"
      subtitle="Counterfactual scenarios with intervention economics."
      endpoints={["GET /api/orca/demo/scenarios", "POST /api/orca/demo/scenario"]}
    />
  );
}
