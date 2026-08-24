import type { ReactNode } from "react";
import { AlertTriangle, Database, FlaskConical, Cpu } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DataSource, RiskTier } from "@/lib/orca/types";
import { TIER_CLASSES, TIER_LABEL, TIER_RANGE, DECISION_CLASSES } from "@/lib/orca/risk";
import { pct } from "@/lib/orca/format";

/* ---------------------------------------------------------------- Panel */

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("orca-panel flex flex-col overflow-hidden", className)}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  hint,
  source,
  actions,
}: {
  title: string;
  hint?: string;
  source?: DataSource;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="orca-label shrink-0 whitespace-nowrap">{title}</h2>
        {hint ? (
          <span className="hidden min-w-0 truncate text-[11px] text-muted-foreground/70 lg:inline">
            {hint}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {source ? <SourceBadge source={source} /> : null}
        {actions}
      </div>
    </header>
  );
}

export function PanelBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("min-h-0 flex-1 p-4", className)}>{children}</div>;
}

/* --------------------------------------------------------------- Badges */

export function SourceBadge({ source }: { source: DataSource }) {
  if (source === "live") {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-success">
        <Database className="size-3" aria-hidden />
        LIVE
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-danger"
      title="Offline fixture data — not ORCA output"
    >
      <FlaskConical className="size-3" aria-hidden />
      FIXTURE
    </span>
  );
}

/** Renders an ORCA provenance string verbatim. */
export function EvidenceBadge({
  label,
  className,
  icon = true,
}: {
  label: string;
  className?: string;
  icon?: boolean;
}) {
  const isFixture = label.toUpperCase().includes("FIXTURE");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
        isFixture
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-model/30 bg-model/10 text-model",
        className,
      )}
    >
      {icon ? <Cpu className="size-3 shrink-0" aria-hidden /> : null}
      <span className="truncate">{label}</span>
    </span>
  );
}

export function DerivedBadge({ className }: { className?: string }) {
  return (
    <span
      title="Derived in the UI by aggregating ORCA payload fields — not a separate model output."
      className={cn(
        "inline-flex items-center rounded-sm border border-hairline bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground",
        className,
      )}
    >
      DERIVED
    </span>
  );
}

export function RiskBadge({
  tier,
  value,
  className,
}: {
  tier: RiskTier;
  value?: number;
  className?: string;
}) {
  return (
    <span
      title={`${TIER_LABEL[tier]} — model tier ${TIER_RANGE[tier]}`}
      className={cn(
        "orca-num inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold",
        TIER_CLASSES[tier],
        className,
      )}
    >
      {TIER_LABEL[tier]}
      {value !== undefined ? <span className="opacity-80">{pct(value, 0)}</span> : null}
    </span>
  );
}

export function DecisionBadge({ decision }: { decision: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
        DECISION_CLASSES[decision] ?? DECISION_CLASSES["NO_ACTION"],
      )}
    >
      {decision.replace(/_/g, " ")}
    </span>
  );
}

/* --------------------------------------------------------------- States */

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded-sm bg-surface-raised"
          style={{ width: `${100 - i * 9}%` }}
        />
      ))}
    </div>
  );
}

export function PanelError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-2 text-sm">
      <div className="flex items-center gap-2 text-danger">
        <AlertTriangle className="size-4" aria-hidden />
        <span className="font-medium">Panel data unavailable</span>
      </div>
      <p className="text-xs text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="mt-1 rounded-md border border-hairline bg-surface-raised px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function PanelEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center px-4 py-8 text-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}
