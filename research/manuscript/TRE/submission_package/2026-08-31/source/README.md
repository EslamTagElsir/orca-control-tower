# Submission source map

The versioned snapshot intentionally points to canonical repository sources instead of duplicating large editable files.

- TRE manuscript Markdown: `../../../manuscript_TRE.md`
- TRE manuscript LaTeX: `../../../manuscript_TRE.tex`
- Full verified bibliography: `../../../../references/references.bib`
- Corrected priority bibliography: `../../../../priority_review/PRIORITY_REFERENCES.bib`
- Priority audit: `../../../../priority_review/PRIORITY_REFERENCE_AUDIT.csv`
- Journal figures: `../../../figures/`
- Supplementary source: `../../../supplementary/supplementary_TRE.md`

The generated local render package is checksum-indexed by `../SHA256SUMS.txt`. Rendered DOCX/PDF files are build products; the editable research sources and frozen experimental artifacts remain authoritative.
