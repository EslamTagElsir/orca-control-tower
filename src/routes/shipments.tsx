import { createFileRoute } from "@tanstack/react-router";

import { RouteShell, routeHead } from "@/components/orca/RouteShell";

export const Route = createFileRoute("/shipments")({
  head: routeHead(
    "Shipments — ORCA Control Tower",
    "Browse every scored shipment with calibrated late risk, predicted delay and decision output.",
  ),
  component: ShipmentsPage,
});

function ShipmentsPage() {
  return (
    <RouteShell
      title="Shipments"
      subtitle="Full portfolio grid with risk, decision and exposure columns."
      endpoints={["GET /api/orca/demo/overview", "GET /api/orca/demo/shipments/{id}"]}
    />
  );
}
