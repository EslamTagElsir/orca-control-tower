from pathlib import Path
import re

p = Path("src/lib/orca/simulation/engine.ts")
s = p.read_text()

# Normalise an earlier migration retry: keep exactly one fast-click recovery call.
repeated = re.compile(
    r'(\n\s*const persistedEpisode = this\.snapshot\.episodes\.find\(\(e\) => e\.id === localId\);\n'
    r'\s*if \(persistedEpisode\) this\.persistDecisionForEpisode\(run, persistedEpisode\);){2,}'
)
s = repeated.sub(
    '\n        const persistedEpisode = this.snapshot.episodes.find((e) => e.id === localId);\n'
    '        if (persistedEpisode) this.persistDecisionForEpisode(run, persistedEpisode);',
    s,
)

# Avoid racing a standalone inference write against the episode-chain write.
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

# Every successful recommendation in Learning Simulation Mode requires a response.
s = s.replace(
    '      const needsDecision = options.allowEpisode && response.recommendation !== "NO_ACTION";\n',
    '      const needsDecision = options.allowEpisode;\n',
    1,
)

# If /recommend fails, keep the already-successful /predict inference.
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

# Once an async episode write receives its DB id, persist a decision that may
# already have been made while the write was in flight. Do this only once.
if "const persistedEpisode = this.snapshot.episodes.find((e) => e.id === localId);" not in s:
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
    if old not in s:
        raise SystemExit("episode dbId block not found")
    s = s.replace(old, new, 1)

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
if "private persistDecisionForEpisode(run: RunRef" not in s:
    if marker not in s:
        raise SystemExit("submitDecision marker not found")
    s = s.replace(marker, helper + marker, 1)

# ACCEPT must be enforced by the engine, not merely by the UI.
s = s.replace(
    '''    const chosen =
      input.decision === "APPROVE"
        ? defaultActionFor(episode.recommendedAction)
''',
    '''    const chosen =
      input.decision === "ACCEPT" || input.decision === "APPROVE"
        ? defaultActionFor(episode.recommendedAction)
''',
    1,
)

# Replace old duplicated decision persistence with the shared helper once.
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
