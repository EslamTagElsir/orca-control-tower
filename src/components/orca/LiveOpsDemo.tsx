/**
 * Live Operations Demo control bar + summary strip.
 *
 * Presentation only. Everything it renders is either a real model/portfolio
 * figure passed in from the Control Tower, or SYNTHETIC LIVE OPERATIONS motion
 * produced by `use-live-operations-demo`. It never mutates model output.
 *
 * The WHAT-IF cards are the one exception: their baseline is MODEL OUTPUT and
 * their scenario score is MODEL OUTPUT ON SIMULATED SCENARIO, both returned by
 * the real /predict endpoint and shown side by side.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pause, Play, RotateCcw, Square, Radio, ArrowUpRight, Cpu } from "lucide-react";

import { cn } from "@/lib/utils";
import { num, pct } from "@/lib/orca/format";
import {
  BASELINE_LABEL,
  countdownLabel,
  FAMILY_LABEL,
  LIVE_OPS_DURATION_MS,
  LIVE_OPS_PROVENANCE,
  SCENARIO_INPUT_LABEL,
  SCENARIO_RESULT_LABEL,
  type LiveOpsPhase,
  type LiveOpsSummary,
  type LiveOpsWhatIf,
  type ScenarioFamily,
} from "@/hooks/use-live-operations-demo";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

const BTN_PRIMARY =
  "inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/25";

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="min-w-[92px] flex-1 rounded-md border border-hairline bg-surface-raised px-2.5 py-1.5">
      <div className="orca-label text-[10px]">{label}</div>
      <div className={cn("orca-num text-sm font-semibold", tone)}>{num(value)}</div>
      <div className="truncate text-[10px] text-muted-foreground/70" title={hint}>
        {hint}
      </div>
    </div>
  );
}

function WhatIfCard({ item }: { item: LiveOpsWhatIf }) {
  const up = item.deltaPp >= 0;
  return (
    <div className="min-w-[220px] flex-1 rounded-md border border-model/40 bg-model/5 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <Cpu className="size-3.5 text-model" aria-hidden />
        <span className="orca-num text-[11px] font-semibold">{item.shipmentId}</span>
        <span className="truncate text-[10px] text-muted-foreground">{item.scenarioLabel}</span>
      </div>
      <div className="orca-num mt-1 flex items-center gap-1.5 text-xs">
        <span title={BASELINE_LABEL}>{pct(item.baselineRisk)}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-semibold" title={SCENARIO_RESULT_LABEL}>
          {pct(item.scenarioRisk)}
        </span>
        <span className={cn("font-semibold", up ? "text-danger" : "text-success")}>
          {up ? "+" : ""}
          {item.deltaPp.toFixed(1)} pp
        </span>
      </div>
      <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground/80">
        Baseline: {BASELINE_LABEL} · Scenario input: {SCENARIO_INPUT_LABEL} · Result:{" "}
        {SCENARIO_RESULT_LABEL}
      </div>
    </div>
  );
}

export function LiveOpsDemo({
  phase,
  remainingMs,
  elapsedMs,
  summary,
  runId,
  mix,
  whatIfs,
  whatIfsPlanned,
  castSize,
  fixtureMode,
  onStart,
  onPause,
  onResume,
  onStop,
  onRestart,
}: {
  phase: LiveOpsPhase;
  remainingMs: number;
  elapsedMs: number;
  summary: LiveOpsSummary;
  runId: string | null;
  mix: { family: ScenarioFamily; count: number }[];
  whatIfs: LiveOpsWhatIf[];
  whatIfsPlanned: number;
  castSize: number;
  fixtureMode: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRestart: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const active = phase === "running" || phase === "paused";
  const progressPct = Math.min(100, (elapsedMs / LIVE_OPS_DURATION_MS) * 100);
  const evaluated = summary.scenarios_evaluated;

  return (
    <section
      aria-label="Live operations demo"
      className="rounded-lg border border-hairline bg-surface px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Radio
            className={cn(
              "size-4",
              phase === "running" ? "text-success" : "text-muted-foreground",
              phase === "running" && !reducedMotion ? "animate-pulse" : "",
            )}
            aria-hidden
          />
          <span className="text-xs font-semibold tracking-wide">
            {phase === "complete" ? "DEMO COMPLETE" : "LIVE OPERATIONS DEMO"}
          </span>
          <span className="rounded-sm border border-hairline bg-surface-raised px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Randomized operational scenario
          </span>
          {runId && phase !== "idle" ? (
            <span
              className="orca-num rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
              title="Run seed — this run is reproducible from this ID"
            >
              {runId}
            </span>
          ) : null}
          {active ? (
            <span
              role="timer"
              aria-live="off"
              className="orca-num rounded-sm border border-hairline bg-surface-raised px-1.5 py-0.5 text-xs font-semibold"
            >
              {countdownLabel(remainingMs)}
            </span>
          ) : null}
          {phase === "paused" ? (
            <span className="rounded-sm border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
              PAUSED
            </span>
          ) : null}
        </div>

        <span className="hidden min-w-0 flex-1 truncate text-[10px] text-muted-foreground/80 xl:inline">
          {LIVE_OPS_PROVENANCE} — statuses, positions, ETA drift and events below are simulated
          operational motion. Risk, severity, SHAP and recommendations stay untouched model output.
        </span>

        <div className="flex flex-wrap items-center gap-1.5">
          {phase === "idle" ? (
            <button type="button" className={BTN_PRIMARY} onClick={onStart}>
              <Play className="size-3.5" aria-hidden />
              Start 5-Minute Live Demo
            </button>
          ) : null}
          {phase === "running" ? (
            <button type="button" className={BTN} onClick={onPause}>
              <Pause className="size-3.5" aria-hidden />
              Pause
            </button>
          ) : null}
          {phase === "paused" ? (
            <button type="button" className={BTN} onClick={onResume}>
              <Play className="size-3.5" aria-hidden />
              Resume
            </button>
          ) : null}
          {active ? (
            <button type="button" className={BTN} onClick={onStop}>
              <Square className="size-3.5" aria-hidden />
              Stop
            </button>
          ) : null}
          {phase !== "idle" ? (
            <button type="button" className={BTN} onClick={onRestart} title="New randomized run">
              <RotateCcw className="size-3.5" aria-hidden />
              New Run
            </button>
          ) : null}
          <Link to="/exceptions" className={BTN}>
            <ArrowUpRight className="size-3.5" aria-hidden />
            Open Exceptions
          </Link>
        </div>
      </div>

      {phase !== "idle" ? (
        <>
          <div
            className="mt-2 h-1 overflow-hidden rounded-full bg-surface-raised"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPct)}
          >
            <div
              className={cn(
                "h-full rounded-full bg-primary",
                reducedMotion ? "" : "transition-all",
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {mix.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="orca-label text-[10px]">Scenario mix</span>
              <span className="text-[10px] text-muted-foreground/70">
                {castSize} shipments in this run ·
              </span>
              {mix.map((m) => (
                <span
                  key={m.family}
                  className="rounded-sm border border-hairline bg-surface-raised px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {FAMILY_LABEL[m.family]} ×{m.count}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-2">
            <Metric label="Active" value={summary.active} hint="Shipments in this view" />
            <Metric
              label="In transit"
              value={summary.in_transit}
              hint={LIVE_OPS_PROVENANCE}
              tone="text-chart-6"
            />
            <Metric
              label="At risk"
              value={summary.at_risk}
              hint="Model risk ≥ 0.30"
              tone="text-warn"
            />
            <Metric
              label="Delivered"
              value={summary.delivered}
              hint={LIVE_OPS_PROVENANCE}
              tone="text-success"
            />
            <Metric
              label="Critical"
              value={summary.critical}
              hint="Model risk > 0.85"
              tone="text-danger"
            />
            <Metric
              label="Open exceptions"
              value={summary.open_exceptions}
              hint={LIVE_OPS_PROVENANCE}
              tone="text-warn"
            />
            <Metric label="Events processed" value={summary.events_processed} hint="This run" />
          </div>

          {whatIfs.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {whatIfs.map((w) => (
                <WhatIfCard key={`${w.shipmentId}-${w.at}`} item={w} />
              ))}
            </div>
          ) : null}

          {phase === "complete" ? (
            <p className="mt-2 rounded-md border border-hairline bg-surface-raised px-2.5 py-1.5 text-[11px] text-muted-foreground">
              Run {runId} complete — {num(summary.events_processed)} synthetic operational events
              processed over 5 minutes. {num(summary.delivered)} delivered,{" "}
              {num(summary.in_transit)} still in transit, {num(summary.open_exceptions)} exception
              {summary.open_exceptions === 1 ? "" : "s"} still open, {num(summary.at_risk)} carrying
              model risk ≥ 0.30.{" "}
              {summary.scenarios_evaluated > 0
                ? `${num(summary.scenarios_evaluated)} model what-if scenario${summary.scenarios_evaluated === 1 ? "" : "s"} evaluated via /predict${
                    summary.biggest_delta_pp !== null
                      ? `, largest scenario risk delta ${summary.biggest_delta_pp.toFixed(1)} pp`
                      : ""
                  }.`
                : "No model what-if scenarios were evaluated (backend unavailable)."}{" "}
              Model scores were never altered by operational motion.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
