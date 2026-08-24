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

/**
 * Cold ORCA starts load the v2 model registry (CatBoost + 3 LightGBM quantile
 * models) and score the demo portfolio on the first `/demo/overview` call,
 * which measured ~9.6s in live testing before the per-process cache warms.
 * The budget must clear that cold path or the very first page load falls back
 * to fixture mode on an API that is actually healthy.
 */
const UPSTREAM_TIMEOUT_MS = 30000;

function upstreamBase(): string | null {
  const raw = process.env["ORCA_API_INTERNAL_URL"] ?? process.env["ORCA_API_URL"] ?? null;
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/**
 * A loopback upstream resolves to the SERVER container, not the operator's
 * workstation, so it can only ever work in a local dev sandbox. Detect it so
 * the offline envelope explains the real cause instead of "fetch failed".
 */
function isLoopback(base: string): boolean {
  try {
    const host = new URL(base).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0";
  } catch {
    return false;
  }
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

/**
 * The hosted ORCA container drops a request with a bare 502/503/504 when the
 * simulation fires a burst of concurrent /predict + /recommend calls. That is a
 * transient upstream condition, not a dead backend, so retry it a bounded
 * number of times with a short backoff before surfacing the failure.
 */
const RETRY_STATUSES = new Set([502, 503, 504]);
const RETRY_ATTEMPTS = 4;
const RETRY_BASE_MS = 500;

async function forward(request: Request, splat: string): Promise<Response> {
  const base = upstreamBase();
  if (!base) return unconfigured();

  const incoming = new URL(request.url);
  const target = `${base}/${splat}${incoming.search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("accept", "application/json");

  const method = request.method.toUpperCase();
  // Read once: the request body stream cannot be replayed across retries.
  const payload = method === "GET" || method === "HEAD" ? null : await request.text();

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

    // An exhausted gateway failure is the same operating state as an
    // unreachable upstream: return the 200 offline envelope the client already
    // understands so the shipment stays labelled unscored instead of the
    // browser surfacing a 502 runtime error and blanking the page.
    if (RETRY_STATUSES.has(upstream!.status)) {
      return Response.json(
        {
          orca_unavailable: true,
          error: "orca_api_gateway_error",
          detail: `ORCA upstream ${base} returned ${upstream!.status} after ${RETRY_ATTEMPTS} attempts — the intelligence layer is saturated or restarting. No substitute model value is applied.`,
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
      ? `Configured ORCA upstream ${base} is a loopback address, which resolves to the app server (not your workstation) and has no ORCA service listening (${raw}). Set ORCA_API_INTERNAL_URL to a publicly reachable ORCA base URL, or switch Settings to Direct Browser mode for a local FastAPI with CORS enabled.`
      : `ORCA upstream ${base} is unreachable (${raw}).`;
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
      PUT: async ({ request, params }) => forward(request, params._splat ?? ""),
      DELETE: async ({ request, params }) => forward(request, params._splat ?? ""),
    },
  },
});
