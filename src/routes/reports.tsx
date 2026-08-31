import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FileJson, FileText, ShieldCheck } from "lucide-react";

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
import { reliabilityQuery, type ReliabilityResponse } from "@/lib/orca/reliability";

export const Route = createFileRoute("/reports")({
  head: routeHead(
    "Reports — ORCA Control Tower",
    "Export ORCA evidence packs with provenance and model version preserved verbatim.",
  ),
  component: ReportsPage,
});

function pct(value: number | undefined, digits = 1): string {
  return value === undefined ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | undefined, digits = 3): string {
  return value === undefined ? "—" : value.toFixed(digits);
}

function safeFilePart(value: string | null | undefined): string {
  return (value || "unknown-model").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function asMarkdown(data: ReliabilityResponse): string {
  const cls = data.classification;
  const cqr = data.severity_cqr;
  const split = data.splits;

  return [
    "# ORCA Model Evidence Pack",
    "",
    "> Frozen model-registry evaluation evidence. This is not live production telemetry and does not re-run model evaluation.",
    "",
    "## Provenance",
    `- Model version: ${data.model_version ?? "—"}`,
    `- Prediction contract: ${data.prediction_contract_version ?? "—"}`,
    `- Registry role: ${data.registry_role ?? "—"}`,
    `- Evidence label: ${data.evidence_label ?? "—"}`,
    `- Registry created UTC: ${data.created_utc ?? "—"}`,
    `- Evaluation role: ${data.evaluation_role ?? "—"}`,
    `- Evaluation data SHA-256: ${data.data_sha256 ?? "—"}`,
    "",
    "## Classification holdout evidence",
    `- ROC-AUC: ${num(cls.roc_auc)}`,
    `- PR-AUC: ${num(cls.pr_auc)}`,
    `- Brier score: ${num(cls.brier_score)}`,
    `- Decision threshold: ${num(cls.decision_threshold)}`,
    `- Precision: ${pct(cls.precision)}`,
    `- Recall: ${pct(cls.recall)}`,
    `- F1: ${pct(cls.f1)}`,
    `- Balanced accuracy: ${pct(cls.balanced_accuracy)}`,
    "",
    "## Severity uncertainty evidence",
    `- Target: ${cqr.target ?? "—"}`,
    `- Nominal CQR coverage: ${pct(cqr.nominal_coverage)}`,
    `- Empirical delayed-only coverage: ${pct(cqr.empirical_coverage_delayed_only)}`,
    `- Delayed holdout rows: ${cqr.holdout_delayed_rows ?? "—"}`,
    `- Median interval width: ${num(cqr.median_interval_width_delayed_only, 2)}`,
    `- Mean interval width: ${num(cqr.mean_interval_width_delayed_only, 2)}`,
    "",
    "## Temporal split",
    `- Train rows: ${split.train?.rows ?? "—"}; end-exclusive: ${split.train?.end_exclusive ?? "—"}`,
    `- Embargo days: ${split.embargo_days ?? "—"}`,
    `- Calibration rows: ${split.calibration?.rows ?? "—"}; ${split.calibration?.start ?? "—"} to ${split.calibration?.end_exclusive ?? "—"}`,
    `- Holdout rows: ${split.holdout?.rows ?? "—"}; ${split.holdout?.start ?? "—"} to ${split.holdout?.end ?? "—"}`,
    "",
    "## Interpretation boundary",
    "These values describe the locked serving registry and its untouched temporal holdout. They must not be represented as live drift, live SLA, or current production performance without a separate production-monitoring evidence source.",
    "",
  ].join("\n");
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline/70 py-2 last:border-b-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="orca-num max-w-[65%] break-all text-right text-[11px] font-medium">{value}</span>
    </div>
  );
}

function ReportsPage() {
  const hydrated = useHydrated();
  const reliability = useQuery({ ...reliabilityQuery(), enabled: hydrated });

  if (!hydrated || reliability.isPending) {
    return (
      <div className="space-y-3 p-3 lg:p-4">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">Reports & Evidence Pack</h1>
          <p className="text-xs text-muted-foreground">Loading locked model-registry evidence…</p>
        </header>
        <Panel>
          <PanelBody>
            <PanelSkeleton rows={8} />
          </PanelBody>
        </Panel>
      </div>
    );
  }

  if (reliability.isError) {
    return (
      <div className="space-y-3 p-3 lg:p-4">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">Reports & Evidence Pack</h1>
          <p className="text-xs text-muted-foreground">
            Evidence exports remain unavailable until the registry evidence can be loaded.
          </p>
        </header>
        <Panel>
          <PanelBody>
            <PanelError
              message={reliability.error instanceof Error ? reliability.error.message : "Unknown error"}
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
  const modelPart = safeFilePart(data.model_version);
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const markdown = asMarkdown(data);

  return (
    <div className="space-y-3 p-3 lg:p-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Reports & Evidence Pack</h1>
            {data.evidence_label ? <EvidenceBadge label={data.evidence_label} /> : null}
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Export the exact registry-backed reliability payload used by ORCA. The pack preserves model,
            contract, temporal split and evaluation provenance without converting holdout evidence into a live
            production claim.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadText(`orca-evidence-${modelPart}.json`, json, "application/json")}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-raised px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            <FileJson className="size-3.5" aria-hidden />
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => downloadText(`orca-evidence-${modelPart}.md`, markdown, "text/markdown")}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-raised px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            <FileText className="size-3.5" aria-hidden />
            Export Markdown
          </button>
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel>
          <PanelHeader
            title="Evidence pack preview"
            hint="Frozen serving-registry evidence; not a live monitoring snapshot."
            actions={<Download className="size-3.5 text-muted-foreground" aria-hidden />}
          />
          <PanelBody className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-hairline bg-surface-sunken p-3">
                <p className="orca-label text-[10px]">ROC-AUC</p>
                <p className="orca-num mt-1 text-xl font-semibold">{num(cls.roc_auc)}</p>
              </div>
              <div className="rounded-md border border-hairline bg-surface-sunken p-3">
                <p className="orca-label text-[10px]">PR-AUC</p>
                <p className="orca-num mt-1 text-xl font-semibold">{num(cls.pr_auc)}</p>
              </div>
              <div className="rounded-md border border-hairline bg-surface-sunken p-3">
                <p className="orca-label text-[10px]">Brier</p>
                <p className="orca-num mt-1 text-xl font-semibold">{num(cls.brier_score)}</p>
              </div>
              <div className="rounded-md border border-hairline bg-surface-sunken p-3">
                <p className="orca-label text-[10px]">CQR coverage</p>
                <p className="orca-num mt-1 text-xl font-semibold">
                  {pct(cqr.empirical_coverage_delayed_only)}
                </p>
              </div>
            </div>

            <div className="rounded-md border border-hairline bg-surface-sunken px-3">
              <Fact label="Model version" value={data.model_version ?? "—"} />
              <Fact label="Prediction contract" value={data.prediction_contract_version ?? "—"} />
              <Fact label="Registry role" value={data.registry_role ?? "—"} />
              <Fact label="Evaluation role" value={data.evaluation_role ?? "—"} />
              <Fact label="Data SHA-256" value={data.data_sha256 ?? "—"} />
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Evidence boundary"
            hint="What this export can and cannot support."
            actions={<ShieldCheck className="size-3.5 text-model" aria-hidden />}
          />
          <PanelBody className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <div className="rounded-md border border-model/25 bg-model/5 p-3">
              <p className="font-semibold text-foreground">Supported</p>
              <p className="mt-1">
                Reproducible reporting of the locked model registry, temporal holdout discrimination,
                calibration-oriented scores and conformal interval coverage stored with the serving artifacts.
              </p>
            </div>
            <div className="rounded-md border border-hairline bg-surface-sunken p-3">
              <p className="font-semibold text-foreground">Not supported by this pack alone</p>
              <p className="mt-1">
                Claims about current production drift, live SLA performance, causal impact after deployment, or
                future-data reliability. Those require separately versioned production evidence.
              </p>
            </div>
            <div className="rounded-md border border-hairline bg-surface-sunken p-3">
              <p className="font-semibold text-foreground">Temporal provenance</p>
              <p className="mt-1">
                Holdout: {data.splits.holdout?.start ?? "—"} → {data.splits.holdout?.end ?? "—"} · rows{" "}
                {data.splits.holdout?.rows?.toLocaleString() ?? "—"}. Embargo: {data.splits.embargo_days ?? "—"}
                days.
              </p>
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
