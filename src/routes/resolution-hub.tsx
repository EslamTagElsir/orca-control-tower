import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { routeHead } from "@/components/orca/RouteShell";
import { PageFrame } from "@/components/orca/PageFrame";
import {
  EvidenceBadge,
  Panel,
  PanelBody,
  PanelEmpty,
  PanelHeader,
  RiskBadge,
} from "@/components/orca/primitives";
import { useSimulation } from "@/lib/orca/simulation/context";
import {
  HUMAN_DECISIONS,
  HUMAN_DECISION_LABEL,
  OPERATOR_ACTIONS,
  REASON_CODES,
  REASON_CODE_LABEL,
  defaultActionFor,
  interventionEffect,
  type HumanDecisionKind,
  type OperatorAction,
  type ReasonCode,
} from "@/lib/orca/simulation/intervention-policy";
import { SIM_PROVENANCE, type SimEpisode } from "@/lib/orca/simulation/types";
import { pct } from "@/lib/orca/format";
import type { DataSource } from "@/lib/orca/types";

export const Route = createFileRoute("/resolution-hub")({
  head: routeHead(
    "Resolution Hub — ORCA Control Tower",
    "Review open ORCA decision episodes, record approve/modify/reject/defer decisions with reason codes, and audit every human intervention against the running operational twin.",
  ),
  component: ResolutionHubPage,
});

const SELECT_CLS =
  "w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary";

function ResolutionHubPage() {
  const { snapshot, isActive, submitDecision } = useSimulation();

  const pending = useMemo(
    () => snapshot.episodes.filter((e) => e.status === "PENDING"),
    [snapshot.episodes],
  );
  const resolved = useMemo(
    () => snapshot.episodes.filter((e) => e.status === "RESOLVED").slice(0, 40),
    [snapshot.episodes],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    pending.find((e) => e.id === selectedId) ?? pending[0] ?? null;

  const source: DataSource = snapshot.modelOnline === false ? "fixture" : "live";

  return (
    <PageFrame
      title="Resolution Hub"
      subtitle={`${pending.length} open decision episode${pending.length === 1 ? "" : "s"} · ${snapshot.metrics.decisionsRecorded} decisions recorded · ${snapshot.metrics.interventionsApplied} interventions applied`}
      source={source}
      actions={
        <>
          <EvidenceBadge label={SIM_PROVENANCE.model} />
          <EvidenceBadge label={SIM_PROVENANCE.humanDecision} />
        </>
      }
    >
      {!isActive ? (
        <Panel>
          <PanelBody>
            <PanelEmpty message="Start the Operational Digital Twin from the simulation bar to generate decision episodes." />
          </PanelBody>
        </Panel>
      ) : (
        <div className="grid gap-3 xl:grid-cols-3">
          <Panel className="xl:col-span-1">
            <PanelHeader
              title="Pending episodes"
              hint="Shipment holds until a human decision is recorded"
            />
            <PanelBody className="max-h-[calc(100vh-18rem)] space-y-1.5 overflow-y-auto">
              {pending.length === 0 ? (
                <PanelEmpty message="No episode is waiting on a human decision." />
              ) : (
                pending.map((ep) => (
                  <button
                    key={ep.id}
                    type="button"
                    onClick={() => setSelectedId(ep.id)}
                    className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
                      selected?.id === ep.id
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs">{ep.shipmentId}</span>
                      <RiskBadge tier={ep.tierAtOpen} />
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">{ep.route}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      ORCA recommends <span className="text-foreground">{ep.recommendedAction}</span>
                      {ep.riskAtOpen !== null ? ` · ${pct(ep.riskAtOpen)}` : ""}
                    </p>
                  </button>
                ))
              )}
            </PanelBody>
          </Panel>

          <div className="space-y-3 xl:col-span-2">
            {selected ? (
              <DecisionForm key={selected.id} episode={selected} onSubmit={submitDecision} />
            ) : (
              <Panel>
                <PanelBody>
                  <PanelEmpty message="Select a pending episode to record a decision." />
                </PanelBody>
              </Panel>
            )}

            <Panel>
              <PanelHeader
                title="Decision audit trail"
                hint="Append-only · human decisions recorded against the synthetic simulation"
              />
              <PanelBody className="max-h-[22rem] space-y-1.5 overflow-y-auto">
                {resolved.length === 0 ? (
                  <PanelEmpty message="No decisions recorded in this run yet." />
                ) : (
                  resolved.map((ep) => (
                    <div
                      key={ep.id}
                      className="rounded-md border border-border bg-card px-2.5 py-2 text-[11px]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs">{ep.shipmentId}</span>
                        <span className="rounded border border-border px-1.5 py-0.5 uppercase tracking-wide">
                          {ep.decision?.kind}
                        </span>
                        <span className="text-muted-foreground">
                          ORCA {ep.recommendedAction} → chosen {ep.decision?.chosenAction}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {ep.decision ? REASON_CODE_LABEL[ep.decision.reasonCode] : ""} ·{" "}
                        {ep.decision?.actorLabel} · {Math.round((ep.decision?.latencyMs ?? 0) / 1000)}s
                        latency
                      </p>
                      {ep.decision?.note ? (
                        <p className="mt-1 text-muted-foreground">Note: {ep.decision.note}</p>
                      ) : null}
                      {ep.interventionAudit.length > 0 ? (
                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                          {ep.interventionAudit.map((a) => (
                            <li key={a} className="font-mono">
                              {a}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))
                )}
              </PanelBody>
            </Panel>
          </div>
        </div>
      )}
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
  const [decision, setDecision] = useState<HumanDecisionKind>("APPROVE");
  const [chosenAction, setChosenAction] = useState<OperatorAction>(recommendedAction);
  const [reasonCode, setReasonCode] = useState<ReasonCode>("MODEL_AGREES_WITH_OPS");
  const [note, setNote] = useState("");
  const [actorLabel, setActorLabel] = useState("OP");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChosenAction(
      decision === "APPROVE"
        ? recommendedAction
        : decision === "REJECT"
          ? "NO_ACTION"
          : decision === "DEFER"
            ? "MONITOR"
            : recommendedAction,
    );
  }, [decision, recommendedAction]);

  const effect = interventionEffect(chosenAction);

  return (
    <Panel>
      <PanelHeader
        title={`Decision episode · ${episode.shipmentId}`}
        hint="ORCA inference and recommendation shown verbatim"
      />
      <PanelBody className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <Stat label="Risk at open" value={episode.riskAtOpen !== null ? pct(episode.riskAtOpen) : "UNSCORED"} />
          <Stat label="Tier" value={episode.tierAtOpen} />
          <Stat
            label="Severity p50"
            value={episode.severityAtOpen !== null ? `${episode.severityAtOpen.toFixed(1)} h` : "—"}
          />
          <Stat label="Model" value={episode.modelVersion ?? "—"} />
        </div>

        <div className="rounded-md border border-border bg-card p-2.5">
          <p className="text-xs">
            ORCA recommendation:{" "}
            <span className="font-semibold text-foreground">{episode.recommendedAction}</span>
            {episode.backendApprovalRequired ? " · human approval required" : ""}
          </p>
          {episode.reasons.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
              {episode.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Decision">
            <select
              className={SELECT_CLS}
              value={decision}
              onChange={(e) => setDecision(e.target.value as HumanDecisionKind)}
            >
              {HUMAN_DECISIONS.map((d) => (
                <option key={d} value={d}>
                  {HUMAN_DECISION_LABEL[d]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Chosen action">
            <select
              className={SELECT_CLS}
              value={chosenAction}
              disabled={decision !== "MODIFY"}
              onChange={(e) => setChosenAction(e.target.value as OperatorAction)}
            >
              {OPERATOR_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason code">
            <select
              className={SELECT_CLS}
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as ReasonCode)}
            >
              {REASON_CODES.map((r) => (
                <option key={r} value={r}>
                  {REASON_CODE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Operator">
            <input
              className={SELECT_CLS}
              value={actorLabel}
              maxLength={24}
              onChange={(e) => setActorLabel(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Note (optional)">
          <textarea
            className={`${SELECT_CLS} min-h-[3.5rem]`}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Operational context behind this decision"
          />
        </Field>

        <p className="rounded-md border border-border bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
          Simulated effect · {effect.label}: {effect.description}
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
          Record decision & release shipment
        </button>
      </PanelBody>
    </Panel>
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
