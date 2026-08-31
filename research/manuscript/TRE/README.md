# ORCA — Transportation Research Part E submission workspace

This directory is the journal-targeted workspace for the manuscript:

**Temporal Evaluation, Calibrated Risk, and Conformal Delay-Severity Prediction in Pharmaceutical Logistics**

## Canonical layout

```text
research/manuscript/
├── manuscript.md / manuscript.tex           # venue-neutral manuscript archive
├── references/                              # full verified bibliography + bibliography audits
├── priority_review/                         # novelty / closest-prior-art evidence
├── tables/                                  # manuscript-ready tables generated from frozen artifacts
├── figures/                                 # manuscript figures backed by frozen results
├── submission/                              # general submission materials
└── TRE/
    ├── manuscript_TRE.md                    # TRE-targeted manuscript source
    ├── manuscript_TRE.tex                   # TRE-targeted LaTeX source
    ├── figures/                             # journal figures already tracked in Git
    ├── supplementary/                       # TRE supplementary source
    ├── submission_package/2026-08-31/       # frozen submission snapshot + manifests
    └── README.md
```

## Evidence hierarchy

1. Primary scientific evidence: five-fold expanding temporal development evaluation with the 90-day label-maturity embargo.
2. Secondary evidence: the 1,013-row Locked Registry Evaluation Set. It is a historical/registry benchmark, **not** a newly untouched confirmatory holdout.
3. Operational utility remains a **SIMULATED SCENARIO**; no realized financial savings or causal intervention effects are claimed.

## Novelty policy

The authoritative closest-prior-art files are:

- `../priority_review/PRIORITY_REFERENCES.bib`
- `../priority_review/PRIORITY_REFERENCE_AUDIT.csv`
- `../priority_review/FINAL_PRIORITY_REFERENCE_INTEGRITY.md`

Only the narrow Level-2 wording is approved:

> To the best of our knowledge, this is the first study to jointly evaluate, in pharmaceutical shipment logistics, a leakage-aware temporally ordered delay-risk pipeline with post-delivery embargoes, post-hoc probability calibration, conditional delay-severity modeling, conformalized quantile uncertainty, and capacity-constrained shipment prioritization.

Broad "first" claims are prohibited.

## Submission status

**CONDITIONAL PASS.** Scientific, evidence, and bibliography work is frozen. Remaining author-side inputs are:

- exact Institution / affiliation;
- exact Department (or an explicit Independent Researcher affiliation choice);
- final CRediT role statement;
- final originality / no-simultaneous-submission confirmation before portal upload.

Known author metadata already supplied: single author Eslam TagElsir; corresponding email `eslam.tagelsir20@gmail.com`; Egypt; no ORCID; no external funding; no competing interests. Generative-AI disclosure names OpenAI ChatGPT and Google Gemini.

## Branch policy

All submission work is kept on `research/paper-experiments-v1`. Do not merge into protected `main` until explicitly approved.
