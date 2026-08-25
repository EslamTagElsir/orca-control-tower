import { createFileRoute } from "@tanstack/react-router";

/**
 * Server-side proxy to the ORCA FastAPI intelligence layer.
 *
 * Browser → /api/orca/* → ORCA_API_INTERNAL_URL → FastAPI
 *
 * The public proxy is intentionally allow-listed to the four backend contracts
 * used by this application. Adding a new upstream route requires an explicit
 * code change here rather than automatically exposing future FastAPI endpoints.
 */

const UPSTREAM_TIMEOUT_MS = 30000;
const RETRY_STATUSES = new Set([502, 503, 504]);
const RETRY_ATTEMPTS = 4;
const RETRY_BASE_MS = 500;

const ALLOWED_ENDPOINTS = new Map<string, "GET" | "POST">([
  ["health", "GET"],
  ["predict", "POST"],
  ["explain", "POST"],
  ["recommend", "POST"],
]);

function upstreamBase(): string | null {
  const raw = process.env["ORCA_API_INTERNAL_URL"] ?? process.env["ORCA_API_URL"] ?? null;
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function isLoopback(base: string): boolean {
  try {
    const host = new URL(base).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0";
  } catch {
    return false;
  }
}

function unconfigured(): Response {
  return Response.json(
    {
      orca_unavailable: true,
      error: "orca_api_not_configured",
      detail:
        "No ORCA backend is configured for this environment. The client will operate on labelled offline fixture data.",
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}

function forbiddenRoute(path: string, method: string): Response {
  return Response.json(
    {
      error: "orca_proxy_route_not_allowed",
      detail: `The ORCA frontend proxy does not expose ${method} /${path}.`,
    },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}

async function forward(request: Request, splat: string): Promise<Response> {
  const path = splat.replace(/^\/+|\/+$/g, "");
  const method = request.method.toUpperCase();
  const allowedMethod = ALLOWED_ENDPOINTS.get(path);
  if (!allowedMethod || method !== allowedMethod) return forbiddenRoute(path, method);

  const base = upstreamBase();
  if (!base) return unconfigured();

  const incoming = new URL(request.url);
  const target = `${base}/${path}${incoming.search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("accept", "application/json");

  const payload = method === "GET" ? null : await request.text();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    let upstream: Response | null = null;
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      upstream = await fetch(target, {
        method,
        headers,
        body: payload,
        signal: controller.signal,
      });
      if (!RETRY_STATUSES.has(upstream.status)) break;
      if (attempt < RETRY_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * 2 ** attempt));
      }
    }

    const body = await upstream!.text();

    if (RETRY_STATUSES.has(upstream!.status)) {
      return Response.json(
        {
          orca_unavailable: true,
          error: "orca_api_gateway_error",
          detail: `The ORCA intelligence service returned ${upstream!.status} after ${RETRY_ATTEMPTS} attempts. It may be saturated or restarting. No substitute model value is applied.`,
          upstream_kind: "remote",
        },
        { status: 200, headers: { "cache-control": "no-store" } },
      );
    }

    return new Response(body, {
      status: upstream!.status,
      headers: {
        "content-type": upstream!.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unknown upstream error";
    const detail = isLoopback(base)
      ? `The configured ORCA backend resolves to a loopback address that is not reachable from this app server (${raw}). Use a publicly reachable backend URL for hosted deployments, or Direct Browser mode for local development.`
      : `The ORCA intelligence service is unreachable (${raw}).`;
    return Response.json(
      {
        orca_unavailable: true,
        error: "orca_api_unreachable",
        detail,
        upstream_kind: isLoopback(base) ? "loopback" : "remote",
      },
      { status: 200, headers: { "cache-control": "no-store" } },
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
    },
  },
});
