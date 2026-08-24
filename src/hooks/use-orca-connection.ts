import { useSyncExternalStore } from "react";

import {
  getConnectionConfig,
  getServerConnectionConfig,
  subscribeConnectionConfig,
  type ConnectionConfig,
} from "@/lib/orca/transport";

/** Reactive view of the persisted ORCA connection configuration. */
export function useConnectionConfig(): ConnectionConfig {
  return useSyncExternalStore(
    subscribeConnectionConfig,
    getConnectionConfig,
    getServerConnectionConfig,
  );
}
