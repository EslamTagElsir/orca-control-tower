import { createFileRoute } from "@tanstack/react-router";

function disabledMcpResponse(): Response {
  return Response.json(
    {
      error: "mcp_disabled",
      detail: "The public ORCA MCP interface is disabled.",
    },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: () => disabledMcpResponse(),
    },
  },
});
