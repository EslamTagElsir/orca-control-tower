import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Construction } from "lucide-react";

import { useOverview } from "@/lib/orca/context";
import { FIXTURE_NOTICE } from "@/lib/orca/client";
import { Panel, PanelBody, PanelHeader } from "./primitives";

/**
 * Shared frame for the non-flagship screens: real ORCA header context plus an
 * explicit statement of what the screen will read from the API.
 */
export function RouteShell({
  title,
  subtitle,
  endpoints,
  children,
}: {
  title: string;
  subtitle: string;
  endpoints: string[];
  children?: ReactNode;
}) {
  const query = useOverview();
  const source = query.data?.source;

  return (
    <div className="space-y-3 p-3 lg:p-4">
      {source === "fixture" ? (
        <div
          role="status"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-semibold tracking-wide text-danger"
        >
          {FIXTURE_NOTICE}
        </div>
      ) : null}

      <header>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </header>

      {children}

      <Panel>
        <PanelHeader title="Screen scope" hint="Backed by existing ORCA endpoints only" />
        <PanelBody className="space-y-3">
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Construction className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
            This screen is scaffolded next. It will read exclusively from the endpoints below — no new
            metrics or time series are fabricated in the UI.
          </p>
          <ul className="space-y-1">
            {endpoints.map((endpoint) => (
              <li key={endpoint} className="orca-num text-[11px] text-foreground/80">
                {endpoint}
              </li>
            ))}
          </ul>
          <Link
            to="/control-tower"
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            Back to Control Tower
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </PanelBody>
      </Panel>
    </div>
  );
}

export function routeHead(title: string, description: string) {
  return () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" as const },
    ],
  });
}
