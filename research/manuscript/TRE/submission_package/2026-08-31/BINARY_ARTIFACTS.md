# Generated binary artifact manifest

The final local TRE package generated on 31 August 2026 contains the following binary render products:

- `ORCA_TRE_Anonymized_Manuscript.docx`
- `ORCA_TRE_Anonymized_Manuscript.pdf`
- `submission/title_page_Eslam_TagElsir.docx`
- `submission/title_page_Eslam_TagElsir.pdf`
- `submission/cover_letter_TRE_Eslam_TagElsir.docx`
- `submission/cover_letter_TRE_Eslam_TagElsir.pdf`
- `supplementary/supplementary_TRE.docx`
- `supplementary/supplementary_TRE.pdf`
- seven publication-render PNG figures plus a graphical-abstract candidate

Exact SHA-256 values are stored in `SHA256SUMS.txt`.

## Repository policy

The GitHub connector available to this workflow exposes UTF-8 repository writes but no direct binary-file upload bridge. Consequently, the binary render products are **not silently represented as if they were committed**. They remain generated build artifacts identified by checksum, while the editable manuscript, bibliography, supplementary source, priority evidence, frozen experiment outputs, and existing research figure artifacts are tracked in Git.

The complete generated binary package from this workflow is `ORCA_TRE_Submission_Package_Eslam_TagElsir.zip` in the conversation artifacts. If a local Git client is used later, these binaries can be added under a release/build-artifact policy without changing the scientific source tree.

Do not treat absence of a binary render from Git as absence of its underlying source or evidence.
