import { createFileRoute } from "@tanstack/react-router";

/**
 * Server-side proxy to the ORCA FastAPI intelligence layer.
 *
 * Browser → /api/orca/*  →  ORCA_API_INTERNAL_URL  →  FastAPI
 *
 * Because this hop is server-side and same-origin, no CORS configuration is
 * required on the FastAPI side for the primary path. The upstream base URL is
 * read from the environment INSIDE the handler (edge runtimes inject env per
 * request), and is never exposed to the client.
 *
 * Ports to Next.js as app/api/orca/[...path]/route.ts with the same env var.
 */

const UPSTREAM_TIMEOUT_MS = 8000;

function upstreamBase(): string | null {
  const raw =
    process.env["ORCA_API_INTERNAL_URL"] ??
    process.env["ORCA_API_URL"] ??
    null;
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/**
 * Fixture mode is a normal operating state, not an HTTP failure, so these
 * responses are 200 with an explicit envelope. Returning 5xx made the browser
 * surface them as runtime errors.
 */
function unconfigured(): Response {
  return Response.json(
    {
      orca_unavailable: true,
      error: "orca_api_not_configured",
      detail:
        "No ORCA_API_INTERNAL_URL is configured for this environment. The client will operate on labelled offline fixture data.",
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}

async function forward(request: Request, splat: string): Promise<Response> {
  const base = upstreamBase();
  if (!base) return unconfigured();

  const incoming = new URL(request.url);
  const target = `${base}/${splat}${incoming.search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("accept", "application/json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const method = request.method.toUpperCase();
    const upstream = await fetch(target, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? null : await request.text(),
      signal: controller.signal,
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown upstream error";
    return Response.json(
      { error: "orca_api_unreachable", detail },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/orca/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => forward(request, params._splat ?? ""),
      POST: async ({ request, params }) => forward(request, params._splat ?? ""),
      PUT: async ({ request, params }) => forward(request, params._splat ?? ""),
      DELETE: async ({ request, params }) => forward(request, params._splat ?? ""),
    },
  },
});
