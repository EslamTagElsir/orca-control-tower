import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { PageFrame } from "@/components/orca/PageFrame";
import {
  EvidenceBadge,
  Panel,
  PanelBody,
  PanelEmpty,
  PanelHeader,
  RiskBadge,
} from "@/components/orca/primitives";
import { routeHead } from "@/components/orca/RouteShell";
import { pct } from "@/lib/orca/format";
import { useSimulation } from "@/lib/orca/simulation/context";
import {
  HUMAN_DECISIONS,
  HUMAN_DECISION_LABEL,
  OPERATOR_ACTIONS,
  REASON_CODES,
  REASON_CODE_LABEL,
  defaultActionFor,
  interventionEffect,
  type CurrentHumanDecisionKind,
  type HumanDecisionKind,
  type OperatorAction,
  type ReasonCode,
} from "@/lib/orca/simulation/intervention-policy";
import { SIM_PROVENANCE, type SimEpisode } from "@/lib/orca/simulation/types";
import type { DataSource } from "@/lib/orca/types";

export const Route = createFileRoute("/resolution-hub")({
  head: routeHead(
    "Resolution Hub — ORCA Control Tower",
    "Review ORCA decision episodes, record ACCEPT / MODIFY / REJECT decisions, and audit human interventions against the synthetic operational twin.",
  ),
  component: ResolutionHubPage,
});

const SELECT_CLS =
  "w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary";

type LearningStatus = "connected" | "degraded" | "unavailable";
type EpisodeStatus =
  "AWAITING_HUMAN_DECISION" | "DECIDED" | "INTERVENTION_APPLIED" | "OUTCOME_RECORDED";

type PersistedAuditRow = {
  episodeId: string;
  runId: string;
  shipmentId: string;
  triggerEventId: string | null;
  openedAt: string;
  openedSimMs: number;
  status: EpisodeStatus;
  inference: null | {
    probability_late: number;
    risk_tier: string;
    severity_p50: number;
    model_version: string;
    evidence_label: string;
  };
  recommendation: null | {
    recommendation: string;
    decision_reason: unknown;
    expected_impact_type: string;
    robustness: string;
    backend_human_approval_required: boolean;
    evidence_label: string;
  };
  decision: null | {
    decision: string;
    recommended_action: string;
    chosen_action: string;
    reason_code: string;
    note: string | null;
    actor_label: string;
    decision_latency_ms: number;
    provenance: string;
  };
  intervention: null | {
    action: string;
    simulator_policy_version: string;
    provenance: string;
  };
  outcome: null | {
    delivered_on_time: boolean;
    simulated_delay_hours: number;
    final_eta_variance_hours: number;
    intervention_count: number;
    provenance: string;
  };
};

type AuditSummary = {
  awaitingHumanDecision: number;
  decided: number;
  interventionApplied: number;
  outcomeRecorded: number;
};

type PersistedAuditResponse = {
  status: "connected";
  summary: AuditSummary;
  rows: PersistedAuditRow[];
};

type AuditErrorResponse = {
  status?: string;
  detail?: string;
  error?: string;
};

const EMPTY_SUMMARY: AuditSummary = {
  awaitingHumanDecision: 0,
  decided: 0,
  interventionApplied: 0,
  outcomeRecorded: 0,
};

function isAuditResponse(value: unknown): value is PersistedAuditResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PersistedAuditResponse>;
  return candidate.status === "connected" && Array.isArray(candidate.rows) && !!candidate.summary;
}

function errorDetail(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as AuditErrorResponse;
  return candidate.detail ?? candidate.error ?? fallback;
}

function ResolutionHubPage() {
  const { snapshot, isActive, submitDecision } = useSimulation();
  const [learningStatus, setLearningStatus] = useState<LearningStatus>("degraded");
  const [learningError, setLearningError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<PersistedAuditResponse>({
    status: "connected",
    summary: EMPTY_SUMMARY,
    rows: [],
  });

  const refreshAudit = useCallback(async () => {
    try {
      const query = snapshot.runId
        ? `?runId=${encodeURIComponent(snapshot.runId)}&limit=60`
        : "?limit=60";
      const response = await fetch(`/api/learning-audit${query}`, {
        headers: { accept: "application/json" },
      });
      const body: unknown = await response.json();
      if (!response.ok || !isAuditResponse(body)) {
        throw new Error(errorDetail(body, `Learning DB read failed (${response.status})`));
      }
      setPersisted(body);
      setLearningStatus("connected");
      setLearningError(null);
    } catch (error) {
      setLearningStatus((current) => (current === "connected" ? "degraded" : "unavailable"));
      setLearningError(error instanceof Error ? error.message : "Learning DB unavailable");
    }
  }, [snapshot.runId]);

  useEffect(() => {
    void refreshAudit();
    const timer = window.setInterval(() => void refreshAudit(), 10_000);
    return () => window.clearInterval(timer);
  }, [refreshAudit]);

  const pending = useMemo(
    () => snapshot.episodes.filter((episode) => episode.status === "PENDING"),
    [snapshot.episodes],
  );
  const resolved = useMemo(
    () => snapshot.episodes.filter((episode) => episode.status === "RESOLVED").slice(0, 40),
    [snapshot.episodes],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pending.find((episode) => episode.id === selectedId) ?? pending[0] ?? null;
  const source: DataSource = snapshot.modelOnline === false ? "fixture" : "live";

  return (
    <PageFrame
      title="Resolution Hub"
      subtitle="Human decisions on ORCA recommendations inside the synthetic Operational Digital Twin"
      source={source}
      actions={
        <>
          <LearningDbBadge status={learningStatus} error={learningError} />
          <EvidenceBadge label={SIM_PROVENANCE.model} />
          <EvidenceBadge label={SIM_PROVENANCE.humanDecision} />
        </>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <HubKpi
          label="Awaiting Human Decision"
          value={persisted.summary.awaitingHumanDecision || pending.length}
        />
        <HubKpi label="Decided" value={persisted.summary.decided || resolved.length} />
        <HubKpi
          label="Intervention Applied"
          value={persisted.summary.interventionApplied || snapshot.metrics.interventionsApplied}
        />
        <HubKpi label="Outcome Recorded" value={persisted.summary.outcomeRecorded} />
      </div>

      <Panel>
        <PanelHeader
          title="Learning Readiness"
          hint="Collection only — no automatic retraining is enabled"
          actions={
            <button
              type="button"
              onClick={() => void refreshAudit()}
              className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Refresh audit
            </button>
          }
        />
        <PanelBody className="text-xs text-muted-foreground">
          {persisted.rows.length} persisted decision episode{persisted.rows.length === 1 ? "" : "s"}{" "}
          loaded · {persisted.summary.outcomeRecorded} synthetic outcome
          {persisted.summary.outcomeRecorded === 1 ? "" : "s"} recorded. These records support later
          learning analysis; the model does not retrain itself.
        </PanelBody>
      </Panel>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-1">
          <PanelHeader
            title="Awaiting human decision"
            hint={
              isActive
                ? "No intervention is applied until an operator responds"
                : "Start a new Digital Twin run to create new live episodes"
            }
          />
          <PanelBody className="max-h-[calc(100vh-20rem)] space-y-1.5 overflow-y-auto">
            {pending.length === 0 ? (
              <PanelEmpty
                message={
                  isActive
                    ? "No current recommendation is waiting on a human decision."
                    : "No active simulation decision is waiting. Persisted history remains below."
                }
              />
            ) : (
              pending.map((episode) => (
                <button
                  key={episode.id}
                  type="button"
                  onClick={() => setSelectedId(episode.id)}
                  className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
                    selected?.id === episode.id
                      ? "border-primary/60 bg-primary/10"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs">{episode.shipmentId}</span>
                    <RiskBadge tier={episode.tierAtOpen} />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{episode.route}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    ORCA recommends{" "}
                    <span className="text-foreground">{episode.recommendedAction}</span>
                    {episode.riskAtOpen !== null ? ` · ${pct(episode.riskAtOpen)}` : ""}
                  </p>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-warn">
                    Human decision required
                  </p>
                </button>
              ))
            )}
          </PanelBody>
        </Panel>

        <div className="space-y-3 xl:col-span-2">
          {selected ? (
            <DecisionForm
              key={selected.id}
              episode={selected}
              onSubmit={(input) => {
                const result = submitDecision(input);
                if (result.ok) window.setTimeout(() => void refreshAudit(), 1_500);
                return result;
              }}
            />
          ) : (
            <Panel>
              <PanelBody>
                <PanelEmpty message="Select an active pending episode to record ACCEPT, MODIFY, or REJECT." />
              </PanelBody>
            </Panel>
          )}

          <Panel>
            <PanelHeader
              title="Current-run decision audit"
              hint="In-memory view · persisted audit is shown below"
            />
            <PanelBody className="max-h-[18rem] space-y-1.5 overflow-y-auto">
              {resolved.length === 0 ? (
                <PanelEmpty message="No decision has been recorded in the current run yet." />
              ) : (
                resolved.map((episode) => (
                  <CurrentDecisionCard key={episode.id} episode={episode} />
                ))
              )}
            </PanelBody>
          </Panel>
        </div>
      </div>

      <Panel>
        <PanelHeader
          title="Persisted evidence timeline"
          hint="Server-side Learning DB audit · survives browser refresh"
        />
        <PanelBody className="space-y-2">
          {persisted.rows.length === 0 ? (
            <PanelEmpty
              message={
                learningStatus === "connected"
                  ? "No persisted decision episodes found for this scope yet."
                  : "Learning DB audit is unavailable; the ORCA model and simulation can continue independently."
              }
            />
          ) : (
            persisted.rows.map((row) => <PersistedEpisodeCard key={row.episodeId} row={row} />)
          )}
        </PanelBody>
      </Panel>
    </PageFrame>
  );
}

function DecisionForm({
  episode,
  onSubmit,
}: {
  episode: SimEpisode;
  onSubmit: (input: {
    episodeId: string;
    decision: HumanDecisionKind;
    chosenAction: OperatorAction;
    reasonCode: ReasonCode;
    note?: string | null;
    actorLabel?: string;
  }) => { ok: boolean; reason?: string };
}) {
  const recommendedAction = defaultActionFor(episode.recommendedAction);
  const modifyOptions = useMemo(
    () =>
      OPERATOR_ACTIONS.filter((action) => action !== recommendedAction && action !== "INTERVENE"),
    [recommendedAction],
  );
  const [decision, setDecision] = useState<CurrentHumanDecisionKind>("ACCEPT");
  const [chosenAction, setChosenAction] = useState<OperatorAction>(recommendedAction);
  const [reasonCode, setReasonCode] = useState<ReasonCode>("OTHER");
  const [note, setNote] = useState("");
  const [actorLabel, setActorLabel] = useState("OP");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (decision === "ACCEPT") setChosenAction(recommendedAction);
    else if (decision === "REJECT") setChosenAction("NO_ACTION");
    else if (chosenAction === recommendedAction) setChosenAction(modifyOptions[0] ?? "NO_ACTION");
  }, [decision, recommendedAction, modifyOptions, chosenAction]);

  const effect = interventionEffect(chosenAction);

  return (
    <Panel>
      <PanelHeader
        title={`Decision episode · ${episode.shipmentId}`}
        hint="ORCA inference and recommendation are shown verbatim; intervention effects are synthetic"
      />
      <PanelBody className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <Stat
            label="Risk at open"
            value={episode.riskAtOpen !== null ? pct(episode.riskAtOpen) : "UNSCORED"}
          />
          <Stat label="Tier" value={episode.tierAtOpen} />
          <Stat
            label="Severity p50"
            value={episode.severityAtOpen !== null ? `${episode.severityAtOpen.toFixed(1)} h` : "—"}
          />
          <Stat label="Model" value={episode.modelVersion ?? "—"} />
        </div>

        <div className="rounded-md border border-border bg-card p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <EvidenceBadge label={SIM_PROVENANCE.model} />
            <span className="text-xs">
              ORCA recommendation: <strong>{episode.recommendedAction}</strong>
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Backend human approval flag: {episode.backendApprovalRequired ? "true" : "false"} ·
            Learning Simulation Mode still requires a human response for every recommendation.
          </p>
          {episode.reasons.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
              {episode.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <Field label="Human decision">
          <div className="grid gap-2 sm:grid-cols-3">
            {HUMAN_DECISIONS.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setDecision(choice)}
                className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                  decision === choice
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {choice}
                <span className="mt-0.5 block text-[10px] font-normal normal-case">
                  {HUMAN_DECISION_LABEL[choice]}
                </span>
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Chosen action">
            {decision === "MODIFY" ? (
              <select
                className={SELECT_CLS}
                value={chosenAction}
                onChange={(event) => setChosenAction(event.target.value as OperatorAction)}
              >
                {modifyOptions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            ) : (
              <div className={`${SELECT_CLS} min-h-8 font-mono`}>{chosenAction}</div>
            )}
          </Field>
          <Field label="Reason code">
            <select
              className={SELECT_CLS}
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value as ReasonCode)}
            >
              {REASON_CODES.map((reason) => (
                <option key={reason} value={reason}>
                  {REASON_CODE_LABEL[reason]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Operator">
            <input
              className={SELECT_CLS}
              value={actorLabel}
              maxLength={24}
              onChange={(event) => setActorLabel(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Note (optional)">
          <textarea
            className={`${SELECT_CLS} min-h-[3.5rem]`}
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Operational context behind this decision"
          />
        </Field>

        <p className="rounded-md border border-border bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
          SIMULATED SCENARIO effect · {effect.label}: {effect.description}. This effect never sets
          model risk/tier/severity directly; feature-changing actions are re-scored through ORCA
          /predict.
        </p>

        {error ? <p className="text-[11px] text-danger">{error}</p> : null}

        <button
          type="button"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          onClick={() => {
            const result = onSubmit({
              episodeId: episode.id,
              decision,
              chosenAction,
              reasonCode,
              note: note.trim() ? note.trim() : null,
              actorLabel,
            });
            setError(result.ok ? null : (result.reason ?? "Decision could not be recorded."));
            if (result.ok) setNote("");
          }}
        >
          Record {decision} & release shipment
        </button>
      </PanelBody>
    </Panel>
  );
}

function CurrentDecisionCard({ episode }: { episode: SimEpisode }) {
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs">{episode.shipmentId}</span>
        <span className="rounded border border-border px-1.5 py-0.5 uppercase tracking-wide">
          {episode.decision?.kind}
        </span>
        <span className="text-muted-foreground">
          ORCA {episode.recommendedAction} → chosen {episode.decision?.chosenAction}
        </span>
      </div>
      <p className="mt-1 text-muted-foreground">
        {episode.decision ? String(episode.decision.reasonCode) : ""} ·{" "}
        {episode.decision?.actorLabel} · {Math.round((episode.decision?.latencyMs ?? 0) / 1000)}s
        latency
      </p>
      {episode.decision?.note ? (
        <p className="mt-1 text-muted-foreground">Note: {episode.decision.note}</p>
      ) : null}
      {episode.interventionAudit.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          {episode.interventionAudit.map((audit) => (
            <li key={audit} className="font-mono">
              {audit}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PersistedEpisodeCard({ row }: { row: PersistedAuditRow }) {
  const reasons = Array.isArray(row.recommendation?.decision_reason)
    ? row.recommendation.decision_reason.map(String)
    : [];
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold">{row.shipmentId}</span>
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px]">
          {row.runId}
        </span>
        <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold">
          {row.status}
        </span>
        {row.inference?.evidence_label ? (
          <EvidenceBadge label={row.inference.evidence_label} />
        ) : null}
      </div>
      <div className="mt-2 grid gap-1 text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
        <span>Risk: {row.inference ? pct(row.inference.probability_late) : "—"}</span>
        <span>Tier: {row.inference?.risk_tier ?? "—"}</span>
        <span>Recommendation: {row.recommendation?.recommendation ?? "—"}</span>
        <span>Robustness: {row.recommendation?.robustness ?? "—"}</span>
      </div>
      {reasons.length > 0 ? (
        <p className="mt-1 text-muted-foreground">Reasons: {reasons.join(" · ")}</p>
      ) : null}
      {row.recommendation ? (
        <p className="mt-1 text-muted-foreground">
          Backend human approval flag:{" "}
          {row.recommendation.backend_human_approval_required ? "true" : "false"}
        </p>
      ) : null}
      {row.decision ? (
        <p className="mt-1">
          Human decision: <strong>{row.decision.decision}</strong> · chosen{" "}
          {row.decision.chosen_action} · {row.decision.reason_code} ·{" "}
          {Math.round(row.decision.decision_latency_ms / 1000)}s · {row.decision.actor_label}
        </p>
      ) : null}
      {row.decision?.note ? (
        <p className="mt-1 text-muted-foreground">Note: {row.decision.note}</p>
      ) : null}
      {row.intervention ? (
        <p className="mt-1 text-muted-foreground">
          Intervention: {row.intervention.action} · {row.intervention.simulator_policy_version} ·{" "}
          {row.intervention.provenance}
        </p>
      ) : null}
      {row.outcome ? (
        <p className="mt-1 text-muted-foreground">
          Outcome: {row.outcome.delivered_on_time ? "on-time" : "delayed"} · simulated delay{" "}
          {row.outcome.simulated_delay_hours.toFixed(1)} h · {row.outcome.provenance}
        </p>
      ) : null}
      <p className="mt-1 text-[10px] text-muted-foreground/70">
        Opened {new Date(row.openedAt).toLocaleString()} · trigger{" "}
        {row.triggerEventId ?? "initial state"}
      </p>
    </div>
  );
}

function LearningDbBadge({ status, error }: { status: LearningStatus; error: string | null }) {
  const className =
    status === "connected"
      ? "border-success/40 bg-success/10 text-success"
      : status === "degraded"
        ? "border-warn/40 bg-warn/10 text-warn"
        : "border-danger/40 bg-danger/10 text-danger";
  return (
    <span
      title={error ?? "Learning persistence health is separate from ORCA model health."}
      className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold ${className}`}
    >
      Learning DB · {status}
    </span>
  );
}

function HubKpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-lg font-semibold">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}
