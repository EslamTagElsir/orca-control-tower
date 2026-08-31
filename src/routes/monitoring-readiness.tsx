import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, DatabaseZap, ShieldAlert, Waves } from "lucide-react";

import { routeHead } from "@/components/orca/RouteShell";
import {
  EvidenceBadge,
  Panel,
  PanelBody,
  PanelError,
  PanelHeader,
  PanelSkeleton,
} from "@/components/orca/primitives";
import { useHydrated } from "@/hooks/use-hydrated";
import { monitoringReadinessQuery } from "@/lib/orca/monitoring";

export const Route = createFileRoute("/monitoring-readiness")({
  head: routeHead(
    "Monitoring Readiness — ORCA Control Tower",
    "Truthful production-drift readiness without converting historical validation into live telemetry.",
  ),
  component: MonitoringReadinessPage,
});

function StateCard({
  label,
  ready,
  note,
}: {
  label: string;
  ready: boolean;
  note: string;
}) {
  return (
    <div className="rounded-md border border-hairline bg-surface-sunken p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="orca-label text-[10px]">{label}</p>
        {ready ? (
          <CheckCircle2 className="size-4 text-success" aria-hidden />
        ) : (
          <AlertTriangle className="size-4 text-warn" aria-hidden />
        )}
      </div>
      <p className="mt-1 text-sm font-semibold">{ready ? "READY" : "NOT READY"}</p>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{note}</p>
    </div>
  );
}

function MonitoringReadinessPage() {
  const hydrated = useHydrated();
  const readiness = useQuery({ ...monitoringReadinessQuery(), enabled: hydrated });

  if (!hydrated || readiness.isPending) {
    return (
      <div className="space-y-3 p-3 lg:p-4">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">Monitoring Readiness</h1>
          <p className="text-xs text-muted-foreground">Checking drift-engine and evidence readiness…</p>
        </header>
        <Panel>
          <PanelBody>
            <PanelSkeleton rows={8} />
          </PanelBody>
        </Panel>
      </div>
    );
  }

  if (readiness.isError) {
    return (
      <div className="space-y-3 p-3 lg:p-4">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">Monitoring Readiness</h1>
          <p className="text-xs text-muted-foreground">
            No fixture or holdout substitute is used for production-monitoring status.
          </p>
        </header>
        <Panel>
          <PanelBody className="min-h-52">
            <PanelError
              message={readiness.error instanceof Error ? readiness.error.message : "Status unavailable."}
              onRetry={() => void readiness.refetch()}
            />
          </PanelBody>
        </Panel>
      </div>
    );
  }

  const data = readiness.data;
  const connected = data.production_monitoring_connected;

  return (
    <div className="space-y-3 p-3 lg:p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Monitoring Readiness</h1>
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            ORCA separates a capable drift engine from a valid production-drift claim. Historical CV evaluation,
            model holdout metrics, and live production telemetry are intentionally treated as different evidence.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EvidenceBadge label={data.evidence_label} />
          <span
            className={
              connected
                ? "rounded-sm border border-success/30 bg-success/10 px-2 py-1 text-[10px] font-semibold text-success"
                : "rounded-sm border border-warn/30 bg-warn/10 px-2 py-1 text-[10px] font-semibold text-warn"
            }
          >
            {data.status}
          </span>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StateCard
          label="Drift engine"
          ready={data.drift_engine.available}
          note="Detector, metrics, policy, runner, schemas and drift configuration are present."
        />
        <StateCard
          label="Historical artifacts"
          ready={data.historical_evaluation.artifacts_available}
          note="Development-CV drift artifacts are packaged and inspectable."
        />
        <StateCard
          label="Live window"
          ready={data.live_window_connected}
          note="Versioned production reference and detection windows are connected."
        />
        <StateCard
          label="Production claim"
          ready={data.production_monitoring_connected}
          note="A versioned production drift artifact can support a live monitoring claim."
        />
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Drift capability"
            hint="Available code and statistical dimensions"
            actions={<Waves className="size-4 text-muted-foreground" aria-hidden />}
          />
          <PanelBody className="space-y-3">
            <div>
              <p className="orca-label text-[10px]">Dimensions</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.drift_engine.dimensions.map((dimension) => (
                  <span
                    key={dimension}
                    className="rounded-sm border border-hairline bg-surface-raised px-2 py-1 text-[10px] font-medium"
                  >
                    {dimension}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="orca-label text-[10px]">Methods</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.drift_engine.methods.map((method) => (
                  <span
                    key={method}
                    className="orca-num rounded-sm border border-hairline bg-surface-raised px-2 py-1 text-[10px]"
                  >
                    {method}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-hairline bg-surface-sunken p-3 text-[11px] text-muted-foreground">
              Historical runner scope: <strong className="text-foreground">{data.historical_evaluation.scope}</strong>.
              Final holdout quarantine by design: {data.historical_evaluation.final_holdout_quarantined_by_design ? "yes" : "no"}.
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Production evidence blockers"
            hint="What still prevents a live drift claim"
            actions={<ShieldAlert className="size-4 text-warn" aria-hidden />}
          />
          <PanelBody className="space-y-2">
            {data.blockers.map((blocker) => (
              <div
                key={blocker}
                className="flex gap-2 rounded-md border border-hairline bg-surface-sunken p-3 text-[11px] leading-relaxed text-muted-foreground"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
                <span>{blocker}</span>
              </div>
            ))}
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Claim boundary"
          hint="Evidence policy enforced in the UI"
          actions={<DatabaseZap className="size-4 text-model" aria-hidden />}
        />
        <PanelBody>
          <p className="text-xs leading-relaxed text-muted-foreground">{data.claim_boundary}</p>
        </PanelBody>
      </Panel>
    </div>
  );
}
