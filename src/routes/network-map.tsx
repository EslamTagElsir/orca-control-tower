import { createFileRoute } from "@tanstack/react-router";

import { RouteShell, routeHead } from "@/components/orca/RouteShell";

export const Route = createFileRoute("/network-map")({
  head: routeHead(
    "Network Map — ORCA Control Tower",
    "Full-screen geospatial view of shipment risk across the ORCA network.",
  ),
  component: NetworkMapPage,
});

function NetworkMapPage() {
  return (
    <RouteShell
      title="Network Map"
      subtitle="Full-screen geospatial risk view of the scored portfolio."
      endpoints={["GET /api/orca/demo/overview (map_points)"]}
    />
  );
}
