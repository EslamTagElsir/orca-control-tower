import { createFileRoute } from "@tanstack/react-router";

import { RouteShell, routeHead } from "@/components/orca/RouteShell";

export const Route = createFileRoute("/settings")({
  head: routeHead(
    "Settings — ORCA Control Tower",
    "Configure the ORCA proxy connection, demo seed and console refresh behaviour.",
  ),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <RouteShell
      title="Settings"
      subtitle="Connection, seed and refresh preferences for the console."
      endpoints={["GET /api/orca/health"]}
    />
  );
}
