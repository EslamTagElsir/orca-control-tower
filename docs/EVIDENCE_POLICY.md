# ORCA Evidence Policy

ORCA separates evidence by provenance so product screens, exports, demos, and research claims do not blur measured data, model output, and simulated scenarios.

## Evidence classes

### REAL DATA
Use for observed source records, source-derived facts, immutable evaluation artifacts, and other evidence that can be traced to a versioned data source or registry artifact.

### MODEL OUTPUT
Use for predictions, calibrated probabilities, severity estimates, SHAP explanations, recommendations, and uncertainty intervals produced by a versioned ORCA model or serving contract.

### SIMULATED SCENARIO
Use for counterfactuals, what-if simulations, synthetic interventions, or scenario outputs that are not observations from the source system.

## Reporting rules

1. Preserve the evidence label supplied by the source contract. Do not silently relabel model output as real data.
2. Preserve model version, prediction contract version, evaluation role, and data hash when they are available.
3. Frozen holdout metrics are evaluation evidence, not live production telemetry.
4. Do not claim live drift, current SLA performance, or post-deployment causal impact without a separate production-monitoring evidence source.
5. Do not recompute or substitute registry metrics in the browser. The reliability endpoint reports the locked serving-registry artifact.
6. Fixture data must remain visibly marked as fixture data and must not be exported as ORCA production evidence.
7. Simulated scenarios must remain distinguishable from recommendations based on observed records.

## Reliability evidence

`GET /reliability` exposes the locked serving-registry reliability artifact. It includes temporal split provenance, classification holdout metrics, CQR coverage diagnostics, model/contract versions, and the evaluation data SHA-256.

The Reports page exports this payload as JSON or as a human-readable Markdown evidence pack. These exports preserve the interpretation boundary that the values describe frozen evaluation evidence rather than a live monitoring snapshot.

## Change discipline

A new model registry version should produce a new versioned evidence artifact rather than mutating prior evaluation evidence in place. Changes that alter data provenance, split chronology, evaluation semantics, or prediction-contract meaning should be reviewed as contract changes and covered by tests.
