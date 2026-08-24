import type { ReactNode } from "react";

import { FIXTURE_NOTICE } from "@/lib/orca/client";
import type { DataSource } from "@/lib/orca/types";

/**
 * Shared page frame: fixture provenance banner + page header.
 * Presentation only — no data fetching, so it ports cleanly.
 */
export function FixtureBanner({
  reason,
  scope,
}: {
  reason?: string | null | undefined;
  scope?: string;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
    >
      <span className="font-semibold tracking-wide">{FIXTURE_NOTICE}</span>
      <span className="text-danger/80">
        The ORCA API is unreachable{reason ? ` (${reason})` : ""}.{" "}
        {scope ??
          "Every figure below is deterministic stand-in data and must not be read as a model output."}
      </span>
    </div>
  );
}

export function PageFrame({
  title,
  subtitle,
  source,
  reason,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  source?: DataSource;
  reason?: string | null | undefined;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 p-3 lg:p-4">
      {source === "fixture" ? <FixtureBanner reason={reason} /> : null}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}
