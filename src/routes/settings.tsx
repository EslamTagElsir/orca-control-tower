import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PlugZap, XCircle } from "lucide-react";

import { routeHead } from "@/components/orca/RouteShell";
import { Panel, PanelBody, PanelHeader } from "@/components/orca/primitives";
import { useConnectionConfig } from "@/hooks/use-orca-connection";
import { getHealth } from "@/lib/orca/client";
import { useOrca } from "@/lib/orca/context";
import {
  DEFAULT_DIRECT_BASE_URL,
  PROXY_BASE_PATH,
  setConnectionConfig,
  type TransportMode,
} from "@/lib/orca/transport";
import type { HealthResponse } from "@/lib/orca/types";

export const Route = createFileRoute("/settings")({
  head: routeHead(
    "Settings — ORCA Control Tower",
    "Choose the ORCA transport mode, configure the API base URL and test the /health connection.",
  ),
  component: SettingsPage,
});

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; health: HealthResponse }
  | { kind: "fail"; reason: string };

function SettingsPage() {
  const config = useConnectionConfig();
  const queryClient = useQueryClient();
  const { autoRefresh, setAutoRefresh, refreshMs, setRefreshMs, connection, modelVersion } =
    useOrca();

  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  function applyMode(mode: TransportMode) {
    setConnectionConfig({ mode });
    void queryClient.invalidateQueries({ queryKey: ["orca"] });
  }

  function applyBaseUrl() {
    setConnectionConfig({ baseUrl });
    void queryClient.invalidateQueries({ queryKey: ["orca"] });
  }

  async function testConnection() {
    setConnectionConfig({ baseUrl });
    setTest({ kind: "testing" });
    const result = await getHealth();
    if (result.source === "live" && result.data) setTest({ kind: "ok", health: result.data });
    else setTest({ kind: "fail", reason: result.reason ?? "ORCA /health unreachable" });
    void queryClient.invalidateQueries({ queryKey: ["orca"] });
  }

  return (
    <div className="space-y-3 p-3 lg:p-4">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-muted-foreground">
          Transport mode, API base URL and console refresh behaviour. Connection state is decided by{" "}
          <span className="orca-num">GET /health</span> alone.
        </p>
      </header>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="ORCA connection" hint="Persisted in this browser" />
          <PanelBody className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="orca-label text-[10px]">Connection mode</legend>
              {(
                [
                  {
                    mode: "direct" as const,
                    title: "Direct browser",
                    detail: "The browser calls the API base URL below (needs CORS on the backend).",
                  },
                  {
                    mode: "proxy" as const,
                    title: "Server proxy",
                    detail: `Same-origin ${PROXY_BASE_PATH}/* using ORCA_API_INTERNAL_URL. No CORS required.`,
                  },
                ] as const
              ).map((option) => (
                <label
                  key={option.mode}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md border border-hairline bg-surface-sunken px-3 py-2"
                >
                  <input
                    type="radio"
                    name="orca-mode"
                    className="mt-0.5 accent-primary"
                    checked={config.mode === option.mode}
                    onChange={() => applyMode(option.mode)}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold">{option.title}</span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">
                      {option.detail}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="space-y-1.5">
              <label htmlFor="orca-base-url" className="orca-label text-[10px]">
                API base URL (direct browser mode)
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="orca-base-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  onBlur={applyBaseUrl}
                  spellCheck={false}
                  placeholder={DEFAULT_DIRECT_BASE_URL}
                  disabled={config.mode !== "direct"}
                  className="orca-num h-8 min-w-0 flex-1 rounded-md border border-hairline bg-surface-sunken px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                />
                <button
                  onClick={() => {
                    setBaseUrl(DEFAULT_DIRECT_BASE_URL);
                    setConnectionConfig({ baseUrl: DEFAULT_DIRECT_BASE_URL });
                  }}
                  className="rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Reset
                </button>
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                Used only in direct browser mode. Point it at a local ORCA instance
                (http://127.0.0.1:8000) or a public HTTPS backend.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
              <button
                onClick={() => void testConnection()}
                disabled={test.kind === "testing"}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <PlugZap className="size-3.5" aria-hidden />
                {test.kind === "testing" ? "Testing /health…" : "Test connection"}
              </button>
              <span className="text-[11px] text-muted-foreground">
                Current state: {connection.toUpperCase()}
                {modelVersion ? ` · model ${modelVersion}` : ""}
              </span>
            </div>

            {test.kind === "ok" ? (
              <div className="space-y-1 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-[11px] text-success">
                <p className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  /health OK — status {test.health.status}
                </p>
                <p className="orca-num">model_version: {test.health.model_version}</p>
                <p className="orca-num">registry_role: {test.health.registry_role ?? "—"}</p>
                <p className="orca-num">
                  evidence_labels: {(test.health.evidence_labels ?? []).join(", ") || "—"}
                </p>
              </div>
            ) : null}
            {test.kind === "fail" ? (
              <p className="flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] text-danger">
                <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <strong className="font-semibold">Unreachable.</strong> {test.reason} — the
                  console stays on OFFLINE FIXTURE DATA until /health responds.
                </span>
              </p>
            ) : null}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Console behaviour" hint="Client-side preferences" />
          <PanelBody className="space-y-4">
            <label className="flex items-start gap-2.5 rounded-md border border-hairline bg-surface-sunken px-3 py-2">
              <input
                type="checkbox"
                className="mt-0.5 accent-primary"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <span>
                <span className="block text-xs font-semibold">Auto-refresh</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  Polls /health and re-scores the portfolio on the interval below. Portfolio scoring
                  issues one /predict and one /recommend call per source row, so keep this modest.
                </span>
              </span>
            </label>

            <div className="space-y-1.5">
              <label htmlFor="orca-refresh" className="orca-label text-[10px]">
                Refresh interval — {(refreshMs / 1000).toFixed(0)}s
              </label>
              <input
                id="orca-refresh"
                type="range"
                min={15000}
                max={300000}
                step={15000}
                value={refreshMs}
                onChange={(e) => setRefreshMs(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-raised accent-primary"
              />
            </div>

            <div className="space-y-1 border-t border-hairline pt-3 text-[11px] text-muted-foreground">
              <p className="orca-label text-[10px]">Backend surface in use</p>
              <p className="orca-num">GET /health</p>
              <p className="orca-num">POST /predict</p>
              <p className="orca-num">POST /explain</p>
              <p className="orca-num">POST /recommend</p>
              <p className="leading-snug">
                No /demo/* endpoint is called. Overview, shipment intelligence and what-if scenarios
                are composed in the frontend from these four endpoints over the bundled real source
                rows.
              </p>
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
