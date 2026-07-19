# Build Week Judge Guide

This guide exercises Kirjolab's integrated research-to-authoring workflow
without private research material, third-party credentials, or a hosted model.
An optional structured-review deep dive follows the primary walkthrough.

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

The authoring and research workflow does not require a model. Testing model
candidates additionally requires a credential-free, OpenAI-compatible local
provider as described in the main README.

## Integrated Research-to-Authoring Walkthrough

1. Open the default project. Edit `main.md` and confirm that source, scientific
   preview, diagnostics, word count, and revision state update together.
2. Insert or edit a citation. Open the cited publication from the preview and
   inspect its metadata in the research context without leaving the manuscript.
3. Open **Library** and import the synthetic BibTeX below. Add the reference to
   the project and confirm that its portable citation alias appears in the
   project bibliography.
4. Import a non-sensitive PDF, open it beside the manuscript, select a passage,
   and save a highlight with a short note. The PDF bytes remain unchanged.
5. Create a claim using the saved evidence. Inspect the explicit relationship
   between source annotation, claim, and project context.
6. Open **Writing assistant**. Without a local provider, inspect how operations
   require a target and selected evidence. With a provider, generate a candidate
   and confirm that it requires an explicit accept or reject action.
7. Add an anchored manuscript comment and inspect project history.
8. Open **Export** and inspect portable Markdown and BibTeX plus PDF and LaTeX
   projections.

### Synthetic project reference

```bibtex
@article{lovelace2026traceable,
  title = {Traceable Evidence in Collaborative Writing},
  author = {Lovelace, Ada and Example, Lin},
  year = {2026},
  journal = {Journal of Inspectable Scholarship},
  abstract = {A synthetic record for evaluating evidence-aware authoring.}
}
```

The record above is deliberately synthetic and exists only for this walkthrough.

## Optional Structured-Review Deep Dive

1. Open **Reviews**, create a review, and keep the **Systematic literature
   review (SLR)** profile.
2. Under **Writing projects**, explicitly link the project that should receive
   published synthesis artifacts.
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

The public repository and the local path above are the credential-free test
build. They require no judge account or private data. The production Worker is
protected by Cloudflare Access; list it in Devpost only if judge access has been
explicitly arranged and smoke-tested.
