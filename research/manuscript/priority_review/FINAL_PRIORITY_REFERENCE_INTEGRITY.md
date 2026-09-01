# Final Priority-Reference Integrity & Novelty Governance Report

**Document ID:** `FINAL_PRIORITY_REFERENCE_INTEGRITY_V2`  
**Date / search cutoff:** 31 August 2026  
**Status:** PASS after independent metadata correction

## Scope
Thirteen closest novelty/prior-art records were rechecked after an earlier automated audit incorrectly labeled several bibliographic records as exact matches. The authoritative sources for this research branch are now:

- `PRIORITY_REFERENCES.bib`
- `PRIORITY_REFERENCE_AUDIT.csv`

The corrected records include publisher/indexed metadata for Müller et al. (2025), Biazon de Oliveira et al. (2021), Thomas & Panicker (2023), Zaghdoudi et al. (2024), Bassiouni et al. (2024), Hupman et al. (2024), Gali et al. (2025), Pathak et al. (2025), Yang (2026), Makhado et al. (2026), Sadeek et al. (2026), and Liang et al. (2026). Faulkner et al. (2026) is retained explicitly as a **preprint, not peer reviewed as of the cutoff**.

## Novelty boundary
The review falsifies broad priority claims such as:

- first machine-learning study of pharmaceutical delivery delays;
- first use of conformal prediction in logistics;
- first combination of delay occurrence and delay-duration modeling;
- first prediction-to-decision framework in logistics.

The literature reviewed through the cutoff did **not** identify a single prior study that jointly evaluates the full ORCA combination of:

1. leakage-aware temporally ordered shipment-delay evaluation;
2. an explicit post-delivery label-maturity embargo;
3. post-hoc probability calibration;
4. binary delay risk separated from conditional delay severity;
5. conditional quantile modeling and conformalized quantile uncertainty; and
6. explicit capacity-constrained shipment prioritization;

within pharmaceutical/global-health shipment logistics.

## Approved Level-2 wording
> **To the best of our knowledge, this is the first study to jointly evaluate, in pharmaceutical shipment logistics, a leakage-aware temporally ordered delay-risk pipeline with post-delivery embargoes, post-hoc probability calibration, conditional delay-severity modeling, conformalized quantile uncertainty, and capacity-constrained shipment prioritization.**

This is a qualified literature-priority statement, not an absolute proof of worldwide priority.

## Strongest prior-art threats
- **Pathak et al. (2025), SCaLDR:** closest pharmaceutical-domain occurrence + duration precedent.
- **Faulkner et al. (2026, preprint):** strongest methodological classification + quantile duration + conformal precedent.
- **Yang (2026), O²RDL-net:** chronological joint risk/delay modeling precedent.
- **Makhado et al. (2026):** conformal uncertainty propagated to capacity-constrained logistics scheduling.
- **Zaghdoudi et al. (2024) / Liang et al. (2026):** prediction-to-optimization and capacity-constrained inspection precedents.

## Integrity verdict
**PASS.** Zero intentionally retained records are treated as fabricated; the preprint is clearly flagged. Manuscript claims must continue to cite the nearest prior art immediately before the Level-2 statement.
