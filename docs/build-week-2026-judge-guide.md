# Build Week Judge Guide

This guide exercises the focused Kirjolab Review submission without private
research material, third-party credentials, or a hosted model.

## Supported Test Platform

Kirjolab's documented local baseline is macOS. The local Worker uses loopback
authentication plus Durable Object and R2 emulation, so Cloudflare and model API
credentials are not required.

Prerequisites:

- macOS
- `nvm`
- Git

## Start the Project

```bash
git clone https://github.com/bebraw/kirjolab.git
cd kirjolab
nvm use
npm install
npm run dev
```

Open <http://127.0.0.1:8787>. The local server prints phase output in the
terminal. Stop it with Control-C.

The ordinary review workflow works with **Local-model assistance** set to
**Off**. Testing model candidates additionally requires a credential-free,
OpenAI-compatible local provider as described in the main README.

## Focused Review Walkthrough

1. Open the local app and choose **Review study**.
2. Keep the **Systematic literature review (SLR)** profile.
3. Enter the compact protocol below, save it, and choose **Freeze protocol**.
4. Open **Search**, paste the synthetic BibTeX set, preview it, and confirm the
   immutable run.
5. Review the duplicate candidate. Merging it must retain both source
   occurrences while reducing the unique-record count.
6. Open **Screen** and record title/abstract and full-text decisions.
7. Appraise and extract the included study. Present values require exact
   evidence; absent values require an explicit missingness reason.
8. Open **Synthesize** to inspect revision-pinned PRISMA counts and the evidence
   matrix, then publish the synthesis into the project.
9. Open **Report** and inspect the PRISMA SVG, lossless JSON, CSV, BibTeX, and
   deterministic review ZIP.

### Compact protocol

| Field                  | Value                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------- |
| Objective              | Evaluate traceable AI assistance in evidence reviews.                                 |
| Research questions     | How is model assistance kept auditable?                                               |
| Concepts               | `Review :: systematic review; evidence review`<br>`Audit :: provenance; traceability` |
| Sources                | `Demo index \| https://example.test \| generic \| title-abstract`                     |
| Inclusion criteria     | Reports an evidence-review workflow                                                   |
| Exclusion criteria     | Does not report an evidence-review workflow                                           |
| Independent reviewers  | One reviewer                                                                          |
| Local-model assistance | Off                                                                                   |
| Quality questions      | Is the evidence trail described?                                                      |
| Answer weights         | `Yes \| 1`<br>`No \| 0 \| reject`                                                     |
| Extraction fields      | `Audit mechanism \| string \| \| RQ1`<br>`Study year \| integer \| \| RQ1`            |

### Synthetic BibTeX

```bibtex
@article{traceable-review-a,
  title = {Traceable Assistance in Evidence Reviews},
  author = {Example, Ada},
  year = {2026},
  doi = {10.5555/kirjolab.demo},
  abstract = {A synthetic study of provenance-preserving review assistance.}
}

@article{traceable-review-duplicate,
  title = {Traceable Assistance in Evidence Reviews},
  author = {Example, Ada},
  year = {2026},
  doi = {10.5555/kirjolab.demo},
  abstract = {A duplicate occurrence from the same synthetic search export.}
}

@article{opaque-review,
  title = {Opaque Automation Without Evidence},
  author = {Example, Lin},
  year = {2025},
  abstract = {A synthetic comparison record without traceable evidence.}
}
```

The records and DOI above are deliberately synthetic and exist only for this
walkthrough.

## Verification

Run the native macOS quality gate:

```bash
npm run ci:local
```

The dated implementation review records the last verified baseline: 743 unit
tests, 78 Workers tests, and 63 Playwright browser tests passed along with
formatting, lint, type, security, and production-dependency checks.

## Expected Boundaries

- Model assistance is optional and never mutates canonical review state without
  explicit researcher disposition.
- Local model requests do not pass through the hosted Worker.
- Imported markup remains inert text.
- Search occurrences survive duplicate resolution.
- Review mutations use revision preconditions and append-only provenance.
- Every report format derives from the same review revision.

## Hosted Evaluation

**Submission blocker:** record the final judge URL and access instructions in the
Devpost draft after the production instance has been deployed and smoke-tested.
The local path above remains the reproducible fallback and requires no judge
account or private credential.
