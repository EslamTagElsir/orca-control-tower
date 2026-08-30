from pathlib import Path

p = Path("src/lib/orca/simulation/engine.ts")
s = p.read_text()

# 1) Avoid racing a standalone inference write against the episode-chain write.
old = '''      for (const l of this.listeners) l();
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
      const needsRecommendation =
        prediction.classification_decision || tier === "HIGH_RISK" || tier === "CRITICAL";
      if (needsRecommendation) {
'''
new = '''      for (const l of this.listeners) l();
      this.audit([event]);

      // /recommend only for meaningful high-risk state changes. When a normal
      // score will open a Decision Episode, the episode write owns the snapshot
      // + inference + recommendation chain so we never race two inference inserts.
      const needsRecommendation =
        prediction.classification_decision || tier === "HIGH_RISK" || tier === "CRITICAL";
      const episodeWillOwnInference = needsRecommendation && request.reason !== "intervention";
      if (!episodeWillOwnInference) {
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
      }

      if (needsRecommendation) {
'''
if old in s:
    s = s.replace(old, new, 1)
elif "episodeWillOwnInference" not in s:
    raise SystemExit("score persistence block not found")

# 2) Every successful recommendation in Learning Simulation Mode requires a human response.
old = '''      const needsDecision = options.allowEpisode && response.recommendation !== "NO_ACTION";
'''
new = '''      const needsDecision = options.allowEpisode;
'''
if old in s:
    s = s.replace(old, new, 1)

# 3) If /recommend itself fails, persist the already-successful /predict inference.
old = '''    } catch {
      // A failed /recommend never fabricates an action — the field stays null.
    }
  }

  /* -------------------- decision episodes -------------------- */
'''
new = '''    } catch {
      // A failed /recommend never fabricates an action. Preserve the successful
      // /predict inference independently so the learning audit does not lose it.
      if (options.allowEpisode && options.triggerEventId) {
        try {
          this.persistence?.inferenceRecorded(this.runRef, {
            shipmentId: shipment.id,
            triggerEventId: options.triggerEventId,
            simClockMs: Math.max(0, Math.round(this.snapshot.simClockMs)),
            inferenceKind: options.inferenceKind,
            features: shipment.features,
            prediction: options.prediction,
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
          // Storage health is reported separately; recommendation failure stays model-layer only.
        }
      }
    }
  }

  /* -------------------- decision episodes -------------------- */
'''
if old in s:
    s = s.replace(old, new, 1)
elif "recommendation failure stays model-layer only" not in s:
    raise SystemExit("recommend catch block not found")

# 4) Once an async episode write receives its DB id, persist a decision that may
# already have been made while the write was in flight.
old = '''        this.snapshot = {
          ...this.snapshot,
          version: this.snapshot.version + 1,
          episodes: this.snapshot.episodes.map((e) => (e.id === localId ? { ...e, dbId } : e)),
        };
        for (const l of this.listeners) l();
'''
new = '''        this.snapshot = {
          ...this.snapshot,
          version: this.snapshot.version + 1,
          episodes: this.snapshot.episodes.map((e) => (e.id === localId ? { ...e, dbId } : e)),
        };
        for (const l of this.listeners) l();
        const persistedEpisode = this.snapshot.episodes.find((e) => e.id === localId);
        if (persistedEpisode) this.persistDecisionForEpisode(run, persistedEpisode);
'''
if old in s:
    s = s.replace(old, new, 1)
elif "persistDecisionForEpisode(run, persistedEpisode)" not in s:
    raise SystemExit("episode dbId block not found")

# 5) Add a single idempotent helper used both by normal and fast-click decision paths.
marker = '''  /**
   * Records a real human decision against an open episode, applies the bounded
   * intervention effect and requeues a real ORCA /predict re-score.
   */
'''
helper = '''  private persistDecisionForEpisode(run: RunRef, episode: SimEpisode) {
    const decision = episode.decision;
    if (!this.persistence || !episode.dbId || !decision) return;
    const effect = interventionEffect(decision.chosenAction);
    const applied =
      decision.chosenAction !== "NO_ACTION" &&
      decision.chosenAction !== "MONITOR" &&
      decision.chosenAction !== "HUMAN_REVIEW";
    try {
      this.persistence.decisionRecorded(run, {
        episodeDbId: episode.dbId,
        shipmentId: episode.shipmentId,
        decision: decision.kind,
        recommendedAction: episode.recommendedAction,
        chosenAction: decision.chosenAction,
        reasonCode: decision.reasonCode,
        note: decision.note,
        actorLabel: decision.actorLabel,
        decisionLatencyMs: decision.latencyMs,
        intervention: applied
          ? {
              action: decision.chosenAction,
              effectSpec: effectSpec(effect),
              appliedSimMs: Math.max(0, Math.round(decision.decidedSimMs)),
              policyVersion: INTERVENTION_POLICY_VERSION,
            }
          : null,
      });
    } catch {
      // Audit sink unavailable — the human decision remains valid in-memory.
    }
  }

'''
if helper.strip() not in s:
    if marker not in s:
        raise SystemExit("submitDecision marker not found")
    s = s.replace(marker, helper + marker, 1)

# 6) ACCEPT must be enforced by the engine, not merely by the UI.
old = '''    const chosen =
      input.decision === "APPROVE"
        ? defaultActionFor(episode.recommendedAction)
        : input.decision === "REJECT"
          ? "NO_ACTION"
          : input.decision === "DEFER"
            ? "MONITOR"
            : input.chosenAction;
'''
new = '''    const chosen =
      input.decision === "ACCEPT" || input.decision === "APPROVE"
        ? defaultActionFor(episode.recommendedAction)
        : input.decision === "REJECT"
          ? "NO_ACTION"
          : input.decision === "DEFER"
            ? "MONITOR"
            : input.chosenAction;
'''
if old in s:
    s = s.replace(old, new, 1)

# 7) Replace duplicated decision persistence with the idempotent helper.
start = s.find('''    // Persist the human decision (+ intervention) once the episode has a db id.\n''')
end_marker = '''    // Every intervention is followed by a REAL ORCA /predict re-score.
'''
if start != -1:
    end = s.find(end_marker, start)
    if end == -1:
        raise SystemExit("decision persistence end marker not found")
    replacement = '''    // The server endpoint is idempotent. If the episode DB id is still in
    // flight, openEpisode() calls the same helper as soon as it arrives.
    const resolvedEpisode = this.snapshot.episodes.find((e) => e.id === episode.id);
    if (resolvedEpisode) this.persistDecisionForEpisode(this.runRef, resolvedEpisode);

'''
    s = s[:start] + replacement + s[end:]
elif "If the episode DB id is still in" not in s:
    raise SystemExit("old decision persistence block not found")

p.write_text(s)
