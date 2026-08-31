# Supplementary Material

## S1. Evidence hierarchy

Primary evidence is the five-fold expanding temporal development evaluation. The 1,013-row Locked Registry Evaluation Set is secondary historical benchmark evidence and is not described as a newly untouched confirmatory holdout.

## S2. Frozen model roles and thresholds

- CatBoost: deployment-aligned primary classifier; Platt calibrator; frozen threshold 0.1000.
- Random Forest: development PR-AUC sensitivity comparator; Platt calibrator; frozen threshold 0.1050.
- Severity point baseline: conditional median.
- Quantile/CQR engine: LightGBM quantile models at q0.025, q0.05, q0.10, q0.50, q0.90, q0.95, q0.975.

## S3. Full capacity-constrained operational triage [SIMULATED SCENARIO]

| K | Inspected | Strategy | Delays captured /61 | High-severity /15 | Delay days captured | Delay-days ratio |
|---:|---:|---|---:|---:|---:|---:|
| 1% | 11 | Risk only | 6/61 | 1/15 | 42 | 5.9% |
| 1% | 11 | Risk x q50 | 9/61 | 8/15 | 318 | 44.4% |
| 1% | 11 | Risk x q95 | 8/61 | 8/15 | 317 | 44.3% |
| 5% | 51 | Risk only | 16/61 | 2/15 | 92 | 12.8% |
| 5% | 51 | Risk x q50 | 21/61 | 10/15 | 414 | 57.8% |
| 5% | 51 | Risk x q95 | 21/61 | 10/15 | 421 | 58.8% |
| 10% | 102 | Risk only | 26/61 | 10/15 | 288 | 40.2% |
| 10% | 102 | Risk x q50 | 31/61 | 13/15 | 510 | 71.2% |
| 10% | 102 | Risk x q95 | 28/61 | 13/15 | 493 | 68.9% |
| 20% | 203 | Risk only | 42/61 | 15/15 | 619 | 86.5% |
| 20% | 203 | Risk x q50 | 36/61 | 15/15 | 574 | 80.2% |
| 20% | 203 | Risk x q95 | 35/61 | 14/15 | 550 | 76.8% |

All values above are retrospective simulated prioritization outcomes. No intervention was delivered and no causal or realized-savings claim is made.

## S4. Locked CQR exact intervals

| Nominal | Covered | Empirical coverage | Exact 95% Clopper-Pearson CI | Mean width | Median width |
|---:|---:|---:|---:|---:|---:|
| 80% | 43/61 | 70.49% | 57.43-81.48% | 41.04 d | 32.55 d |
| 90% | 56/61 | 91.80% | 81.90-97.28% | 46.27 d | 38.38 d |
| 95% | 61/61 | 100.00% | 94.13-100.00% | 61.74 d | 53.64 d |

## S5. Reproducibility identifiers

- Canonical dataset SHA-256: `918b992dd3e8d4b64d2a727b2c4ea607603d0c58f19484e73f7b78528c6a8673`
- Final evaluation freeze SHA-256: `631F1FA4241FBE697B46D9658B8720D2CE13CFB5A9F65E32C7532F8A1F6CD21A`
- Locked benchmark manifest SHA-256: `62BE80CE9BC977767BC983EDABF61DAA23609A1801251F4E93CFA9693EBDD9AB`
- Frozen integrity tests: 26/26 passed.

## S6. Priority-claim boundary

The literature-priority claim is limited to the joint combination of post-delivery embargoed temporal evaluation, post-hoc probability calibration, conditional severity, CQR, and explicit capacity-constrained shipment prioritization in pharmaceutical logistics. It does not claim novelty for machine learning, conformal prediction, delay-severity modeling, or prediction-to-decision integration individually.
