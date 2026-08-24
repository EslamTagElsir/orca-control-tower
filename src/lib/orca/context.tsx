import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { useHydrated } from "@/hooks/use-hydrated";
import { healthQuery, overviewQuery } from "./client";
import type { ConnectionState } from "./types";

interface OrcaContextValue {
  seed: number | undefined;
  selectedShipmentId: string | null;
  setSelectedShipmentId: (id: string | null) => void;
  autoRefresh: boolean;
  setAutoRefresh: (value: boolean) => void;
  refreshMs: number;
  setRefreshMs: (value: number) => void;
  resetDemo: () => void;
  connection: ConnectionState;
  modelVersion: string | null;
  registryRole: string | null;
  evidenceLabels: string[];
  offlineReason: string | null;
}

const OrcaContext = createContext<OrcaContextValue | null>(null);

export function OrcaProvider({ children }: { children: ReactNode }) {
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshMs, setRefreshMs] = useState(30_000);

  // Queries stay disabled until hydration so SSR output and the first client
  // render agree (fixture fallback can resolve before hydration completes).
  const hydrated = useHydrated();
  const health = useQuery({ ...healthQuery(autoRefresh ? 20_000 : false), enabled: hydrated });

  const connection: ConnectionState = health.isPending
    ? "connecting"
    : health.data?.source === "live" && health.data.data
      ? "live"
      : "offline";

  const value = useMemo<OrcaContextValue>(
    () => ({
      seed,
      selectedShipmentId,
      setSelectedShipmentId,
      autoRefresh,
      setAutoRefresh,
      refreshMs,
      setRefreshMs,
      resetDemo: () => {
        setSelectedShipmentId(null);
        setSeed(undefined);
      },
      connection,
      modelVersion: health.data?.data?.model_version ?? null,
      registryRole: health.data?.data?.registry_role ?? null,
      evidenceLabels: health.data?.data?.evidence_labels ?? [],
      offlineReason: health.data?.reason ?? null,
    }),
    [seed, selectedShipmentId, autoRefresh, refreshMs, connection, health.data],
  );

  return <OrcaContext.Provider value={value}>{children}</OrcaContext.Provider>;
}

export function useOrca(): OrcaContextValue {
  const ctx = useContext(OrcaContext);
  if (!ctx) throw new Error("useOrca must be used inside <OrcaProvider>");
  return ctx;
}

/** Shared overview query bound to the current seed / refresh preference. */
export function useOverview() {
  const { seed, autoRefresh, refreshMs } = useOrca();
  const hydrated = useHydrated();
  return useQuery({ ...overviewQuery(seed, autoRefresh ? refreshMs : false), enabled: hydrated });
}
