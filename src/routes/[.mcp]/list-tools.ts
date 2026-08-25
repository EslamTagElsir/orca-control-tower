import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.mcp/list-tools")({
  server: {
    handlers: {
      ANY: () =>
        Response.json(
          { error: "mcp_disabled", detail: "The public ORCA MCP interface is disabled." },
          { status: 404, headers: { "cache-control": "no-store" } },
        ),
    },
  },
});
