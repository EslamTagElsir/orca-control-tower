import { createFileRoute } from "@tanstack/react-router";

import { RouteShell, routeHead } from "@/components/orca/RouteShell";

export const Route = createFileRoute("/analytics")({
  head: routeHead(
    "Analytics — ORCA Control Tower",
    "Lane, tier and issue aggregations derived from the ORCA overview payload.",
  ),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return (
    <RouteShell
      title="Analytics"
      subtitle="Aggregations computed from the ORCA overview payload."
      endpoints={["GET /api/orca/demo/overview (risk_distribution, top_destinations)"]}
    />
  );
}
