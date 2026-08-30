from pathlib import Path

engine_path = Path("src/lib/orca/simulation/engine.ts")
text = engine_path.read_text()

old = '''export interface EpisodeOpenPayload {
  shipmentId: string;
  triggerEventId: string | null;
  simClockMs: number;
  inferenceKind: "INITIAL" | "RESCORE" | "POST_INTERVENTION";
  features: FeatureMap;
  prediction: PredictResponse;
  recommendation: RecommendResponse;
  state: {
    shipmentStatus: string;
    progress: number;
    position: [number, number];
    etaVarianceHours: number;
    exceptionOpen: boolean;
    exceptionFamily: string | null;
  };
}
'''
new = '''export interface ModelInferencePayload {
  shipmentId: string;
  triggerEventId: string;
  simClockMs: number;
  inferenceKind: "INITIAL" | "RESCORE" | "POST_INTERVENTION";
  features: FeatureMap;
  prediction: PredictResponse;
  state: {
    shipmentStatus: string;
    progress: number;
    position: [number, number];
    etaVarianceHours: number;
    exceptionOpen: boolean;
    exceptionFamily: string | null;
  };
}

export interface EpisodeOpenPayload extends Omit<ModelInferencePayload, "triggerEventId"> {
  triggerEventId: string | null;
  recommendation: RecommendResponse;
}
'''
if old in text:
    text = text.replace(old, new, 1)
elif "export interface ModelInferencePayload" not in text:
    raise SystemExit("ModelInferencePayload insertion point not found")

old = '''  eventsAppended(run: RunRef, events: SimEvent[]): void;
  episodeOpened(run: RunRef, payload: EpisodeOpenPayload): Promise<string | null>;
'''
new = '''  eventsAppended(run: RunRef, events: SimEvent[]): void;
  inferenceRecorded(run: RunRef, payload: ModelInferencePayload): void;
  episodeOpened(run: RunRef, payload: EpisodeOpenPayload): Promise<string | null>;
'''
if old in text:
    text = text.replace(old, new, 1)
elif "inferenceRecorded(run: RunRef" not in text:
    raise SystemExit("PersistencePort insertion point not found")

old = '''  resume() {
    if (this.snapshot.status !== "paused") return;
    this.commit({ status: "running" });
    this.startClock();
    this.pump();
  }
'''
new = '''  resume() {
    if (this.snapshot.status !== "paused") return;
    this.commit({ status: "running" });
    try {
      this.persistence?.runStarted(this.runRef);
    } catch {
      // Audit sink unavailable — the simulation resumes independently.
    }
    this.startClock();
    this.pump();
  }
'''
if old in text:
    text = text.replace(old, new, 1)
elif "simulation resumes independently" not in text:
    raise SystemExit("resume insertion point not found")

old = '''      for (const l of this.listeners) l();
      this.audit([event]);

      // /recommend only for meaningful high-risk state changes.
'''
new = '''      for (const l of this.listeners) l();
      this.audit([event]);
      try {
        this.persistence?.inferenceRecorded(this.runRef, {
          shipmentId: shipment.id,
          triggerEventId: event.id,
          simClockMs: Math.max(0, Math.round(this.snapshot.simClockMs)),
          inferenceKind:
            request.reason === "initial"
              ? "INITIAL"
              : request.reason === "intervention"
                ? "POST_INTERVENTION"
                : "RESCORE",
          features: shipment.features,
          prediction,
          state: {
            shipmentStatus: shipment.status,
            progress: shipment.progress,
            position: shipment.position,
            etaVarianceHours: shipment.etaVarianceHours,
            exceptionOpen: shipment.exceptionOpen,
            exceptionFamily: shipment.exceptionFamily,
          },
        });
      } catch {
        // Audit sink unavailable — model scoring remains authoritative and continues.
      }

      // /recommend only for meaningful high-risk state changes.
'''
if old in text:
    text = text.replace(old, new, 1)
elif "this.persistence?.inferenceRecorded" not in text:
    raise SystemExit("inference persistence insertion point not found")

old = '''          inferenceKind: request.reason === "initial" ? "INITIAL" : "RESCORE",
'''
new = '''          inferenceKind:
            request.reason === "initial"
              ? "INITIAL"
              : request.reason === "intervention"
                ? "POST_INTERVENTION"
                : "RESCORE",
'''
if old in text:
    text = text.replace(old, new, 1)

engine_path.write_text(text)
