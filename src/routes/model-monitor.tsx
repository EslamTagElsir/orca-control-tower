import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, CalendarClock, Gauge, ShieldCheck } from "lucide-react";

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
import { reliabilityQuery } from "@/lib/orca/reliability";

export const Route = createFileRoute("/model-monitor")({
  head: routeHead(
    "Model Reliability — ORCA Control Tower",
    "Registry-backed holdout discrimination, calibration and conformal reliability evidence.",
  ),
  component: ModelMonitorPage,
});

function pct(value: number | undefined, digits = 1): string {
  return value === undefined ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | undefined, digits = 3): string {
  return value === undefined ? "—" : value.toFixed(digits);
}

function rows(value: number | undefined): string {
  return value === undefined ? "—" : value.toLocaleString();
}

function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-md border border-hairline bg-surface-sunken px-3 py-3">
      <p className="orca-label text-[10px]">{label}</p>
      <p className="orca-num mt-1 text-xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{note}</p>
    </div>
  );
}

function ModelMonitorPage() {
  const hydrated = useHydrated();
  const reliability = useQuery({ ...reliabilityQuery(), enabled: hydrated });

  if (!hydrated || reliability.isPending) {
    return (
      <div className="space-y-3 p-3 lg:p-4">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">Model Reliability</h1>
          <p className="text-xs text-muted-foreground">Loading registry-backed validation evidence…</p>
        </header>
        <Panel>
          <PanelBody>
            <PanelSkeleton rows={7} />
          </PanelBody>
        </Panel>
      </div>
    );
  }

  if (reliability.isError) {
    return (
      <div className="space-y-3 p-3 lg:p-4">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">Model Reliability</h1>
          <p className="text-xs text-muted-foreground">
            No fixture substitute is used for model validation evidence.
          </p>
        </header>
        <Panel>
          <PanelBody className="min-h-52">
            <PanelError
              message={
                reliability.error instanceof Error
                  ? reliability.error.message
                  : "Reliability evidence is unavailable."
              }
              onRetry={() => void reliability.refetch()}
            />
          </PanelBody>
        </Panel>
      </div>
    );
  }

  const data = reliability.data;
  const cls = data.classification;
  const cqr = data.severity_cqr;
  const split = data.splits;
  const coverageGap =
    cqr.empirical_coverage_delayed_only !== undefined && cqr.nominal_coverage !== undefined
      ? cqr.empirical_coverage_delayed_only - cqr.nominal_coverage
      : undefined;

  return (
    <div className="space-y-3 p-3 lg:p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Model Reliability</h1>
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Immutable evaluation evidence loaded from the serving model registry. These are temporal
            holdout results, not live production drift telemetry and not re-computed in the browser.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EvidenceBadge label={data.evidence_label ?? "MODEL OUTPUT"} />
          <span className="orca-num rounded-sm border border-hairline bg-surface px-2 py-1 text-[10px] text-muted-foreground">
            {data.model_version ?? "unknown model"}
          </span>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="ROC-AUC"
          value={num(cls.roc_auc)}
          note="Ranking discrimination on untouched temporal holdout."
        />
        <MetricCard
          label="PR-AUC"
          value={num(cls.pr_auc)}
          note="Precision-recall performance for the delayed class."
        />
        <MetricCard
          label="Brier score"
          value={num(cls.brier_score, 4)}
          note="Probability calibration error; lower is better."
        />
        <MetricCard
          label="Decision threshold"
          value={pct(cls.decision_threshold, 1)}
          note="Frozen operating threshold used for classification."
        />
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Classification evidence"
            hint="Untouched temporal holdout"
            actions={<Activity className="size-4 text-muted-foreground" aria-hidden />}
          />
          <PanelBody className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <MetricCard label="Precision" value={pct(cls.precision)} note="Positive predictive value." />
              <MetricCard label="Recall" value={pct(cls.recall)} note="Delayed shipments recovered." />
              <MetricCard label="F1" value={num(cls.f1)} note="Precision/recall harmonic mean." />
              <MetricCard
                label="Balanced accuracy"
                value={pct(cls.balanced_accuracy)}
                note="Class-balanced correctness."
              />
              <MetricCard
                label="Holdout rows"
                value={rows(split.holdout?.rows)}
                note="Never used for fitting or calibration."
              />
              <MetricCard
                label="Embargo"
                value={split.embargo_days === undefined ? "—" : `${split.embargo_days} days`}
                note="Temporal separation before calibration."
              />
            </div>
            <div className="rounded-md border border-hairline bg-surface-sunken px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-foreground">Evaluation role:</strong>{" "}
              {data.evaluation_role ?? "No evaluation-role metadata supplied."}
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Conformal severity reliability"
            hint="Delayed-shipment CQR evidence"
            actions={<ShieldCheck className="size-4 text-muted-foreground" aria-hidden />}
          />
          <PanelBody className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MetricCard
                label="Nominal coverage"
                value={pct(cqr.nominal_coverage)}
                note="Target interval coverage."
              />
              <MetricCard
                label="Empirical coverage"
                value={pct(cqr.empirical_coverage_delayed_only)}
                note="Observed delayed-only holdout coverage."
              />
              <MetricCard
                label="Coverage gap"
                value={
                  coverageGap === undefined
                    ? "—"
                    : `${coverageGap >= 0 ? "+" : ""}${(coverageGap * 100).toFixed(1)} pp`
                }
                note="Empirical minus nominal coverage."
              />
              <MetricCard
                label="Median width"
                value={
                  cqr.median_interval_width_delayed_only === undefined
                    ? "—"
                    : `${cqr.median_interval_width_delayed_only.toFixed(1)} days`
                }
                note="Typical calibrated interval width."
              />
              <MetricCard
                label="Mean width"
                value={
                  cqr.mean_interval_width_delayed_only === undefined
                    ? "—"
                    : `${cqr.mean_interval_width_delayed_only.toFixed(1)} days`
                }
                note="Average calibrated interval width."
              />
              <MetricCard
                label="Delayed holdout"
                value={rows(cqr.holdout_delayed_rows)}
                note="Rows eligible for severity evaluation."
              />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-foreground">Target:</strong>{" "}
              {cqr.target ?? "No severity target metadata supplied."}
            </p>
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Temporal split & provenance"
          hint="Reproducibility metadata"
          actions={<CalendarClock className="size-4 text-muted-foreground" aria-hidden />}
        />
        <PanelBody>
          <div className="grid gap-3 text-[11px] md:grid-cols-3">
            <div className="rounded-md border border-hairline bg-surface-sunken p-3">
              <p className="orca-label text-[10px]">Train</p>
              <p className="orca-num mt-1">{rows(split.train?.rows)} rows</p>
              <p className="mt-1 text-muted-foreground">ends before {split.train?.end_exclusive ?? "—"}</p>
            </div>
            <div className="rounded-md border border-hairline bg-surface-sunken p-3">
              <p className="orca-label text-[10px]">Calibration</p>
              <p className="orca-num mt-1">{rows(split.calibration?.rows)} rows</p>
              <p className="mt-1 text-muted-foreground">
                {split.calibration?.start ?? "—"} → {split.calibration?.end_exclusive ?? "—"}
              </p>
            </div>
            <div className="rounded-md border border-hairline bg-surface-sunken p-3">
              <p className="orca-label text-[10px]">Holdout</p>
              <p className="orca-num mt-1">{rows(split.holdout?.rows)} rows</p>
              <p className="mt-1 text-muted-foreground">
                {split.holdout?.start ?? "—"} → {split.holdout?.end ?? "—"}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="min-w-0">
              <p className="orca-label text-[10px]">Evaluation data SHA-256</p>
              <p className="orca-num mt-1 break-all text-[10px] text-muted-foreground">
                {data.data_sha256 ?? "—"}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-hairline bg-surface-sunken px-3 py-2 text-[10px] text-muted-foreground">
              <Gauge className="size-3.5" aria-hidden />
              contract {data.prediction_contract_version ?? "—"}
            </div>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
