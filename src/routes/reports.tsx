import { createFileRoute } from "@tanstack/react-router";

import { RouteShell, routeHead } from "@/components/orca/RouteShell";

export const Route = createFileRoute("/reports")({
  head: routeHead(
    "Reports — ORCA Control Tower",
    "Export ORCA evidence packs with provenance and model version preserved verbatim.",
  ),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <RouteShell
      title="Reports"
      subtitle="Exportable evidence packs with provenance preserved."
      endpoints={["GET /api/orca/demo/overview", "GET /api/orca/health"]}
    />
  );
}
