import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * True only after client hydration has completed.
 *
 * Used to keep the server-rendered tree and the first client render identical
 * when data can resolve before React finishes hydrating (fixture fallback is
 * effectively synchronous, which otherwise races hydration).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
