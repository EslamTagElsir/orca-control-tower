import { createFileRoute } from "@tanstack/react-router";

import { RouteShell, routeHead } from "@/components/orca/RouteShell";

export const Route = createFileRoute("/model-monitor")({
  head: routeHead(
    "Model Monitor — ORCA Control Tower",
    "Model version, registry role and evidence labels reported by the ORCA health endpoint.",
  ),
  component: ModelMonitorPage,
});

function ModelMonitorPage() {
  return (
    <RouteShell
      title="Model Monitor"
      subtitle="Model version, registry role and evidence labels from /health."
      endpoints={["GET /api/orca/health"]}
    />
  );
}
