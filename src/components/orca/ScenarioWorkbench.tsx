import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Play, ShieldQuestion } from "lucide-react";

import { cn } from "@/lib/utils";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  runScenario,
  scenariosQuery,
  scenarioMutationKey,
  SCENARIO_DEFAULTS,
  SCENARIO_INPUT_BOUNDS,
  type ScenarioRunInput,
  type Sourced,
} from "@/lib/orca/client";
import { useOrca } from "@/lib/orca/context";
import { days, money, moneyExact, pct, pp } from "@/lib/orca/format";
import { TIER_RANGE } from "@/lib/orca/risk";
import type { ScenarioRunResponse, ShipmentRow } from "@/lib/orca/types";
import {
  DecisionBadge,
  EvidenceBadge,
  Panel,
  PanelBody,
  PanelEmpty,
  PanelError,
  PanelHeader,
  PanelSkeleton,
  RiskBadge,
  SourceBadge,
} from "./primitives";
import { ShipmentSelect } from "./ShipmentPicker";

type Assumptions = {
  delay_cost_per_day: number;
  intervention_cost: number;
  efficacy_days: number;
};

function NumberInput({
  label,
  hint,
  value,
  bounds,
  prefix,
  suffix,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  bounds: { min: number; max: number; step: number };
  prefix?: string;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const id = `assumption-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="orca-label text-[10px]">
          {label}
        </label>
        <span className="orca-num text-xs font-medium">
          {prefix}
          {value.toLocaleString("en-US")}
          {suffix}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={bounds.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-raised accent-primary"
      />
      <p className="text-[10px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-md border border-hairline bg-surface-sunken px-3 py-2">
      <div className="orca-label text-[10px]">{label}</div>
      <div
        className={cn(
          "orca-num mt-0.5 text-sm font-semibold",
          tone === "positive" && "text-success",
          tone === "negative" && "text-danger",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function ScenarioDisclaimer({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[11px] leading-snug text-warn">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">
          Simulated planning economics — not realized savings.
        </strong>{" "}
        {text}
      </span>
    </p>
  );
}

/**
 * Reusable Sense → Simulate → Decide workbench.
 *
 * The current backend has no scenario endpoint, so scenarios run through the
 * frontend what-if adapter: audited pre-outcome feature edits scored by the
 * real /predict and /recommend endpoints. Risk and severity are always model
 * output; economics remain configurable planning assumptions.
 */
export function ScenarioWorkbench({
  shipments,
  variant = "simulator",
  baselineRaw,
  baselineLabel,
}: {
  shipments: ShipmentRow[];
  variant?: "simulator" | "economics";
  /**
   * Optional baseline feature override. When the Operational Digital Twin is
   * running, the what-if must start from the shipment's CURRENT simulated
   * feature state, not the original template row.
   */
  baselineRaw?: (id: string) => Record<string, string> | undefined;
  baselineLabel?: string;
}) {
  const { seed, selectedShipmentId, setSelectedShipmentId } = useOrca();
  const hydrated = useHydrated();
  const scenarios = useQuery({ ...scenariosQuery(), enabled: hydrated });

  const [scenarioKey, setScenarioKey] = useState<string>("");
  const [assumptions, setAssumptions] = useState<Assumptions>({ ...SCENARIO_DEFAULTS });

  const options = useMemo(() => scenarios.data?.data ?? [], [scenarios.data]);
  useEffect(() => {
    const first = options[0];
    if (!scenarioKey && first) setScenarioKey(first.key);
  }, [options, scenarioKey]);

  const shipmentId = selectedShipmentId ?? shipments[0]?.id ?? null;
  const selectedShipment = useMemo(
    () => shipments.find((s) => s.id === shipmentId) ?? null,
    [shipments, shipmentId],
  );
  const activeScenario = options.find((o) => o.key === scenarioKey) ?? null;

  const mutation = useMutation<Sourced<ScenarioRunResponse>, Error, ScenarioRunInput>({
    mutationKey: scenarioMutationKey,
    mutationFn: (input) => runScenario(input),
  });

  const canRun = Boolean(shipmentId && scenarioKey) && !mutation.isPending;

  function run() {
    if (!shipmentId || !scenarioKey) return;
    const override = baselineRaw?.(shipmentId);
    mutation.mutate({
      shipment_id: shipmentId,
      scenario_key: scenarioKey,
      ...assumptions,
      ...(seed === undefined ? {} : { seed }),
      ...(override ? { baseline_raw: override, baseline_id: shipmentId } : {}),
    });
  }

  const result = mutation.data?.data ?? null;
  const resultSource = mutation.data?.source;

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      {/* ------------------------------------------------------ Controls */}
      <Panel>
        <PanelHeader
          title={variant === "economics" ? "Decision inputs" : "Scenario inputs"}
          hint="Frontend what-if adapter over POST /predict + POST /recommend"
          source={scenarios.data?.source}
        />
        <PanelBody className="space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <span className="orca-label text-[10px]">Shipment</span>
            <ShipmentSelect
              shipments={shipments}
              selectedId={shipmentId}
              onSelect={setSelectedShipmentId}
            />
            {baselineLabel ? (
              <p className="rounded-md border border-hairline bg-surface-sunken px-2 py-1 text-[10px] text-muted-foreground">
                {baselineLabel}
              </p>
            ) : null}
            {selectedShipment ? (
              <p className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px] text-muted-foreground">
                <RiskBadge tier={selectedShipment.risk_tier} value={selectedShipment.risk} />
                <span>{selectedShipment.issue}</span>
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="scenario-key" className="orca-label text-[10px]">
              Scenario
            </label>
            {scenarios.isPending ? (
              <PanelSkeleton rows={2} />
            ) : scenarios.isError ? (
              <PanelError
                message={(scenarios.error as Error).message}
                onRetry={() => scenarios.refetch()}
              />
            ) : (
              <select
                id="scenario-key"
                value={scenarioKey}
                onChange={(e) => setScenarioKey(e.target.value)}
                className="h-8 w-full rounded-md border border-hairline bg-surface-sunken px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            {activeScenario ? (
              <p className="text-[10px] leading-snug text-muted-foreground">
                {activeScenario.description}
              </p>
            ) : null}
          </div>

          <div className="space-y-3 border-t border-hairline pt-3">
            <p className="orca-label text-[10px]">Economic assumptions</p>
            <NumberInput
              label="Delay cost / day"
              hint="Operator assumption sent to ORCA — not a measured cost."
              prefix="$"
              value={assumptions.delay_cost_per_day}
              bounds={SCENARIO_INPUT_BOUNDS.delay_cost_per_day}
              onChange={(v) => setAssumptions((a) => ({ ...a, delay_cost_per_day: v }))}
            />
            <NumberInput
              label="Intervention cost"
              hint="One-off cost of acting on this shipment."
              prefix="$"
              value={assumptions.intervention_cost}
              bounds={SCENARIO_INPUT_BOUNDS.intervention_cost}
              onChange={(v) => setAssumptions((a) => ({ ...a, intervention_cost: v }))}
            />
            <NumberInput
              label="Efficacy"
              hint="Assumed delay days avoided if the intervention works."
              suffix=" d"
              value={assumptions.efficacy_days}
              bounds={SCENARIO_INPUT_BOUNDS.efficacy_days}
              onChange={(v) => setAssumptions((a) => ({ ...a, efficacy_days: v }))}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
            <button
              onClick={run}
              disabled={!canRun}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="size-3.5" aria-hidden />
              {mutation.isPending ? "Running scenario…" : "Run scenario"}
            </button>
            <button
              onClick={() => setAssumptions({ ...SCENARIO_DEFAULTS })}
              className="rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Reset assumptions
            </button>
          </div>
        </PanelBody>
      </Panel>

      {/* -------------------------------------------------------- Results */}
      <div className="space-y-3 xl:col-span-2">
        <Panel>
          <PanelHeader
            title={variant === "economics" ? "Decision economics" : "Baseline vs scenario"}
            hint="Risk and severity come from real /predict output — never recomputed in the UI"
            source={resultSource}
            actions={result ? <EvidenceBadge label={result.evidence_label} /> : undefined}
          />
          <PanelBody className="space-y-3">
            {mutation.isPending ? (
              <PanelSkeleton rows={6} />
            ) : mutation.isError ? (
              <PanelError message={mutation.error.message} onRetry={run} />
            ) : !result ? (
              <PanelEmpty
                message={
                  shipments.length === 0
                    ? "No shipments available from the ORCA overview payload."
                    : "Choose a shipment and scenario, then run the scenario to see ORCA output."
                }
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="orca-num text-sm font-semibold">{result.shipment_id}</span>
                  <span className="text-xs text-muted-foreground">{result.scenario_label}</span>
                  <span className="orca-num text-[10px] text-muted-foreground/70">
                    source id {result.source_shipment_id}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-hairline bg-surface-sunken p-3">
                    <p className="orca-label text-[10px]">Baseline</p>
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Risk</span>
                        <span className="orca-num text-sm font-semibold">
                          {pct(result.baseline.risk, 1)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Tier</span>
                        <RiskBadge tier={result.baseline.risk_tier} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Severity p50</span>
                        <span className="orca-num text-xs">
                          {days(result.baseline.severity_p50)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <p className="orca-label text-[10px]">Scenario</p>
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Risk</span>
                        <span className="orca-num text-sm font-semibold">
                          {pct(result.result.risk, 1)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Tier</span>
                        <RiskBadge tier={result.result.risk_tier} className="shrink-0" />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Severity p50</span>
                        <span className="orca-num text-xs">{days(result.result.severity_p50)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    label="Risk delta"
                    value={pp(result.result.risk_delta_pp, 1)}
                    sub={`${TIER_RANGE[result.baseline.risk_tier]} → ${TIER_RANGE[result.result.risk_tier]}`}
                    tone={result.result.risk_delta_pp > 0 ? "negative" : "positive"}
                  />
                  <Metric
                    label="Expected exposure"
                    value={moneyExact(result.economics.expected_exposure)}
                    sub="Scenario risk × severity × delay cost"
                  />
                  <Metric
                    label="Expected benefit"
                    value={moneyExact(result.economics.expected_benefit)}
                    sub="Assumed avoided delay cost"
                  />
                  <Metric
                    label="Net benefit"
                    value={moneyExact(result.economics.net_benefit)}
                    sub={`Intervention cost ${money(result.economics.intervention_cost)}`}
                    tone={result.economics.net_benefit >= 0 ? "positive" : "negative"}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-surface-sunken px-3 py-2">
                  <span className="orca-label text-[10px]">ORCA recommendation</span>
                  <DecisionBadge decision={result.economics.recommendation} />
                  {result.human_approval_required ? (
                    <span className="inline-flex items-center gap-1 rounded-sm border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-warn">
                      <ShieldQuestion className="size-3" aria-hidden />
                      HUMAN APPROVAL REQUIRED
                    </span>
                  ) : null}
                </div>

                <ScenarioDisclaimer text={result.disclaimer} />
              </>
            )}
          </PanelBody>
        </Panel>

        {result ? (
          <Panel>
            <PanelHeader
              title="Feature audit"
              hint="Pre-outcome inputs ORCA changed for this counterfactual"
              actions={resultSource ? <SourceBadge source={resultSource} /> : undefined}
            />
            <PanelBody>
              {result.feature_audit.length === 0 ? (
                <PanelEmpty message="This scenario applied no feature shock (baseline conditions)." />
              ) : (
                <ul className="space-y-1">
                  {result.feature_audit.map((line) => (
                    <li key={line} className="orca-num text-[11px] text-foreground/85">
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
