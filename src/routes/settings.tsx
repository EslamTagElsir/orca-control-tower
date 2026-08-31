import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, PlugZap, ShieldAlert, XCircle } from "lucide-react";

import { routeHead } from "@/components/orca/RouteShell";
import { Panel, PanelBody, PanelHeader } from "@/components/orca/primitives";
import { useConnectionConfig } from "@/hooks/use-orca-connection";
import { getHealth } from "@/lib/orca/client";
import { useOrca } from "@/lib/orca/context";
import { getMonitoringReadiness, type MonitoringReadinessResponse } from "@/lib/orca/monitoring";
import { getReliability, type ReliabilityResponse } from "@/lib/orca/reliability";
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
    "Configure ORCA transport and verify service, registry evidence and monitoring-readiness contracts.",
  ),
  component: SettingsPage,
});

type EndpointCheck<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string };

type DiagnosticState =
  | { kind: "idle" }
  | { kind: "testing" }
  | {
      kind: "done";
      health: EndpointCheck<HealthResponse>;
      reliability: EndpointCheck<ReliabilityResponse>;
      monitoring: EndpointCheck<MonitoringReadinessResponse>;
    };

function failureReason(error: unknown): string {
  return error instanceof Error ? error.message : "Endpoint unavailable";
}

function DiagnosticRow({
  endpoint,
  ok,
  detail,
  tone = "default",
}: {
  endpoint: string;
  ok: boolean;
  detail: string;
  tone?: "default" | "warn";
}) {
  const Icon = ok ? (tone === "warn" ? ShieldAlert : CheckCircle2) : XCircle;
  const iconClass = ok ? (tone === "warn" ? "text-warn" : "text-success") : "text-danger";

  return (
    <div className="flex items-start gap-2 rounded-md border border-hairline bg-surface-sunken px-3 py-2.5">
      <Icon className={`mt-0.5 size-3.5 shrink-0 ${iconClass}`} aria-hidden />
      <div className="min-w-0">
        <p className="orca-num text-[11px] font-semibold text-foreground">{endpoint}</p>
        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function SettingsPage() {
  const config = useConnectionConfig();
  const queryClient = useQueryClient();
  const { autoRefresh, setAutoRefresh, refreshMs, setRefreshMs, connection, modelVersion } =
    useOrca();

  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [diagnostics, setDiagnostics] = useState<DiagnosticState>({ kind: "idle" });

  function applyMode(mode: TransportMode) {
    setConnectionConfig({ mode });
    setDiagnostics({ kind: "idle" });
    void queryClient.invalidateQueries({ queryKey: ["orca"] });
  }

  function applyBaseUrl() {
    setConnectionConfig({ baseUrl });
    setDiagnostics({ kind: "idle" });
    void queryClient.invalidateQueries({ queryKey: ["orca"] });
  }

  async function runDiagnostics() {
    setConnectionConfig({ baseUrl });
    setDiagnostics({ kind: "testing" });

    const [healthResult, reliabilityResult, monitoringResult] = await Promise.allSettled([
      getHealth(),
      getReliability(),
      getMonitoringReadiness(),
    ]);

    let health: EndpointCheck<HealthResponse>;
    if (
      healthResult.status === "fulfilled" &&
      healthResult.value.source === "live" &&
      healthResult.value.data
    ) {
      health = { ok: true, data: healthResult.value.data };
    } else if (healthResult.status === "fulfilled") {
      health = {
        ok: false,
        reason: healthResult.value.reason ?? "ORCA /health unreachable",
      };
    } else {
      health = { ok: false, reason: failureReason(healthResult.reason) };
    }

    const reliability: EndpointCheck<ReliabilityResponse> =
      reliabilityResult.status === "fulfilled"
        ? { ok: true, data: reliabilityResult.value }
        : { ok: false, reason: failureReason(reliabilityResult.reason) };

    const monitoring: EndpointCheck<MonitoringReadinessResponse> =
      monitoringResult.status === "fulfilled"
        ? { ok: true, data: monitoringResult.value }
        : { ok: false, reason: failureReason(monitoringResult.reason) };

    setDiagnostics({ kind: "done", health, reliability, monitoring });
    void queryClient.invalidateQueries({ queryKey: ["orca"] });
  }

  return (
    <div className="space-y-3 p-3 lg:p-4">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Settings & Diagnostics</h1>
        <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
          Configure transport and verify the ORCA backend surface. Operational connection state is still decided by{" "}
          <span className="orca-num">GET /health</span> alone; reliability evidence and production-monitoring readiness
          are checked separately so they cannot be mistaken for service health.
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
                  onChange={(event) => setBaseUrl(event.target.value)}
                  onBlur={applyBaseUrl}
                  spellCheck={false}
                  placeholder={DEFAULT_DIRECT_BASE_URL}
                  disabled={config.mode !== "direct"}
                  className="orca-num h-8 min-w-0 flex-1 rounded-md border border-hairline bg-surface-sunken px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => {
                    setBaseUrl(DEFAULT_DIRECT_BASE_URL);
                    setConnectionConfig({ baseUrl: DEFAULT_DIRECT_BASE_URL });
                    setDiagnostics({ kind: "idle" });
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
                type="button"
                onClick={() => void runDiagnostics()}
                disabled={diagnostics.kind === "testing"}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <PlugZap className="size-3.5" aria-hidden />
                {diagnostics.kind === "testing" ? "Running diagnostics…" : "Run diagnostics"}
              </button>
              <span className="text-[11px] text-muted-foreground">
                Current state: {connection.toUpperCase()}
                {modelVersion ? ` · model ${modelVersion}` : ""}
              </span>
            </div>

            {diagnostics.kind === "done" ? (
              <div className="space-y-2">
                <DiagnosticRow
                  endpoint="GET /health"
                  ok={diagnostics.health.ok}
                  detail={
                    diagnostics.health.ok
                      ? `Service reachable · model ${diagnostics.health.data.model_version} · status ${diagnostics.health.data.status}`
                      : `${diagnostics.health.reason} · operational UI remains OFFLINE FIXTURE DATA.`
                  }
                />
                <DiagnosticRow
                  endpoint="GET /reliability"
                  ok={diagnostics.reliability.ok}
                  detail={
                    diagnostics.reliability.ok
                      ? `Registry evidence reachable · model ${diagnostics.reliability.data.model_version ?? "—"} · contract ${diagnostics.reliability.data.prediction_contract_version ?? "—"}`
                      : diagnostics.reliability.reason
                  }
                />
                <DiagnosticRow
                  endpoint="GET /monitoring-readiness"
                  ok={diagnostics.monitoring.ok}
                  tone={
                    diagnostics.monitoring.ok && !diagnostics.monitoring.data.production_monitoring_connected
                      ? "warn"
                      : "default"
                  }
                  detail={
                    diagnostics.monitoring.ok
                      ? diagnostics.monitoring.data.production_monitoring_connected
                        ? `Endpoint reachable · production monitoring ${diagnostics.monitoring.data.status}.`
                        : `Endpoint reachable · production monitoring ${diagnostics.monitoring.data.status}; this is a valid readiness state, not a service failure.`
                      : diagnostics.monitoring.reason
                  }
                />
              </div>
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
                onChange={(event) => setAutoRefresh(event.target.checked)}
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
                onChange={(event) => setRefreshMs(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-raised accent-primary"
              />
            </div>

            <div className="space-y-1 border-t border-hairline pt-3 text-[11px] text-muted-foreground">
              <p className="orca-label text-[10px]">Backend surface in use</p>
              <p className="orca-num">GET /health — operational service health</p>
              <p className="orca-num">GET /reliability — frozen registry evidence</p>
              <p className="orca-num">GET /monitoring-readiness — production evidence readiness</p>
              <p className="orca-num">POST /predict — calibrated risk + severity</p>
              <p className="orca-num">POST /explain — SHAP + exploratory hypotheses</p>
              <p className="orca-num">POST /recommend — decision recommendation</p>
              <p className="pt-1 leading-snug">
                No /demo/* endpoint is called. Operational views and what-if scenarios are composed in the frontend
                from explicit ORCA contracts over bundled source rows, while evidence and monitoring states remain
                independently labelled.
              </p>
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
