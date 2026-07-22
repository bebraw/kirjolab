import {
  isManuscriptAnchorResolution,
  isManuscriptAnchorSelector,
  type ManuscriptAnchorResolution,
  type ManuscriptAnchorSelector,
} from "./manuscript-anchor";
import { normalizeProjectPath, type ProjectAsset, type ProjectComposition, type ProjectFile, type ProjectFolder } from "./project-files";
import type { BibliographicSnapshot } from "./reference-library";
import type { ResearchShareSnapshot } from "./reference-library";

export type { ManuscriptAnchorResolution, ManuscriptAnchorSelector } from "./manuscript-anchor";
export type { ProjectAsset, ProjectComposition, ProjectFile, ProjectFolder } from "./project-files";
export type { BibliographicSnapshot } from "./reference-library";
export type { ResearchShareSnapshot } from "./reference-library";

export const demoWorkspaceId = "demo";
export const localOwnerId = "local";

export const legacyDefaultSource = `## Evidence becomes prose {#sec-evidence}

Kirjolab keeps the path from an annotation to a claim and into cited prose visible :cite[merton1942]{locator="p. 270"}.

::include[sections/transclusion.md]

## Return to the source {#sec-source}

The preview resolves a link back to :ref[sec-evidence]. Select this paragraph, attach a PDF annotation, and ask a local model to propose a grounded revision.
`;

export const defaultSource = `${legacyDefaultSource}
## References {#references}

::bibliography[]
`;

export const defaultTransclusionPath = "sections/transclusion.md";

export const defaultTransclusionSource = `## Included from another file {#sec-transclusion}

This section lives in \`${defaultTransclusionPath}\`. Edit that file from the Files rail and the composed preview will update here.
`;

export const defaultGuidePath = "KIRJOLAB.md";

export const defaultGuideSource = `## Kirjolab guide

Kirjolab is a project-based writing environment for research. It keeps manuscript files, references, evidence, comments, history, preview, and publication exports together without replacing portable Markdown and BibTeX as the source material.

This guide is part of the starter project but is not included in \`main.md\`, so it does not appear in the manuscript or publication exports. Delete it when you no longer need it.

### How a project fits together

- \`main.md\` is the publication root. Preview and export always begin there.
- Supporting Markdown files can live in folders and enter the paper through \`::include[path]\`.
- \`figures/\` holds uploaded project images.
- The Files rail changes the file being edited. Research holds project evidence, claims, and references; Comments holds manuscript discussion.
- Preview shows the composed paper. Library stores private references and PDFs. Writing assistant can propose a revision to a selected passage for you to accept or reject.
- Export can produce PDF, a LaTeX project, composed Markdown, cited BibTeX, or an archival source bundle.

The starter paper demonstrates an include, citation, cross-reference, and bibliography. Edit those examples freely.

### Standard Markdown

Kirjolab supports ordinary Markdown plus GitHub-Flavored Markdown: headings, emphasis, links, images, block quotes, ordered and unordered lists, task lists, fenced code, tables, strikethrough, autolinks, and named footnotes.

~~~markdown
## A section

Text can be **strong**, *emphasized*, or linked to [a source](https://example.com).

| Method | Result |
| --- | ---: |
| A | 42 |

A claim with a note.[^detail]

[^detail]: Supporting detail.
~~~

YAML or TOML frontmatter is accepted at the beginning of \`main.md\` and hidden from preview. Frontmatter in included files is ignored during composition.

### Comments

Use a comment block for draft notes that should remain in the Markdown source without appearing in preview or publication output. The opening and closing markers must each occupy their own line.

~~~markdown
::: comment
This note remains in source and history, but is not published.
:::
~~~

Commented content is ignored by includes, citations, cross-references, word counts, and exports. Comment blocks do not nest, and an opening marker without a closing \`:::\` produces a diagnostic.

### Citations

Citation keys come from references linked to the project. Separate multiple keys with commas.

~~~markdown
:cite[<reference-key>]
:cite[<first-key>, <second-key>]
~~~

The citation forms and options are:

| Form | Meaning |
| --- | --- |
| \`:cite[<key>]\` | Parenthetical citation by default |
| \`:citet[<key>]\` | Textual citation, such as “Merton (1942)” |
| \`:citep[<key>]\` | Parenthetical citation, such as “(Merton, 1942)” |
| \`mode=parenthetical\` | Author and year in parentheses |
| \`mode=textual\` | Author in the sentence, year in parentheses |
| \`mode=full\` | Full inline bibliographic description |
| \`locator="p. 270"\` | Page, chapter, section, or other locator |
| \`prefix="See "\` | Text before the rendered citation |
| \`suffix=" for context"\` | Text after the rendered citation |

Options go in braces after the citation. An explicit \`mode\` overrides the default of \`:citet\` or \`:citep\`.

~~~markdown
:cite[<key>]{mode=textual locator="p. 270" prefix="See " suffix=" for context"}
~~~

Place the cited-reference list exactly where it should appear with:

~~~markdown
## References {#references}

::bibliography[]
~~~

The bibliography marker takes no options and should appear only once in the composed paper.

### Sections, anchors, and cross-references

Headings receive generated link targets. Add an explicit identifier when you want a stable target:

~~~markdown
## Methods {#sec-methods}

See :ref[sec-methods].
See :ref[the methods section]{target="sec-methods"}.
~~~

The bracket value is the target by default. To show custom link text, put the text in brackets and the target in \`{target="..."}\`.

Use an anchor for a named target that is not a heading:

~~~markdown
::anchor[Primary result]{target="result:primary" slug="primary-result"}

See :ref[result:primary].
~~~

The optional \`slug\` controls the public HTML target. \`::alias\` maps a legacy target to an existing heading slug:

~~~markdown
::alias[Methods]{target="sec:legacy-methods" slug="methods"}

## Methods

See :ref[sec:legacy-methods].
~~~

### Files and includes

An include must occupy its own line. Its path is relative to the file containing it, and nested includes are allowed. The exact form is \`::include[sections/methods.md]\`.

From \`sections/discussion.md\`, a sibling is \`::include[conclusion.md]\`; a root-level file is \`::include[../appendix.md]\`. Kirjolab updates inbound include paths when files or folders move.

Only \`main.md\` defines the publication root. Opening another file changes the editor, not what gets exported.

### Images

Upload PNG, JPEG, GIF, WebP, AVIF, or SVG images through the Files rail. Kirjolab stores them below \`figures/\` and inserts a path relative to the active Markdown file. SVG figures must be self-contained and cannot include scripts, embedded documents, event handlers, or remote resources.

~~~markdown
![Descriptive alternative text](figures/result.png)
~~~

From a file below \`sections/\`, the same image path is normally \`../figures/result.png\`. Moving folders updates project image references. Images appear in live preview and archival source exports; publication PDF and LaTeX image embedding is not yet supported.

### A useful working loop

1. Add papers and PDFs in Library, then link the references you cite to the project.
2. Organize the draft in \`main.md\` and supporting files.
3. Use Preview and diagnostics to check citations, references, and composition.
4. Capture PDF highlights or notes and connect evidence to claims or manuscript passages.
5. Use comments, milestones, and history before larger revisions.
6. Choose the publication profile and inspect an export before submission.

The toolbar can insert citations, references, anchors, footnotes, links, and includes, so you do not have to remember every form in this guide.
`;

export const defaultBibliography = `@article{merton1942,
  author = {Merton, Robert K.},
  title = {The Normative Structure of Science},
  year = {1942},
  journal = {The Sociology of Science}
}
`;

export type CandidateStatus = "pending" | "accepted" | "rejected";
export type ClaimEvidenceRelation = "supports" | "contradicts" | "extends";
export type CitationStyle = "apa" | "chicago-author-date" | "ieee";
export type SubmissionTemplate = "article" | "preprint" | "anonymous-review" | "journal-two-column";

export interface ProjectPublicationProfile {
  readonly citationStyle: CitationStyle;
  readonly locale: "en-US" | "en-GB" | "fi-FI";
  readonly submissionTemplate: SubmissionTemplate;
  readonly paperSize: "a4" | "letter";
}

export const defaultProjectPublicationProfile: ProjectPublicationProfile = {
  citationStyle: "apa",
  locale: "en-US",
  submissionTemplate: "article",
  paperSize: "a4",
};

export interface WorkspaceSummary {
  id: string;
  title: string;
  href: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export type WorkspaceRole = "owner" | "member";

export interface WorkspaceMember {
  id: string;
  email: string;
  role: WorkspaceRole;
  addedAt: string;
}

export interface PdfResource {
  id: string;
  name: string;
  contentType: "application/pdf";
  size: number;
  objectKey: string;
  fingerprint: string;
  createdAt: string;
}

export interface PublicationResource {
  id: string;
  citationKey: string;
  type: string;
  title: string;
  authors: string[];
  year: string;
  venue: string;
  doi: string;
  url: string;
  abstract: string;
  metadataSource: "bibtex" | "crossref";
  createdAt: string;
  updatedAt: string;
}

export interface PublicationPdfLink {
  id: string;
  publicationId: string;
  pdfId: string;
  createdAt: string;
}

export interface ProjectReferenceLink {
  id: string;
  referenceId: string;
  citationAlias: string;
  snapshot: BibliographicSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface AnnotationResource {
  id: string;
  pdfId: string;
  page: number;
  quote: string;
  prefix: string;
  suffix: string;
  comment: string;
  rects: PdfSelectionRect[];
  fragments: AnnotationFragment[];
  createdAt: string;
  updatedAt: string;
}

export interface AnnotationFragment {
  id: string;
  quote: string;
  prefix: string;
  suffix: string;
  rects: PdfSelectionRect[];
  createdAt: string;
}

export interface PdfSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PassageLink {
  id: string;
  annotationId: string;
  anchor: ManuscriptAnchorSelector;
  resolution: ManuscriptAnchorResolution;
  createdAt: string;
}

export interface ClaimResource {
  id: string;
  text: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimEvidenceLink {
  id: string;
  claimId: string;
  annotationId: string;
  relation: ClaimEvidenceRelation;
  createdAt: string;
}

export interface ClaimPassageLink {
  id: string;
  claimId: string;
  anchor: ManuscriptAnchorSelector;
  resolution: ManuscriptAnchorResolution;
  createdAt: string;
}

export type ManuscriptCommentStatus = "open" | "resolved";

export interface ManuscriptComment {
  readonly id: string;
  readonly authorId: string;
  readonly authorLabel: string;
  readonly body: string;
  readonly anchor: ManuscriptAnchorSelector;
  readonly resolution: ManuscriptAnchorResolution;
  readonly status: ManuscriptCommentStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ModelEvidenceReference =
  | { readonly kind: "annotation"; readonly id: string; readonly version: string }
  | { readonly kind: "claim"; readonly id: string; readonly version: string };

export interface ModelAnnotationEvidence {
  readonly kind: "annotation";
  readonly id: string;
  readonly version: string;
  readonly pdfId: string;
  readonly page: number;
  readonly quote: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly comment: string;
  readonly rects: readonly PdfSelectionRect[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ModelClaimEvidence {
  readonly kind: "claim";
  readonly id: string;
  readonly version: string;
  readonly text: string;
  readonly note: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ModelEvidence = ModelAnnotationEvidence | ModelClaimEvidence;

export interface ModelCandidateTarget {
  readonly anchor: ManuscriptAnchorSelector;
  readonly resolution: ManuscriptAnchorResolution;
}

export interface ModelRevisionCandidate {
  readonly id: string;
  readonly operation: "revise-selection";
  readonly promptVersion: "revise-selection-v1";
  readonly providerAdapter: "openai-compatible";
  readonly providerLabel: string;
  readonly model: string;
  readonly instruction: string;
  readonly sourceRevision: number;
  readonly target: ModelCandidateTarget;
  readonly evidence: readonly ModelEvidence[];
  readonly proposedReplacement: string;
  readonly status: CandidateStatus;
  readonly createdAt: string;
}

export interface ModelClaimCandidate {
  readonly id: string;
  readonly operation: "draft-claim";
  readonly promptVersion: "draft-claim-v1";
  readonly providerAdapter: "openai-compatible";
  readonly providerLabel: string;
  readonly model: string;
  readonly instruction: string;
  readonly relation: ClaimEvidenceRelation;
  readonly evidence: readonly ModelAnnotationEvidence[];
  readonly proposedText: string;
  readonly proposedNote: string;
  readonly status: CandidateStatus;
  readonly createdAt: string;
}

export type ModelCandidate = ModelRevisionCandidate | ModelClaimCandidate;

export const legacyReviewArtifactProvenance = {
  reviewId: "legacy-project-review",
  linkId: "legacy-project-review-link",
  publicationId: "legacy-review-publication",
  generator: "kirjolab-review-synthesis",
  generatorSchema: "kirjolab-review-analysis-v1",
  publishedBy: "legacy-unattributed",
} as const;

export interface ProjectReviewLink {
  readonly id: string;
  readonly projectId: string;
  readonly reviewId: string;
  readonly reviewAccessLocator: string;
  readonly status: "active" | "unlinked";
  readonly createdBy: string;
  readonly createdAt: string;
  readonly unlinkedBy: string | null;
  readonly unlinkedAt: string | null;
}

export interface ReviewArtifactPin {
  readonly path: string;
  readonly reviewId: string;
  readonly linkId: string;
  readonly publicationId: string;
  readonly reviewRevision: number;
  readonly protocolRevision: number;
  readonly analysisDefinitionId: string;
  readonly analysisDefinitionRevision: number;
  readonly generator: string;
  readonly generatorSchema: string;
  readonly digest: string;
  readonly publishedBy: string;
  readonly generatedAt: string;
}

export interface WorkspaceSnapshot {
  id: string;
  title: string;
  entryFileId: string;
  files: ProjectFile[];
  folders: ProjectFolder[];
  assets: ProjectAsset[];
  composition: ProjectComposition;
  source: string;
  bibliography: string;
  revision: number;
  publicationProfile: ProjectPublicationProfile;
  pdfs: PdfResource[];
  publications: PublicationResource[];
  projectReferences: ProjectReferenceLink[];
  researchShares: ResearchShareSnapshot[];
  publicationPdfLinks: PublicationPdfLink[];
  annotations: AnnotationResource[];
  links: PassageLink[];
  claims: ClaimResource[];
  claimEvidenceLinks: ClaimEvidenceLink[];
  claimLinks: ClaimPassageLink[];
  comments: ManuscriptComment[];
  candidates: ModelCandidate[];
  reviewArtifactPins: ReviewArtifactPin[];
}

export type ApplyCandidateResult = { ok: true; snapshot: WorkspaceSnapshot } | { ok: false; error: string };

export interface CreateAnnotationInput {
  pdfId: string;
  page: number;
  quote: string;
  prefix: string;
  suffix: string;
  comment: string;
  rects: PdfSelectionRect[];
}

export interface AddAnnotationFragmentInput {
  page: number;
  quote: string;
  prefix: string;
  suffix: string;
  rects: PdfSelectionRect[];
}

export interface UpdateAnnotationInput {
  comment: string;
}

export interface UpdateAnnotationFragmentInput {
  quote: string;
  prefix: string;
  suffix: string;
  rects: PdfSelectionRect[];
}

export interface ManuscriptPassageInput {
  fileId: string;
  start: number;
  end: number;
  excerpt: string;
  sourceRevision: number;
}

export interface CreateAnnotationLinkInput {
  annotation: CreateAnnotationInput;
  passage: ManuscriptPassageInput;
}

export interface AnnotationLinkResult {
  annotation: AnnotationResource;
  link: PassageLink;
}

export interface CreateWorkspaceInput {
  title: string;
  templateId?: string;
}

export interface InviteWorkspaceMemberInput {
  email: string;
}

export interface ImportBibliographyInput {
  bibtex: string;
}

export interface CreatePublicationPdfLinkInput {
  publicationId: string;
  pdfId: string;
}

export interface PublicationEnrichment {
  type?: string;
  title: string;
  authors: string[];
  year: string;
  venue: string;
  doi: string;
  url: string;
  abstract: string;
}

export interface PreviewPublicationIntakeInput {
  pdfId: string;
  doi: string;
}

export interface AcceptPublicationIntakeInput extends PreviewPublicationIntakeInput {
  citationKey: string;
  metadataFingerprint: string;
}

export interface PublicationIntakePreview {
  pdfId: string;
  doi: string;
  metadata: PublicationEnrichment;
  metadataFingerprint: string;
  citationKey: string;
  existingPublicationId: string | null;
}

export interface PublicationIntakeResult {
  publication: PublicationResource;
  link: PublicationPdfLink;
  publicationCreated: boolean;
  linkCreated: boolean;
}

export interface CreatePassageLinkInput extends ManuscriptPassageInput {
  annotationId: string;
}

export interface ClaimEvidenceInput {
  annotationId: string;
  relation: ClaimEvidenceRelation;
}

export interface UpsertClaimInput {
  text: string;
  note: string;
  evidence: ClaimEvidenceInput[];
}

export interface CreateClaimPassageLinkInput extends ManuscriptPassageInput {
  claimId: string;
}

export interface CreateManuscriptCommentInput extends ManuscriptPassageInput {
  body: string;
}

export type ReanchorManuscriptCommentInput = ManuscriptPassageInput;

export interface CreateCandidateInput {
  providerAdapter: "openai-compatible";
  providerLabel: string;
  model: string;
  promptVersion: "revise-selection-v1";
  instruction: string;
  target: ManuscriptPassageInput;
  evidence: ModelEvidenceReference[];
  proposedReplacement: string;
}

export interface CreateClaimCandidateInput {
  providerAdapter: "openai-compatible";
  providerLabel: string;
  model: string;
  promptVersion: "draft-claim-v1";
  instruction: string;
  relation: ClaimEvidenceRelation;
  evidence: Array<Extract<ModelEvidenceReference, { kind: "annotation" }>>;
  proposedText: string;
  proposedNote: string;
}

export function isCreateAnnotationInput(value: unknown): value is CreateAnnotationInput {
  if (!isRecord(value)) return false;

  return (
    isStringWithin(value.pdfId, 128, true) &&
    Number.isInteger(value.page) &&
    typeof value.page === "number" &&
    value.page > 0 &&
    isStringWithin(value.quote, 20_000, true) &&
    isStringWithin(value.prefix, 2_000) &&
    isStringWithin(value.suffix, 2_000) &&
    isStringWithin(value.comment, 4_000) &&
    Array.isArray(value.rects) &&
    value.rects.length <= 64 &&
    value.rects.every(isPdfSelectionRect)
  );
}

export function isAddAnnotationFragmentInput(value: unknown): value is AddAnnotationFragmentInput {
  return (
    isRecord(value) &&
    Number.isInteger(value.page) &&
    typeof value.page === "number" &&
    value.page > 0 &&
    isStringWithin(value.quote, 20_000, true) &&
    isStringWithin(value.prefix, 2_000) &&
    isStringWithin(value.suffix, 2_000) &&
    Array.isArray(value.rects) &&
    value.rects.length > 0 &&
    value.rects.length <= 64 &&
    value.rects.every(isPdfSelectionRect)
  );
}

export function isUpdateAnnotationInput(value: unknown): value is UpdateAnnotationInput {
  return isRecord(value) && isStringWithin(value.comment, 4_000);
}

export function isUpdateAnnotationFragmentInput(value: unknown): value is UpdateAnnotationFragmentInput {
  return (
    isRecord(value) &&
    isStringWithin(value.quote, 20_000, true) &&
    isStringWithin(value.prefix, 2_000) &&
    isStringWithin(value.suffix, 2_000) &&
    Array.isArray(value.rects) &&
    value.rects.length > 0 &&
    value.rects.length <= 64 &&
    value.rects.every(isPdfSelectionRect)
  );
}

export function isCreateAnnotationLinkInput(value: unknown): value is CreateAnnotationLinkInput {
  return isRecord(value) && isCreateAnnotationInput(value.annotation) && isManuscriptPassageInput(value.passage);
}

export function isCreateWorkspaceInput(value: unknown): value is CreateWorkspaceInput {
  return (
    isRecord(value) &&
    isStringWithin(value.title, 120, true) &&
    (value.templateId === undefined || isStringWithin(value.templateId, 64, true))
  );
}

export function isInviteWorkspaceMemberInput(value: unknown): value is InviteWorkspaceMemberInput {
  return isRecord(value) && isEmail(value.email);
}

export function isImportBibliographyInput(value: unknown): value is ImportBibliographyInput {
  return isRecord(value) && isStringWithin(value.bibtex, 2_000_000, true);
}

export function isCreatePublicationPdfLinkInput(value: unknown): value is CreatePublicationPdfLinkInput {
  return isRecord(value) && isStringWithin(value.publicationId, 128, true) && isStringWithin(value.pdfId, 128, true);
}

export function isPreviewPublicationIntakeInput(value: unknown): value is PreviewPublicationIntakeInput {
  return isRecord(value) && isStringWithin(value.pdfId, 128, true) && isStringWithin(value.doi, 500, true);
}

export function isAcceptPublicationIntakeInput(value: unknown): value is AcceptPublicationIntakeInput {
  return (
    isPreviewPublicationIntakeInput(value) &&
    isRecord(value) &&
    isStringWithin(value.citationKey, 200, true) &&
    /^[a-z0-9:._+-]+$/iu.test(value.citationKey) &&
    typeof value.metadataFingerprint === "string" &&
    /^[a-f0-9]{64}$/u.test(value.metadataFingerprint)
  );
}

export function isPublicationIntakePreview(value: unknown): value is PublicationIntakePreview {
  return (
    isRecord(value) &&
    isStringWithin(value.pdfId, 128, true) &&
    isStringWithin(value.doi, 500, true) &&
    isPublicationEnrichment(value.metadata) &&
    typeof value.metadataFingerprint === "string" &&
    /^[a-f0-9]{64}$/u.test(value.metadataFingerprint) &&
    isStringWithin(value.citationKey, 200, true) &&
    (value.existingPublicationId === null || isStringWithin(value.existingPublicationId, 128, true))
  );
}

export function isWorkspaceMembers(value: unknown): value is WorkspaceMember[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        isStringWithin(item.id, 128, true) &&
        isEmail(item.email) &&
        (item.role === "owner" || item.role === "member") &&
        isNonEmptyString(item.addedAt),
    )
  );
}

export function isWorkspaceSummaries(value: unknown): value is WorkspaceSummary[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        isNonEmptyString(item.id) &&
        isNonEmptyString(item.title) &&
        isNonEmptyString(item.href) &&
        isNonEmptyString(item.createdAt) &&
        isNonEmptyString(item.updatedAt) &&
        (item.archivedAt === null || isNonEmptyString(item.archivedAt)),
    )
  );
}

export function isCreatePassageLinkInput(value: unknown): value is CreatePassageLinkInput {
  return isRecord(value) && isStringWithin(value.annotationId, 128, true) && isManuscriptPassageInput(value);
}

export function isCreateManuscriptCommentInput(value: unknown): value is CreateManuscriptCommentInput {
  return isRecord(value) && isManuscriptPassageInput(value) && isStringWithin(value.body, 8_000, true);
}

export function isReanchorManuscriptCommentInput(value: unknown): value is ReanchorManuscriptCommentInput {
  return isManuscriptPassageInput(value);
}

export function isUpsertClaimInput(value: unknown): value is UpsertClaimInput {
  if (!isRecord(value) || !isStringWithin(value.text, 2_000, true) || !isStringWithin(value.note, 8_000)) return false;
  if (!Array.isArray(value.evidence) || value.evidence.length === 0 || value.evidence.length > 20) return false;
  const annotationIds = new Set<string>();
  for (const evidence of value.evidence) {
    if (
      !isRecord(evidence) ||
      !isStringWithin(evidence.annotationId, 128, true) ||
      !isClaimEvidenceRelation(evidence.relation) ||
      annotationIds.has(evidence.annotationId)
    ) {
      return false;
    }
    annotationIds.add(evidence.annotationId);
  }
  return true;
}

export function isCreateClaimPassageLinkInput(value: unknown): value is CreateClaimPassageLinkInput {
  return isRecord(value) && isStringWithin(value.claimId, 128, true) && isManuscriptPassageInput(value);
}

export function isCreateCandidateInput(value: unknown): value is CreateCandidateInput {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "providerAdapter",
      "providerLabel",
      "model",
      "promptVersion",
      "instruction",
      "target",
      "evidence",
      "proposedReplacement",
    ])
  ) {
    return false;
  }

  return (
    value.providerAdapter === "openai-compatible" &&
    isStringWithin(value.providerLabel, 256, true) &&
    isStringWithin(value.model, 256, true) &&
    value.promptVersion === "revise-selection-v1" &&
    isStringWithin(value.instruction, 4_000, true) &&
    isManuscriptPassageInput(value.target) &&
    value.target.excerpt.length <= 20_000 &&
    isModelEvidenceReferences(value.evidence) &&
    isStringWithin(value.proposedReplacement, 50_000, true)
  );
}

export function isCreateClaimCandidateInput(value: unknown): value is CreateClaimCandidateInput {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "providerAdapter",
      "providerLabel",
      "model",
      "promptVersion",
      "instruction",
      "relation",
      "evidence",
      "proposedText",
      "proposedNote",
    ])
  ) {
    return false;
  }
  return (
    value.providerAdapter === "openai-compatible" &&
    isStringWithin(value.providerLabel, 256, true) &&
    isStringWithin(value.model, 256, true) &&
    value.promptVersion === "draft-claim-v1" &&
    isStringWithin(value.instruction, 4_000, true) &&
    isClaimEvidenceRelation(value.relation) &&
    isModelAnnotationEvidenceReferences(value.evidence) &&
    isStringWithin(value.proposedText, 2_000, true) &&
    isStringWithin(value.proposedNote, 8_000)
  );
}

export function isModelCandidate(value: unknown): value is ModelCandidate {
  if (!isRecord(value)) return false;
  if (value.operation === "draft-claim") return isModelClaimCandidate(value);
  return isModelRevisionCandidate(value);
}

function isModelRevisionCandidate(value: unknown): value is ModelRevisionCandidate {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "operation",
      "promptVersion",
      "providerAdapter",
      "providerLabel",
      "model",
      "instruction",
      "sourceRevision",
      "target",
      "evidence",
      "proposedReplacement",
      "status",
      "createdAt",
    ]) ||
    !isStringWithin(value.id, 128, true) ||
    value.operation !== "revise-selection" ||
    value.promptVersion !== "revise-selection-v1" ||
    value.providerAdapter !== "openai-compatible" ||
    !isStringWithin(value.providerLabel, 256, true) ||
    !isStringWithin(value.model, 256, true) ||
    !isStringWithin(value.instruction, 4_000, true) ||
    !isNonNegativeInteger(value.sourceRevision) ||
    !isModelCandidateTarget(value.target, value.sourceRevision) ||
    !isModelEvidenceSnapshots(value.evidence) ||
    !isStringWithin(value.proposedReplacement, 50_000, true) ||
    !isCandidateStatus(value.status) ||
    !isStringWithin(value.createdAt, 128, true)
  ) {
    return false;
  }
  return true;
}

function isModelClaimCandidate(value: unknown): value is ModelClaimCandidate {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "id",
      "operation",
      "promptVersion",
      "providerAdapter",
      "providerLabel",
      "model",
      "instruction",
      "relation",
      "evidence",
      "proposedText",
      "proposedNote",
      "status",
      "createdAt",
    ]) &&
    isStringWithin(value.id, 128, true) &&
    value.operation === "draft-claim" &&
    value.promptVersion === "draft-claim-v1" &&
    value.providerAdapter === "openai-compatible" &&
    isStringWithin(value.providerLabel, 256, true) &&
    isStringWithin(value.model, 256, true) &&
    isStringWithin(value.instruction, 4_000, true) &&
    isClaimEvidenceRelation(value.relation) &&
    isModelAnnotationEvidenceSnapshots(value.evidence) &&
    isStringWithin(value.proposedText, 2_000, true) &&
    isStringWithin(value.proposedNote, 8_000) &&
    isCandidateStatus(value.status) &&
    isStringWithin(value.createdAt, 128, true)
  );
}

export function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.entryFileId) &&
    Array.isArray(value.files) &&
    value.files.every(isProjectFile) &&
    Array.isArray(value.folders) &&
    value.folders.every(isProjectFolder) &&
    Array.isArray(value.assets) &&
    value.assets.every(isProjectAsset) &&
    isProjectComposition(value.composition) &&
    typeof value.source === "string" &&
    typeof value.bibliography === "string" &&
    typeof value.revision === "number" &&
    isProjectPublicationProfile(value.publicationProfile) &&
    Array.isArray(value.pdfs) &&
    Array.isArray(value.publications) &&
    Array.isArray(value.projectReferences) &&
    value.projectReferences.every(isProjectReferenceLink) &&
    Array.isArray(value.researchShares) &&
    value.researchShares.every(isResearchShareSnapshot) &&
    Array.isArray(value.publicationPdfLinks) &&
    value.publicationPdfLinks.every(isPublicationPdfLink) &&
    Array.isArray(value.annotations) &&
    Array.isArray(value.links) &&
    value.links.every(isPassageLink) &&
    Array.isArray(value.claims) &&
    value.claims.every(isClaimResource) &&
    Array.isArray(value.claimEvidenceLinks) &&
    value.claimEvidenceLinks.every(isClaimEvidenceLink) &&
    Array.isArray(value.claimLinks) &&
    value.claimLinks.every(isClaimPassageLink) &&
    Array.isArray(value.comments) &&
    value.comments.every(isManuscriptComment) &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isModelCandidate) &&
    Array.isArray(value.reviewArtifactPins) &&
    value.reviewArtifactPins.every(isReviewArtifactPin)
  );
}

export function isReviewArtifactPin(value: unknown): value is ReviewArtifactPin {
  if (!isRecord(value)) return false;
  const path = typeof value.path === "string" ? normalizeProjectPath(value.path) : null;
  const generatedAt = typeof value.generatedAt === "string" ? new Date(value.generatedAt) : null;
  if (path === null || generatedAt === null) return false;
  return (
    hasExactKeys(value, [
      "path",
      "reviewId",
      "linkId",
      "publicationId",
      "reviewRevision",
      "protocolRevision",
      "analysisDefinitionId",
      "analysisDefinitionRevision",
      "generator",
      "generatorSchema",
      "digest",
      "publishedBy",
      "generatedAt",
    ]) &&
    path === value.path &&
    path.startsWith("review/") &&
    path.endsWith(".md") &&
    isTrimmedBoundedString(value.reviewId, 128) &&
    isTrimmedBoundedString(value.linkId, 128) &&
    isTrimmedBoundedString(value.publicationId, 128) &&
    isPositiveInteger(value.reviewRevision) &&
    isPositiveInteger(value.protocolRevision) &&
    isStringWithin(value.analysisDefinitionId, 128, true) &&
    value.analysisDefinitionId === value.analysisDefinitionId.trim() &&
    isPositiveInteger(value.analysisDefinitionRevision) &&
    isTrimmedBoundedString(value.generator, 128) &&
    isTrimmedBoundedString(value.generatorSchema, 128) &&
    typeof value.digest === "string" &&
    /^[a-f0-9]{64}$/u.test(value.digest) &&
    isTrimmedBoundedString(value.publishedBy, 320) &&
    Number.isFinite(generatedAt.getTime()) &&
    generatedAt.toISOString() === value.generatedAt
  );
}

export function canonicalReviewArtifactPath(reviewId: string, artifactId: string): string | null {
  if (!/^[a-z0-9-]{1,128}$/u.test(reviewId) || !/^[a-z0-9_-]{1,80}$/u.test(artifactId)) return null;
  return `review/${reviewId}/${artifactId}.md`;
}

export function isCanonicalReviewArtifactPath(path: string, reviewId: string): boolean {
  const match = /^review\/([a-z0-9-]{1,128})\/([a-z0-9_-]{1,80})\.md$/u.exec(path);
  return Boolean(match?.[1] === reviewId && match[2] && canonicalReviewArtifactPath(reviewId, match[2]) === path);
}

export function isProjectReviewLink(value: unknown): value is ProjectReviewLink {
  if (!isRecord(value)) return false;
  const createdAt = typeof value.createdAt === "string" ? new Date(value.createdAt) : null;
  const unlinkedAt = typeof value.unlinkedAt === "string" ? new Date(value.unlinkedAt) : null;
  return (
    hasExactKeys(value, [
      "id",
      "projectId",
      "reviewId",
      "reviewAccessLocator",
      "status",
      "createdBy",
      "createdAt",
      "unlinkedBy",
      "unlinkedAt",
    ]) &&
    isTrimmedBoundedString(value.id, 128) &&
    isTrimmedBoundedString(value.projectId, 128) &&
    isTrimmedBoundedString(value.reviewId, 128) &&
    isTrimmedBoundedString(value.reviewAccessLocator, 256) &&
    (value.status === "active" || value.status === "unlinked") &&
    isTrimmedBoundedString(value.createdBy, 320) &&
    createdAt !== null &&
    Number.isFinite(createdAt.getTime()) &&
    createdAt.toISOString() === value.createdAt &&
    (value.status === "active"
      ? value.unlinkedBy === null && value.unlinkedAt === null
      : isTrimmedBoundedString(value.unlinkedBy, 320) &&
        unlinkedAt !== null &&
        Number.isFinite(unlinkedAt.getTime()) &&
        unlinkedAt.toISOString() === value.unlinkedAt)
  );
}

function isProjectAsset(value: unknown): value is ProjectAsset {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.path) &&
    ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/svg+xml"].includes(String(value.mediaType)) &&
    Number.isSafeInteger(value.size) &&
    Number(value.size) > 0 &&
    isNonEmptyString(value.objectKey) &&
    isNonEmptyString(value.fingerprint) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt)
  );
}

function isProjectFolder(value: unknown): value is ProjectFolder {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.path) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt)
  );
}

export function isProjectPublicationProfile(value: unknown): value is ProjectPublicationProfile {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["citationStyle", "locale", "submissionTemplate", "paperSize"]) &&
    (value.citationStyle === "apa" || value.citationStyle === "chicago-author-date" || value.citationStyle === "ieee") &&
    (value.locale === "en-US" || value.locale === "en-GB" || value.locale === "fi-FI") &&
    (value.submissionTemplate === "article" ||
      value.submissionTemplate === "preprint" ||
      value.submissionTemplate === "anonymous-review" ||
      value.submissionTemplate === "journal-two-column") &&
    (value.paperSize === "a4" || value.paperSize === "letter")
  );
}

function isResearchShareSnapshot(value: unknown): value is ResearchShareSnapshot {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "projectId", "referenceId", "resourceId", "kind", "content", "createdAt", "revokedAt"]) &&
    isStringWithin(value.id, 128, true) &&
    isStringWithin(value.projectId, 128, true) &&
    isStringWithin(value.referenceId, 128, true) &&
    isStringWithin(value.resourceId, 128, true) &&
    (value.kind === "artifact" || value.kind === "note" || value.kind === "highlight" || value.kind === "web-snapshot") &&
    isRecord(value.content) &&
    isStringWithin(value.createdAt, 128, true) &&
    (value.revokedAt === null || isStringWithin(value.revokedAt, 128, true))
  );
}

function isProjectReferenceLink(value: unknown): value is ProjectReferenceLink {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "referenceId", "citationAlias", "snapshot", "createdAt", "updatedAt"]) &&
    isStringWithin(value.id, 128, true) &&
    isStringWithin(value.referenceId, 128, true) &&
    isStringWithin(value.citationAlias, 128, true) &&
    isRecord(value.snapshot) &&
    isStringWithin(value.createdAt, 128, true) &&
    isStringWithin(value.updatedAt, 128, true)
  );
}

function isProjectFile(value: unknown): value is ProjectFile {
  return (
    isRecord(value) &&
    (hasExactKeys(value, ["id", "path", "mediaType", "content", "createdAt", "updatedAt"]) ||
      hasExactKeys(value, ["id", "path", "mediaType", "content", "collaborationTextName", "createdAt", "updatedAt"])) &&
    isStringWithin(value.id, 128, true) &&
    isStringWithin(value.path, 1_024, true) &&
    value.mediaType === "text/markdown" &&
    isStringWithin(value.content, 2_000_000) &&
    (value.collaborationTextName === undefined || isStringWithin(value.collaborationTextName, 256, true)) &&
    isStringWithin(value.createdAt, 128, true) &&
    isStringWithin(value.updatedAt, 128, true)
  );
}

function isProjectComposition(value: unknown): value is ProjectComposition {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["content", "sourceMap", "diagnostics", "dependencies"]) &&
    typeof value.content === "string" &&
    Array.isArray(value.sourceMap) &&
    Array.isArray(value.diagnostics) &&
    isRecord(value.dependencies)
  );
}

function isModelEvidenceReferences(value: unknown): value is ModelEvidenceReference[] {
  if (!Array.isArray(value) || value.length > 12) return false;
  return hasUniqueModelEvidence(value, isModelEvidenceReference);
}

function isModelAnnotationEvidenceReferences(value: unknown): value is Array<Extract<ModelEvidenceReference, { kind: "annotation" }>> {
  return (
    Array.isArray(value) && value.length > 0 && value.length <= 12 && hasUniqueModelEvidence(value, isModelAnnotationEvidenceReference)
  );
}

function isModelAnnotationEvidenceReference(value: unknown): value is Extract<ModelEvidenceReference, { kind: "annotation" }> {
  return isModelEvidenceReference(value) && value.kind === "annotation";
}

function isModelEvidenceReference(value: unknown): value is ModelEvidenceReference {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["kind", "id", "version"]) &&
    (value.kind === "annotation" || value.kind === "claim") &&
    isStringWithin(value.id, 128, true) &&
    isStringWithin(value.version, 128, true)
  );
}

function isModelCandidateTarget(value: unknown, sourceRevision: number): value is ModelCandidateTarget {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["anchor", "resolution"]) ||
    !isManuscriptAnchorSelector(value.anchor) ||
    !isManuscriptAnchorResolution(value.resolution) ||
    value.anchor.exact.length > 20_000 ||
    value.anchor.anchoredRevision !== sourceRevision
  ) {
    return false;
  }
  if (value.resolution.status === "stale") return true;
  return value.resolution.exactMatch === (value.resolution.text === value.anchor.exact);
}

function isModelEvidenceSnapshots(value: unknown): value is ModelEvidence[] {
  if (!Array.isArray(value) || value.length > 12) return false;
  return hasUniqueModelEvidence(value, isModelEvidenceSnapshot);
}

function isModelAnnotationEvidenceSnapshots(value: unknown): value is ModelAnnotationEvidence[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 12 && hasUniqueModelEvidence(value, isModelAnnotationEvidence);
}

function hasUniqueModelEvidence<T extends ModelEvidenceReference | ModelEvidence>(
  value: readonly unknown[],
  guard: (item: unknown) => item is T,
): value is T[] {
  const identities = new Set<string>();
  for (const item of value) {
    if (!guard(item)) return false;
    const identity = `${item.kind}:${item.id}`;
    if (identities.has(identity)) return false;
    identities.add(identity);
  }
  return true;
}

function isModelEvidenceSnapshot(value: unknown): value is ModelEvidence {
  if (!isRecord(value)) return false;
  if (value.kind === "annotation") return isModelAnnotationEvidence(value);
  if (value.kind === "claim") return isModelClaimEvidence(value);
  return false;
}

function isModelAnnotationEvidence(value: unknown): value is ModelAnnotationEvidence {
  if (!isRecord(value)) return false;
  return (
    hasExactKeys(value, [
      "kind",
      "id",
      "version",
      "pdfId",
      "page",
      "quote",
      "prefix",
      "suffix",
      "comment",
      "rects",
      "createdAt",
      "updatedAt",
    ]) &&
    value.kind === "annotation" &&
    isStringWithin(value.id, 128, true) &&
    isStringWithin(value.version, 128, true) &&
    isStringWithin(value.pdfId, 128, true) &&
    isPositiveInteger(value.page) &&
    isStringWithin(value.quote, 20_000, true) &&
    isStringWithin(value.prefix, 2_000) &&
    isStringWithin(value.suffix, 2_000) &&
    isStringWithin(value.comment, 4_000) &&
    Array.isArray(value.rects) &&
    value.rects.length <= 64 &&
    value.rects.every(isPdfSelectionRect) &&
    isStringWithin(value.createdAt, 128, true) &&
    isStringWithin(value.updatedAt, 128, true) &&
    value.version === value.updatedAt
  );
}

function isModelClaimEvidence(value: unknown): value is ModelClaimEvidence {
  if (!isRecord(value)) return false;
  return (
    hasExactKeys(value, ["kind", "id", "version", "text", "note", "createdAt", "updatedAt"]) &&
    value.kind === "claim" &&
    isStringWithin(value.id, 128, true) &&
    isStringWithin(value.version, 128, true) &&
    isStringWithin(value.text, 2_000, true) &&
    isStringWithin(value.note, 8_000) &&
    isStringWithin(value.createdAt, 128, true) &&
    isStringWithin(value.updatedAt, 128, true) &&
    value.version === value.updatedAt
  );
}

function isCandidateStatus(value: unknown): value is CandidateStatus {
  return value === "pending" || value === "accepted" || value === "rejected";
}

function isPublicationPdfLink(value: unknown): value is PublicationPdfLink {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.publicationId) &&
    isNonEmptyString(value.pdfId) &&
    isNonEmptyString(value.createdAt)
  );
}

function isManuscriptPassageInput(value: unknown): value is ManuscriptPassageInput {
  return (
    isRecord(value) &&
    isStringWithin(value.fileId, 128, true) &&
    Number.isInteger(value.start) &&
    Number.isInteger(value.end) &&
    typeof value.start === "number" &&
    typeof value.end === "number" &&
    value.start >= 0 &&
    value.end > value.start &&
    isStringWithin(value.excerpt, 50_000, true) &&
    isNonNegativeInteger(value.sourceRevision)
  );
}

function isClaimEvidenceRelation(value: unknown): value is ClaimEvidenceRelation {
  return value === "supports" || value === "contradicts" || value === "extends";
}

function isPublicationEnrichment(value: unknown): value is PublicationEnrichment {
  return (
    isRecord(value) &&
    (value.type === undefined || isStringWithin(value.type, 32, true)) &&
    isStringWithin(value.title, 2_000, true) &&
    Array.isArray(value.authors) &&
    value.authors.length <= 100 &&
    value.authors.every((author) => isStringWithin(author, 500, true)) &&
    isStringWithin(value.year, 32) &&
    isStringWithin(value.venue, 2_000) &&
    isStringWithin(value.doi, 500, true) &&
    isStringWithin(value.url, 2_000) &&
    isStringWithin(value.abstract, 20_000)
  );
}

function isClaimResource(value: unknown): value is ClaimResource {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isStringWithin(value.text, 2_000, true) &&
    isStringWithin(value.note, 8_000) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt)
  );
}

function isClaimEvidenceLink(value: unknown): value is ClaimEvidenceLink {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.claimId) &&
    isNonEmptyString(value.annotationId) &&
    isClaimEvidenceRelation(value.relation) &&
    isNonEmptyString(value.createdAt)
  );
}

function isClaimPassageLink(value: unknown): value is ClaimPassageLink {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.claimId) &&
    isManuscriptAnchorSelector(value.anchor) &&
    isManuscriptAnchorResolution(value.resolution) &&
    isNonEmptyString(value.createdAt)
  );
}

function isManuscriptComment(value: unknown): value is ManuscriptComment {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "authorId", "authorLabel", "body", "anchor", "resolution", "status", "createdAt", "updatedAt"]) &&
    isStringWithin(value.id, 128, true) &&
    isStringWithin(value.authorId, 128, true) &&
    isStringWithin(value.authorLabel, 320, true) &&
    isStringWithin(value.body, 8_000, true) &&
    isManuscriptAnchorSelector(value.anchor) &&
    isManuscriptAnchorResolution(value.resolution) &&
    (value.status === "open" || value.status === "resolved") &&
    isStringWithin(value.createdAt, 128, true) &&
    isStringWithin(value.updatedAt, 128, true)
  );
}

function isPassageLink(value: unknown): value is PassageLink {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.annotationId) &&
    isManuscriptAnchorSelector(value.anchor) &&
    isManuscriptAnchorResolution(value.resolution) &&
    isNonEmptyString(value.createdAt)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringWithin(value: unknown, maximumLength: number, required = false): value is string {
  return typeof value === "string" && value.length <= maximumLength && (!required || value.trim().length > 0);
}

function isTrimmedBoundedString(value: unknown, maximumLength: number): value is string {
  return isStringWithin(value, maximumLength, true) && value === value.trim();
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function isPdfSelectionRect(value: unknown): value is PdfSelectionRect {
  if (!isRecord(value)) return false;
  const coordinates = [value.x, value.y, value.width, value.height];
  return (
    coordinates.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)) &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    value.x >= 0 &&
    value.y >= 0 &&
    value.width > 0 &&
    value.height > 0 &&
    value.x + value.width <= 1.000_001 &&
    value.y + value.height <= 1.000_001
  );
}
