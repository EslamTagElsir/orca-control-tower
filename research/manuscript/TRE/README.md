# ORCA — Transportation Research Part E submission workspace

This directory is the journal-targeted workspace for:

**Temporal Evaluation, Calibrated Risk, and Conformal Delay-Severity Prediction in Pharmaceutical Logistics**

## Canonical layout

```text
research/manuscript/
├── manuscript.md / manuscript.tex           # venue-neutral archive
├── references/                              # verified bibliography + bibliography audits
├── priority_review/                         # novelty / closest-prior-art evidence
├── tables/                                  # tables from frozen results
├── figures/                                 # figures backed by frozen results
├── submission/                              # general submission materials
└── TRE/
    ├── manuscript_TRE.md                    # CANONICAL final TRE manuscript source
    ├── manuscript_TRE.tex                   # generated LaTeX companion; refresh from canonical Markdown before portal upload
    ├── figures/                             # tracked journal figures
    ├── supplementary/                       # TRE supplementary source
    ├── submission_package/2026-08-31/       # versioned final-preparation snapshot + manifests
    └── README.md
```

## Source-of-truth policy

`manuscript_TRE.md` is the canonical final anonymized manuscript source on this branch. The LaTeX file is a generated companion and must be refreshed from the canonical Markdown + verified bibliography during the final portal-formatting pass. Do not resolve conflicts by copying text back from an older LaTeX render.

## Evidence hierarchy

1. Primary scientific evidence: five-fold expanding temporal development evaluation with the 90-day label-maturity embargo.
2. Secondary evidence: the 1,013-row Locked Registry Evaluation Set. It is a historical/registry benchmark, **not** a newly untouched confirmatory holdout.
3. Operational utility remains a **SIMULATED SCENARIO**; no realized financial savings or causal intervention effects are claimed.

## Novelty policy

Authoritative closest-prior-art files:

- `../priority_review/PRIORITY_REFERENCES.bib`
- `../priority_review/PRIORITY_REFERENCE_AUDIT.csv`
- `../priority_review/FINAL_PRIORITY_REFERENCE_INTEGRITY.md`

Approved narrow Level-2 wording:

> To the best of our knowledge, this is the first study to jointly evaluate, in pharmaceutical shipment logistics, a leakage-aware temporally ordered delay-risk pipeline with post-delivery embargoes, post-hoc probability calibration, conditional delay-severity modeling, conformalized quantile uncertainty, and capacity-constrained shipment prioritization.

Broad "first" claims are prohibited.

## Submission status

**CONDITIONAL PASS.** Scientific, evidence, bibliography, and affiliation metadata are frozen. Remaining author-side inputs:

- final CRediT role statement;
- originality / no-simultaneous-submission confirmation;
- live Guide-for-Authors / portal check immediately before upload.

Final author metadata: **Eslam TagElsir**, single and corresponding author; **Independent Researcher, Egypt**; `eslam.tagelsir20@gmail.com`; no ORCID; no external funding; no competing interests. Department is not applicable. Generative-AI disclosure names OpenAI ChatGPT and Google Gemini.

## Binary build artifacts

The versioned snapshot contains `SHA256SUMS.txt` for generated DOCX/PDF/PNG render products. The GitHub connector available in this workflow has no direct binary-file upload bridge, so those render products are treated as build artifacts rather than scientific sources of truth. Existing research figures remain tracked in Git; editable text sources, frozen CSV/JSON outputs, and hashes remain canonical.

## Branch policy

All submission work is on `research/paper-experiments-v1`. Protected `main` is intentionally unchanged until explicit merge approval.
