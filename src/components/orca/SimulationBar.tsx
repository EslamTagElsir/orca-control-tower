/**
 * Global Operational Digital Twin control bar.
 *
 * Rendered once in the AppShell so every route shares the same run controls and
 * the same status line. Presentation only: it reads the global snapshot and
 * calls engine controls — it never computes a risk value.
 */

import { useMemo } from "react";
import { Cpu, Gauge, Pause, Play, Radio, RotateCcw, Square } from "lucide-react";

import { cn } from "@/lib/utils";
import { num, pct } from "@/lib/orca/format";
import { TIER_CSS_VAR, TIER_LABEL } from "@/lib/orca/risk";
import { useSimulation } from "@/lib/orca/simulation/context";
import { formatSimElapsed, SIM_CONFIG } from "@/lib/orca/simulation/engine";
import { simKpis, simRiskDistribution } from "@/lib/orca/simulation/selectors";
import { SIM_PROVENANCE, SIM_SPEEDS } from "@/lib/orca/simulation/types";
import { useOrca } from "@/lib/orca/context";

const BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

const BTN_PRIMARY =
  "inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/25";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="orca-label text-[10px] text-muted-foreground">{label}</span>
      <span className={cn("orca-num text-xs font-semibold", tone ?? "text-foreground/90")}>
        {value}
      </span>
    </span>
  );
}

export function SimulationBar() {
  const { snapshot, isActive, start, pause, resume, stop, newRun, setSpeed } = useSimulation();
  const { modelVersion } = useOrca();
  const kpis = useMemo(() => simKpis(snapshot), [snapshot]);
  const mix = useMemo(() => simRiskDistribution(snapshot), [snapshot]);

  if (!isActive) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline bg-surface-sunken/60 px-4 py-2">
        <button onClick={start} className={BTN_PRIMARY}>
          <Play className="size-3.5" aria-hidden />
          Start Simulation
        </button>
        <p className="min-w-0 flex-1 text-[11px] leading-4 text-muted-foreground">
          Launches a continuous <strong className="font-semibold">{SIM_PROVENANCE.twin}</strong>:
          synthetic shipments are generated from real ORCA feature templates, moved along synthetic
          routes and scored by the real /predict endpoint. Routes, positions and events are
          synthetic; risk, tier and severity are model output.
        </p>
      </div>
    );
  }

  const running = snapshot.status === "running";
  const modelState =
    snapshot.modelOnline === false
      ? { cls: "border-danger/40 bg-danger/10 text-danger", text: SIM_PROVENANCE.unscored }
      : snapshot.modelOnline === true
        ? {
            cls: "border-model/30 bg-model/10 text-model",
            text: `MODEL SCORING — ORCA ${modelVersion ?? ""}`.trim(),
          }
        : { cls: "border-warn/30 bg-warn/10 text-warn", text: "AWAITING FIRST SCORE" };

  return (
    <div className="border-b border-hairline bg-surface-sunken/70">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2 py-1 text-[11px] font-semibold text-success">
          <Radio className={cn("size-3.5", running && "animate-pulse")} aria-hidden />
          {running ? "SIMULATION RUNNING" : "SIMULATION PAUSED"}
        </span>
        <span className="orca-num text-[11px] font-semibold text-foreground/90">
          {snapshot.runId}
        </span>
        <span className="orca-num text-[11px] text-muted-foreground" title="Simulated elapsed time">
          T+{formatSimElapsed(snapshot.simClockMs)}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold",
            modelState.cls,
          )}
          title="Risk, tier and severity come only from real ORCA /predict responses."
        >
          <Cpu className="size-3" aria-hidden />
          {modelState.text}
        </span>
        <span
          className="rounded-md border border-hairline bg-surface px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground"
          title="Shipment identity, routes, coordinates, progress and events are synthetic. They are not GPS, AIS or TMS telemetry."
        >
          {SIM_PROVENANCE.ops}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md border border-hairline bg-surface px-1.5 py-1">
            <Gauge className="size-3 text-muted-foreground" aria-hidden />
            {SIM_SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={cn(
                  "orca-num rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors",
                  snapshot.speed === s
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={snapshot.speed === s}
              >
                {s}x
              </button>
            ))}
          </span>
          {running ? (
            <button onClick={pause} className={BTN}>
              <Pause className="size-3.5" aria-hidden />
              Pause
            </button>
          ) : (
            <button onClick={resume} className={BTN}>
              <Play className="size-3.5" aria-hidden />
              Resume
            </button>
          )}
          <button onClick={newRun} className={BTN}>
            <RotateCcw className="size-3.5" aria-hidden />
            New Run
          </button>
          <button onClick={stop} className={BTN}>
            <Square className="size-3.5" aria-hidden />
            Stop
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline/70 px-4 py-1.5">
        <Stat label="Active" value={num(kpis.active)} />
        <Stat label="In transit" value={num(kpis.inTransit)} />
        <Stat label="Open exceptions" value={num(kpis.openExceptions)} tone="text-warn" />
        <Stat label="At risk" value={num(kpis.atRisk)} tone="text-risk-high" />
        <Stat label="Critical" value={num(kpis.critical)} tone="text-risk-critical" />
        <Stat label="Delivered (session)" value={num(kpis.deliveredSession)} tone="text-success" />
        <Stat label="Generated" value={num(snapshot.metrics.generated)} />
        <Stat
          label="Model scored"
          value={`${num(kpis.modelScored)}/${num(kpis.active)}`}
          tone="text-model"
        />
        {kpis.averageRisk !== null ? (
          <Stat label="Mean model risk" value={pct(kpis.averageRisk, 1)} tone="text-model" />
        ) : null}

        <span className="ml-auto flex flex-wrap items-center gap-2">
          {(
            [
              ["LOW_RISK", mix.low],
              ["WATCH", mix.watch],
              ["HIGH_RISK", mix.high],
              ["CRITICAL", mix.critical],
            ] as const
          ).map(([tier, count]) => (
            <span key={tier} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span
                className="size-2 rounded-full"
                style={{ background: TIER_CSS_VAR[tier] }}
                aria-hidden
              />
              {TIER_LABEL[tier]} <span className="orca-num text-foreground/80">{count}</span>
            </span>
          ))}
          {mix.unscored > 0 ? (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span
                className="size-2 rounded-full"
                style={{ background: TIER_CSS_VAR.UNSCORED }}
                aria-hidden
              />
              Unscored <span className="orca-num text-foreground/80">{mix.unscored}</span>
            </span>
          ) : null}
          <span className="orca-num text-[10px] text-muted-foreground/70">
            /predict {snapshot.metrics.predictCalls} · re-scores {snapshot.metrics.rescores} ·
            /recommend {snapshot.metrics.recommendCalls} · cap {SIM_CONFIG.maxActive}
          </span>
        </span>
      </div>
    </div>
  );
}
