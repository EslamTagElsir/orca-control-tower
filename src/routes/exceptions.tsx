import { createFileRoute } from "@tanstack/react-router";

import { RouteShell, routeHead } from "@/components/orca/RouteShell";

export const Route = createFileRoute("/exceptions")({
  head: routeHead(
    "Exceptions — ORCA Control Tower",
    "Triage ORCA exceptions by risk tier, issue and intervention economics.",
  ),
  component: ExceptionsPage,
});

function ExceptionsPage() {
  return (
    <RouteShell
      title="Exceptions"
      subtitle="Triage queue for shipments above the exception threshold."
      endpoints={["GET /api/orca/demo/overview", "POST /api/orca/recommend"]}
    />
  );
}
