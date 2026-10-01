import * as v from "valibot";
import {
  isManuscriptAnchorResolution,
  isManuscriptAnchorSelector,
  type ManuscriptAnchorResolution,
  type ManuscriptAnchorSelector,
} from "../manuscript/manuscript-anchor";
import {
  isProjectPublicationProfile,
  isReviewArtifactPin,
  type ProjectPublicationProfile,
  type ReviewArtifactPin,
} from "../workspace/workspace";

const text = (max: number) => v.pipe(v.string(), v.maxLength(max));
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(128));
const stamp = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(128),
  v.check((value) => Number.isFinite(Date.parse(value))),
);
const integer = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const positive = v.pipe(integer, v.minValue(1));
const list = <T extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(schema: T, max = 10_000) =>
  v.pipe(v.array(schema), v.maxLength(max));
const path = text(1_024);
const dates = { createdAt: stamp, updatedAt: stamp };
const anchor = v.custom<ManuscriptAnchorSelector>(isManuscriptAnchorSelector);
const resolution = v.custom<ManuscriptAnchorResolution>(isManuscriptAnchorResolution);
const coordinate = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1));
const rectangle = v.pipe(
  v.strictObject({
    x: coordinate,
    y: coordinate,
    width: v.pipe(coordinate, v.minValue(Number.EPSILON)),
    height: v.pipe(coordinate, v.minValue(Number.EPSILON)),
  }),
  v.check((rect) => rect.x + rect.width <= 1.000_001 && rect.y + rect.height <= 1.000_001),
);
const fragment = v.strictObject({
  id,
  quote: text(50_000),
  prefix: text(256),
  suffix: text(256),
  rects: list(rectangle, 1_000),
  createdAt: stamp,
});
const webCitation = v.strictObject({
  id,
  accessedAt: stamp,
  finalUrl: text(4_096),
  contentHash: text(128),
  complete: v.boolean(),
  diagnostics: list(text(2_000), 128),
});
const bibliographyFields = {
  type: text(100),
  title: text(2_000),
  authors: list(text(500), 100),
  year: text(100),
  venue: text(2_000),
  doi: text(500),
  url: text(4_096),
};
const bibliographicSnapshot = v.strictObject({
  referenceId: id,
  ...bibliographyFields,
  capturedAt: stamp,
  tombstone: v.boolean(),
  webSnapshot: v.nullable(webCitation),
});
const sharedContent = v.union([
  v.strictObject({
    kind: v.literal("artifact"),
    name: text(255),
    size: v.pipe(positive, v.maxValue(25 * 1024 * 1024)),
    fingerprint: text(256),
    objectKey: path,
  }),
  v.strictObject({ kind: v.literal("note"), body: text(50_000) }),
  v.strictObject({ kind: v.literal("highlight"), page: positive, quote: text(50_000), comment: text(50_000) }),
  v.strictObject({
    kind: v.literal("web-snapshot"),
    snapshotId: id,
    accessedAt: stamp,
    finalUrl: text(4_096),
    contentHash: text(128),
    rawObjectKey: v.nullable(path),
    readableObjectKey: v.nullable(path),
    complete: v.boolean(),
    diagnostics: list(text(2_000), 128),
  }),
]);

export const projectArchiveSchemaVersion = "kirjolab-project-v1" as const;
export const projectArchiveStateSchema = v.strictObject({
  id,
  title: v.pipe(text(120), v.minLength(1)),
  revision: integer,
  entryFileId: id,
  files: list(v.strictObject({ id, path, mediaType: v.literal("text/markdown"), content: text(2_000_000), ...dates }), 512),
  folders: list(v.strictObject({ id, path, ...dates }), 1_024),
  assets: list(
    v.strictObject({
      id,
      path,
      mediaType: v.picklist(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/svg+xml"]),
      size: v.pipe(positive, v.maxValue(20 * 1024 * 1024)),
      objectKey: path,
      fingerprint: text(256),
      ...dates,
    }),
    512,
  ),
  pdfs: list(
    v.strictObject({
      id,
      name: text(255),
      contentType: v.literal("application/pdf"),
      size: v.pipe(positive, v.maxValue(25 * 1024 * 1024)),
      objectKey: path,
      fingerprint: text(256),
      createdAt: stamp,
    }),
    512,
  ),
  bibliography: text(2_000_000),
  publicationProfile: v.custom<ProjectPublicationProfile>(isProjectPublicationProfile),
  publications: list(
    v.strictObject({
      id,
      citationKey: id,
      ...bibliographyFields,
      abstract: text(20_000),
      metadataSource: v.picklist(["bibtex", "crossref"]),
      ...dates,
    }),
    512,
  ),
  projectReferences: list(v.strictObject({ id, referenceId: id, citationAlias: id, snapshot: bibliographicSnapshot, ...dates }), 512),
  researchShares: list(
    v.strictObject({
      id,
      projectId: id,
      referenceId: id,
      resourceId: id,
      kind: v.picklist(["artifact", "note", "highlight", "web-snapshot"]),
      content: sharedContent,
      createdAt: stamp,
      revokedAt: v.nullable(stamp),
    }),
    512,
  ),
  publicationPdfLinks: list(v.strictObject({ id, publicationId: id, pdfId: id, createdAt: stamp })),
  annotations: list(
    v.strictObject({
      id,
      pdfId: id,
      page: positive,
      quote: text(50_000),
      prefix: text(256),
      suffix: text(256),
      comment: text(50_000),
      rects: list(rectangle, 1_000),
      fragments: list(fragment, 1_000),
      ...dates,
    }),
  ),
  links: list(v.strictObject({ id, annotationId: id, anchor, resolution, createdAt: stamp })),
  claims: list(v.strictObject({ id, text: text(2_000), note: text(8_000), ...dates })),
  claimEvidenceLinks: list(
    v.strictObject({ id, claimId: id, annotationId: id, relation: v.picklist(["supports", "contradicts", "extends"]), createdAt: stamp }),
  ),
  claimLinks: list(v.strictObject({ id, claimId: id, anchor, resolution, createdAt: stamp })),
  comments: list(
    v.strictObject({
      id,
      authorId: id,
      authorLabel: text(320),
      body: text(8_000),
      anchor,
      resolution,
      status: v.picklist(["open", "resolved"]),
      ...dates,
    }),
  ),
  reviewArtifactPins: list(v.custom<ReviewArtifactPin>(isReviewArtifactPin), 512),
});

export type ProjectArchiveState = v.InferOutput<typeof projectArchiveStateSchema>;
export const projectArchiveManifestSchema = v.strictObject({
  schemaVersion: v.literal(projectArchiveSchemaVersion),
  scope: v.literal("current-project"),
  sourceProjectId: id,
  sourceRevision: integer,
  exclusions: list(text(2_000), 128),
  payloads: list(v.strictObject({ id: text(256), path, bytes: integer, sha256: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u)) }), 1_023),
});
export type ProjectArchiveManifest = v.InferOutput<typeof projectArchiveManifestSchema>;
