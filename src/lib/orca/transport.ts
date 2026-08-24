/**
 * ORCA transport layer.
 *
 * Two interchangeable modes, both hitting the SAME four core FastAPI
 * endpoints (`/health`, `/predict`, `/explain`, `/recommend`):
 *
 *  - "proxy"  → same-origin `/api/orca/*` server proxy (ORCA_API_INTERNAL_URL).
 *               No CORS configuration required. Default for deployments.
 *  - "direct" → the browser calls a configurable API base URL directly
 *               (e.g. http://127.0.0.1:8000 during a local demo).
 *
 * Configuration is persisted in localStorage and exposed through a tiny
 * observable store so React can re-render on change without a framework
 * dependency in the data layer.
 */

export type TransportMode = "proxy" | "direct";

export interface ConnectionConfig {
  mode: TransportMode;
  /** Only used in "direct" mode. */
  baseUrl: string;
}

export const DEFAULT_DIRECT_BASE_URL = "http://127.0.0.1:8000";
export const PROXY_BASE_PATH = "/api/orca";
const STORAGE_KEY = "orca.connection.v1";

const DEFAULT_CONFIG: ConnectionConfig = {
  mode: "direct",
  baseUrl: DEFAULT_DIRECT_BASE_URL,
};

let current: ConnectionConfig = { ...DEFAULT_CONFIG };
let loaded = false;
const listeners = new Set<() => void>();

function readStorage(): ConnectionConfig {
  if (typeof window === "undefined") return { ...DEFAULT_CONFIG };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<ConnectionConfig>;
    return {
      mode: parsed.mode === "proxy" ? "proxy" : "direct",
      baseUrl:
        typeof parsed.baseUrl === "string" && parsed.baseUrl.trim()
          ? parsed.baseUrl.trim()
          : DEFAULT_DIRECT_BASE_URL,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Lazily hydrates from localStorage on first browser read. */
export function getConnectionConfig(): ConnectionConfig {
  if (!loaded && typeof window !== "undefined") {
    current = readStorage();
    loaded = true;
  }
  return current;
}

export function setConnectionConfig(next: Partial<ConnectionConfig>): ConnectionConfig {
  const merged: ConnectionConfig = {
    mode: next.mode ?? getConnectionConfig().mode,
    baseUrl: (next.baseUrl ?? getConnectionConfig().baseUrl).trim() || DEFAULT_DIRECT_BASE_URL,
  };
  current = merged;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      /* storage unavailable — in-memory config still applies */
    }
  }
  listeners.forEach((l) => l());
  return merged;
}

export function subscribeConnectionConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Snapshot used by SSR — never touches localStorage. */
export function getServerConnectionConfig(): ConnectionConfig {
  return DEFAULT_CONFIG;
}

export function endpointUrl(path: string, config = getConnectionConfig()): string {
  if (config.mode === "direct") {
    return `${config.baseUrl.replace(/\/+$/, "")}${path}`;
  }
  return `${PROXY_BASE_PATH}${path}`;
}

export class OrcaUnavailableError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OrcaUnavailableError";
  }
}

/** True when the failure means "no live backend", i.e. fixture fallback applies. */
export function isUnreachable(error: unknown): boolean {
  return (
    error instanceof OrcaUnavailableError &&
    (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504)
  );
}

export interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
  config?: ConnectionConfig;
}

/**
 * The single place in the app where `fetch` is called against ORCA.
 * No component or hook may call fetch directly.
 */
export async function orcaRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, timeoutMs = 45_000 } = options;
  const url = endpointUrl(path, options.config ?? getConnectionConfig());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { "content-type": "application/json", accept: "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new OrcaUnavailableError(
      error instanceof Error ? error.message : "Network request failed",
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  const record = (payload ?? {}) as Record<string, unknown>;

  // The server proxy reports "no live ORCA backend" as a 200 envelope so the
  // browser does not treat an expected offline state as an HTTP failure.
  if (record["orca_unavailable"] === true) {
    throw new OrcaUnavailableError(
      typeof record["detail"] === "string" ? record["detail"] : "ORCA API unreachable",
      0,
    );
  }

  if (!response.ok) {
    const detail =
      typeof record["detail"] === "string"
        ? record["detail"]
        : typeof record["error"] === "string"
          ? record["error"]
          : `ORCA request failed (${response.status})`;
    throw new OrcaUnavailableError(detail, response.status);
  }

  return payload as T;
}

/** Bounded-concurrency map so portfolio scoring never floods the backend. */
export async function mapWithConcurrency<I, O>(
  items: readonly I[],
  limit: number,
  worker: (item: I, index: number) => Promise<O>,
): Promise<O[]> {
  const out = new Array<O>(items.length);
  let cursor = 0;

  async function runner(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      out[index] = await worker(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return out;
}
