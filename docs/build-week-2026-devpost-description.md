# Devpost Project Description — Kirjolab Review

## Elevator Pitch

Kirjolab Review is an auditable AI-assisted workspace that turns systematic
review evidence into traceable scholarly writing.

## Inspiration

Systematic literature reviews are assembled across search portals,
spreadsheets, PDF readers, screening tools, and manuscript editors. Each handoff
makes it harder to answer basic questions: Why was this study included? Which
passage supports this extracted value? Which review revision produced this
figure? What exactly did a model see, suggest, and change?

AI can accelerate screening and extraction, but plausible output is not enough
for audit-sensitive research. We wanted assistance that remains bounded by
explicit evidence and researcher judgment.

## What It Does

Kirjolab Review connects the complete SLR and MLR workflow:

- define and freeze a versioned protocol with research questions, PICOC framing,
  concepts, eligibility criteria, and source-specific queries
- import BibTeX search results while preserving exact queries, search dates,
  source occurrences, digests, and reviewed duplicate decisions
- run attributed title/abstract and full-text screening with independent
  decisions, blinding, conflict detection, and explicit adjudication
- appraise studies and extract typed values with exact evidence or explicit
  missingness
- generate local-model screening and extraction candidates that require an
  explicit accept, edit, or reject decision
- derive revision-pinned PRISMA reporting, evidence matrices, and manuscript
  artifacts
- export lossless JSON, long-form CSV, scoped BibTeX, accessible PRISMA data and
  SVG, model disclosure, and a deterministic digest-manifested review package

The core boundary is simple: **AI proposes; the researcher decides.** Rejected
model output changes no canonical review or manuscript state.

## How We Built It

Kirjolab runs on Cloudflare Workers. A project-associated, SQLite-backed Durable
Object coordinates each review through monotonic revisions. Domain modules own
portable types and calculations; authenticated Worker routes expose bounded
operations; the browser presents one Plan → Search → Screen → Appraise → Extract
→ Synthesize → Report workflow.

Codex accelerated the review-study domain model, persistence, APIs, browser
workflow, deterministic exports, and automated tests. Repository instructions,
feature specifications, and architecture decisions kept the work reviewable.
The author retained the important product and architecture decisions: append-only
research judgments, exact evidence requirements, revision-pinned outputs,
portable artifacts, and mandatory human disposition of model candidates.

After implementation, we used Codex-assisted exploratory browser reviews to
record real workflow problems before fixing them. The corrected product then
passed the native local quality gate, including unit, Workers-runtime, and
Playwright browser tests.

## Challenges

The difficult part was not generating model text. It was preserving semantic
authority across protocol amendments, duplicate resolution, two screening
stages, independent reviewers, evidence-linked extraction, derived reports, and
manuscript publication without letting one representation silently overwrite
another.

Another challenge was making provenance useful rather than decorative. Search
occurrences survive deduplication, decisions are append-only, model candidates
retain supplied source scope and disposition, and every report format derives
from the same pinned review revision.

## Accomplishments

- A complete runnable review workflow rather than a disconnected AI proof of
  concept
- Human-review boundaries enforced in the domain and persistence layers
- Deterministic exports with manifest digests and accessible PRISMA output
- A credential-free local workflow that does not require a hosted model
- Dated exploratory UI reviews followed by fixes and browser regression coverage

## What We Learned

Trustworthy research assistance depends more on explicit state transitions and
inspectable evidence than on a larger prompt. Small typed model tasks are easier
to review, disclose, retry, and run on local hardware. Reproducibility also has
to be designed into the authority model; it cannot be reconstructed reliably at
export time.

## What's Next

Next steps include richer source-import adapters, side-by-side independent data
extraction, additional synthesis definitions, and evaluations that measure model
candidate usefulness without weakening researcher control.

## Build Week Evidence to Insert Before Submission

Replace this section in the Devpost form with verified facts from the qualifying
Codex thread:

- exact GPT-5.6 model label
- qualifying `/feedback` Codex Session ID
- concise description of the GPT-5.6 contribution to the focused commit range

Do not infer those values from a submission-preparation thread.
