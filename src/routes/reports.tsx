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
      endpoints={["POST /predict · POST /recommend", "GET /health"]}
    />
  );
}
