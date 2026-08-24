import type { ReactNode } from "react";

import { useOverview } from "@/lib/orca/context";
import type { DataSource, OverviewResponse } from "@/lib/orca/types";
import { Panel, PanelBody, PanelError, PanelSkeleton } from "./primitives";

/**
 * Shared pending/error gate around the composed overview payload so every page
 * reuses the same states instead of re-implementing them.
 */
export function OverviewBoundary({
  children,
}: {
  children: (ctx: {
    overview: OverviewResponse;
    source: DataSource;
    reason?: string | undefined;
    refetch: () => void;
    isFetching: boolean;
  }) => ReactNode;
}) {
  const query = useOverview();

  if (query.isPending) {
    return (
      <div className="space-y-3 p-3 lg:p-4">
        <Panel>
          <PanelBody>
            <PanelSkeleton rows={8} />
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

  return (
    <>
      {children({
        overview: query.data.data,
        source: query.data.source,
        reason: query.data.reason,
        refetch: () => void query.refetch(),
        isFetching: query.isFetching,
      })}
    </>
  );
}
