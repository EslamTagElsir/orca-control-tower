import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { useHydrated } from "@/hooks/use-hydrated";
import { journeyAnalyticsQuery } from "@/lib/orca/client";
import { num } from "@/lib/orca/format";
import { routeHead } from "@/components/orca/RouteShell";
import { PageFrame } from "@/components/orca/PageFrame";
import { JourneyAnalyticsView } from "@/components/orca/JourneyAnalytics";
import {
  EvidenceBadge,
  Panel,
  PanelBody,
  PanelError,
  PanelSkeleton,
} from "@/components/orca/primitives";

export const Route = createFileRoute("/analytics")({
  head: routeHead(
    "Journey Performance Analytics — ORCA Control Tower",
    "Completed holdout journey outcomes, operational performance breakdowns and ORCA prediction quality against actual late/on-time labels.",
  ),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const hydrated = useHydrated();
  const query = useQuery({ ...journeyAnalyticsQuery(), enabled: hydrated });

  if (!hydrated || query.isPending) {
    return (
      <div className="space-y-3 p-3 lg:p-4">
        <Panel>
          <PanelBody>
            <PanelSkeleton rows={10} />
          </PanelBody>
        </Panel>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-3 lg:p-4">
        <Panel>
          <PanelBody>
            <PanelError
              message={(query.error as Error).message}
              onRetry={() => void query.refetch()}
            />
          </PanelBody>
        </Panel>
      </div>
    );
  }

  const data = query.data.data;

  return (
    <PageFrame
      title="Journey Performance Analytics"
      subtitle="Completed journey outcomes, operational performance, and ORCA prediction quality."
      actions={
        <>
          <EvidenceBadge label="REAL DATA — HOLDOUT OUTCOMES" icon={false} />
          {data.matrix ? (
            <EvidenceBadge label={`MODEL OUTPUT — ORCA ${data.matrix.modelVersion}`} />
          ) : null}
          <span className="orca-num hidden text-[11px] text-muted-foreground sm:inline">
            {num(data.kpis.completed)} completed ·{" "}
            {data.matrix ? `${num(data.matrix.scored)} scored` : "model offline"}
          </span>
        </>
      }
    >
      <JourneyAnalyticsView data={data} />
    </PageFrame>
  );
}
