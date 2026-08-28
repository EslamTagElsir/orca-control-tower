import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { predict, recommend } from "../adapter";
import { SimulationEngine, idleSnapshot, type ModelPort } from "./engine";
import type { HumanDecisionKind, OperatorAction, ReasonCode } from "./intervention-policy";
import { createLearningPersistencePort } from "./persistence";
import type { SimSpeed, SimulationSnapshot } from "./types";


/**
 * ONE global Operational Digital Twin run, shared by every page.
 *
 * Mounted in `src/routes/__root.tsx` so route changes never reset the run.
 * A compact snapshot is persisted to sessionStorage so a refresh restores the
 * same Run ID, population and event history.
 */

const STORAGE_KEY = "orca.simulation.v1";
const PERSIST_EVERY_MS = 3_000;

export interface SubmitDecisionInput {
  episodeId: string;
  decision: HumanDecisionKind;
  chosenAction: OperatorAction;
  reasonCode: ReasonCode;
  note?: string | null;
  actorLabel?: string;
}

interface SimulationContextValue {
  snapshot: SimulationSnapshot;
  /** True while a run is running or paused. */
  isActive: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  newRun: () => void;
  setSpeed: (speed: SimSpeed) => void;
  /** Records a real human decision against an open Decision Episode. */
  submitDecision: (input: SubmitDecisionInput) => { ok: boolean; reason?: string };
}


/**
 * Kept on a global slot so a dev HMR re-evaluation of this module reuses the
 * very same context object. Otherwise the root provider (old module instance)
 * and a code-split route (fresh instance) end up on two different contexts and
 * `useSimulation` throws even though the provider is mounted.
 */
const CONTEXT_SLOT = "__orcaSimulationContext";
const globalSlot = globalThis as typeof globalThis & {
  [CONTEXT_SLOT]?: React.Context<SimulationContextValue | null>;
};
const SimulationContext =
  globalSlot[CONTEXT_SLOT] ??
  (globalSlot[CONTEXT_SLOT] = createContext<SimulationContextValue | null>(null));

const IDLE = idleSnapshot();
const serverSnapshot = () => IDLE;

const modelPort: ModelPort = {
  predict: (features) => predict(features),
  recommend: (features) => recommend(features),
};

export function SimulationProvider({ children }: { children: ReactNode }) {
  const engineRef = useRef<SimulationEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new SimulationEngine();
    engineRef.current.setModelPort(modelPort);
    engineRef.current.setPersistencePort(createLearningPersistencePort());
  }

  const engine = engineRef.current;

  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, serverSnapshot);

  // Restore a run left behind by a refresh (client only).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SimulationSnapshot;
      if (parsed && parsed.runId && parsed.status !== "idle") engine.restore(parsed);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    // No cleanup: the provider lives for the app's lifetime and a StrictMode
    // remount must not tear down or freeze an in-flight run.
  }, [engine]);

  // Throttled persistence.
  const lastPersistRef = useRef(0);
  useEffect(() => {
    if (snapshot.status === "idle") {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const now = Date.now();
    if (now - lastPersistRef.current < PERSIST_EVERY_MS) return;
    lastPersistRef.current = now;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage full or unavailable — the run keeps going in memory.
    }
  }, [snapshot]);

  const start = useCallback(() => engine.start(), [engine]);
  const pause = useCallback(() => engine.pause(), [engine]);
  const resume = useCallback(() => engine.resume(), [engine]);
  const stop = useCallback(() => engine.stop(), [engine]);
  const newRun = useCallback(() => engine.newRun(), [engine]);
  const setSpeed = useCallback((speed: SimSpeed) => engine.setSpeed(speed), [engine]);
  const submitDecision = useCallback(
    (input: SubmitDecisionInput) => engine.submitDecision(input),
    [engine],
  );

  const value = useMemo<SimulationContextValue>(
    () => ({
      snapshot,
      isActive: snapshot.status !== "idle",
      start,
      pause,
      resume,
      stop,
      newRun,
      setSpeed,
      submitDecision,
    }),
    [snapshot, start, pause, resume, stop, newRun, setSpeed, submitDecision],
  );


  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}

export function useSimulation(): SimulationContextValue {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error("useSimulation must be used inside <SimulationProvider>");
  return ctx;
}
