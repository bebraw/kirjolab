import * as Y from "yjs";
import { createManuscriptAnchor, type StoredManuscriptAnchor } from "../manuscript/manuscript-anchor";
import type { ManuscriptAnchorResolution, ManuscriptAnchorSelector } from "../workspace/workspace";
import type { ProjectArchiveState } from "./project-archive-schema";

export function projectArchiveIdentityProvenance(source: ProjectArchiveState, destination: ProjectArchiveState): string {
  const identities: Array<readonly [string, string, string]> = [];
  for (const kind of [
    "files",
    "folders",
    "assets",
    "pdfs",
    "publications",
    "projectReferences",
    "researchShares",
    "annotations",
    "links",
    "claims",
    "claimEvidenceLinks",
    "claimLinks",
    "comments",
    "publicationPdfLinks",
  ] as const) {
    for (const [index, resource] of source[kind].entries()) identities.push([kind, resource.id, destination[kind][index]!.id]);
  }
  for (const [index, link] of source.projectReferences.entries())
    identities.push(["reference", link.referenceId, destination.projectReferences[index]!.referenceId]);
  for (const [index, annotation] of source.annotations.entries()) {
    for (const [fragmentIndex, fragment] of annotation.fragments.entries())
      identities.push(["fragment", fragment.id, destination.annotations[index]!.fragments[fragmentIndex]!.id]);
  }
  const json = JSON.stringify(identities);
  if (new TextEncoder().encode(json).byteLength > 8 * 1024 * 1024) throw new Error("Project identity provenance exceeds 8 MiB");
  return json;
}

export function replaceProjectArchiveBinaries(
  project: ProjectArchiveState,
  keys: ReadonlyMap<string, { objectKey: string; fingerprint: string }>,
): ProjectArchiveState {
  const binary = (key: string) => {
    const value = keys.get(key);
    if (!value) throw new Error("Project binary was not stored");
    return value;
  };
  return {
    ...project,
    assets: project.assets.map((asset) => ({ ...asset, ...binary(asset.objectKey) })),
    pdfs: project.pdfs.map((pdf) => ({ ...pdf, ...binary(pdf.objectKey) })),
    researchShares: project.researchShares.map((share) => ({
      ...share,
      content:
        share.content.kind === "artifact"
          ? { ...share.content, ...(share.content.objectKey ? binary(share.content.objectKey) : {}) }
          : share.content.kind === "web-snapshot"
            ? {
                ...share.content,
                rawObjectKey: share.content.rawObjectKey ? binary(share.content.rawObjectKey).objectKey : null,
                readableObjectKey: share.content.readableObjectKey ? binary(share.content.readableObjectKey).objectKey : null,
              }
            : share.content,
    })),
  };
}

export function remapProjectArchive(
  source: ProjectArchiveState,
  projectId: string,
  referenceIds: ReadonlyMap<string, string>,
  binaryKeys: ReadonlyMap<string, { readonly objectKey: string; readonly fingerprint: string }>,
  allocateId: () => string = () => crypto.randomUUID(),
): ProjectArchiveState {
  const ids = new Map<string, string>();
  const id = (kind: string, original: string): string => {
    const key = `${kind}:${original}`;
    let mapped = ids.get(key);
    if (!mapped) {
      mapped = allocateId();
      ids.set(key, mapped);
    }
    return mapped;
  };
  const reference = (original: string): string => referenceIds.get(original) ?? id("publication", original);
  const binary = (pointer: string) => {
    const replacement = binaryKeys.get(pointer);
    if (!replacement) throw new Error("Project binary was not stored");
    return replacement;
  };
  const anchor = (value: ManuscriptAnchorSelector): ManuscriptAnchorSelector => ({
    ...value,
    fileId: id("file", value.fileId),
    relativeStart: null,
    relativeEnd: null,
    anchoredRevision: 0,
  });
  return {
    ...source,
    id: projectId,
    revision: 0,
    entryFileId: id("file", source.entryFileId),
    files: source.files.map((file) => ({ ...file, id: id("file", file.id) })),
    folders: source.folders.map((folder) => ({ ...folder, id: id("folder", folder.id) })),
    assets: source.assets.map((asset) => ({ ...asset, id: id("asset", asset.id), ...binary(asset.objectKey) })),
    pdfs: source.pdfs.map((pdf) => ({ ...pdf, id: id("pdf", pdf.id), ...binary(pdf.objectKey) })),
    projectReferences: source.projectReferences.map((link) => ({
      ...link,
      id: id("reference-link", link.id),
      referenceId: reference(link.referenceId),
      snapshot: { ...link.snapshot, referenceId: reference(link.referenceId) },
    })),
    publications: source.publications.map((publication) => ({ ...publication, id: reference(publication.id) })),
    publicationPdfLinks: source.publicationPdfLinks.map((link) => ({
      ...link,
      id: id("pdf-link", link.id),
      publicationId: reference(link.publicationId),
      pdfId: id("pdf", link.pdfId),
    })),
    annotations: source.annotations.map((annotation) => ({
      ...annotation,
      id: id("annotation", annotation.id),
      pdfId: id("pdf", annotation.pdfId),
      fragments: annotation.fragments.map((fragment) => ({ ...fragment, id: id("fragment", fragment.id) })),
    })),
    claims: source.claims.map((claim) => ({ ...claim, id: id("claim", claim.id) })),
    claimEvidenceLinks: source.claimEvidenceLinks.map((link) => ({
      ...link,
      id: id("evidence-link", link.id),
      claimId: id("claim", link.claimId),
      annotationId: id("annotation", link.annotationId),
    })),
    links: source.links.map((link) => ({
      ...link,
      id: id("passage-link", link.id),
      annotationId: id("annotation", link.annotationId),
      anchor: anchor(link.anchor),
    })),
    claimLinks: source.claimLinks.map((link) => ({
      ...link,
      id: id("claim-passage", link.id),
      claimId: id("claim", link.claimId),
      anchor: anchor(link.anchor),
    })),
    comments: source.comments.map((comment) => ({ ...comment, id: id("comment", comment.id), anchor: anchor(comment.anchor) })),
    researchShares: source.researchShares.map((share) => ({
      ...share,
      id: id("share", share.id),
      projectId,
      referenceId: reference(share.referenceId),
      resourceId: id("shared-resource", share.resourceId),
      content:
        share.content.kind === "artifact"
          ? { ...share.content, ...(share.content.objectKey ? binary(share.content.objectKey) : {}) }
          : share.content.kind === "web-snapshot"
            ? {
                ...share.content,
                rawObjectKey: share.content.rawObjectKey ? binary(share.content.rawObjectKey).objectKey : null,
                readableObjectKey: share.content.readableObjectKey ? binary(share.content.readableObjectKey).objectKey : null,
              }
            : share.content,
    })),
  };
}

// Build an internal revision seed from validated domain data, never from archived SQL or CRDT bytes.
export function projectArchiveRevisionSeed(project: ProjectArchiveState): string {
  const document = new Y.Doc();
  const fileText = (fileId: string) => document.getText(fileId === project.entryFileId ? "source" : `file:${fileId}`);
  for (const file of project.files) fileText(file.id).insert(0, file.content);
  document.getText("bibliography").insert(0, project.bibliography);
  const anchorColumns = (anchor: ManuscriptAnchorSelector, resolution: ManuscriptAnchorResolution) => {
    const stored: StoredManuscriptAnchor =
      resolution.status === "resolved"
        ? {
            ...createManuscriptAnchor(document, resolution.start, resolution.end, 0, anchor.fileId, fileText(anchor.fileId)),
            exact: anchor.exact,
            prefix: anchor.prefix,
            suffix: anchor.suffix,
            originalRange: anchor.originalRange,
          }
        : { ...anchor, relativeStart: null, relativeEnd: null };
    return {
      start_offset: stored.originalRange.start,
      end_offset: stored.originalRange.end,
      excerpt: stored.exact,
      anchor_version: 1,
      relative_start: stored.relativeStart ? { blob: base64(stored.relativeStart) } : null,
      relative_end: stored.relativeEnd ? { blob: base64(stored.relativeEnd) } : null,
      quote_prefix: stored.prefix,
      quote_suffix: stored.suffix,
      anchored_revision: 0,
      project_file_id: stored.fileId,
    };
  };
  try {
    return JSON.stringify({
      version: 1,
      workspace: {
        title: project.title,
        yState: base64(Y.encodeStateAsUpdate(document).buffer),
        source: project.files.find(({ id }) => id === project.entryFileId)!.content,
        bibliography: project.bibliography,
        entryFileId: project.entryFileId,
        publicationProfile: project.publicationProfile,
      },
      tables: {
        project_files: project.files.map((file) => ({
          id: file.id,
          path: file.path,
          media_type: file.mediaType,
          y_text_name: file.id === project.entryFileId ? "source" : `file:${file.id}`,
          content: file.content,
          created_at: file.createdAt,
          updated_at: file.updatedAt,
        })),
        project_folders: project.folders.map((folder) => ({
          id: folder.id,
          path: folder.path,
          created_at: folder.createdAt,
          updated_at: folder.updatedAt,
        })),
        project_assets: project.assets.map((asset) => ({
          id: asset.id,
          path: asset.path,
          media_type: asset.mediaType,
          size: asset.size,
          object_key: asset.objectKey,
          fingerprint: asset.fingerprint,
          created_at: asset.createdAt,
          updated_at: asset.updatedAt,
        })),
        pdfs: project.pdfs.map((pdf) => ({
          id: pdf.id,
          name: pdf.name,
          content_type: pdf.contentType,
          size: pdf.size,
          object_key: pdf.objectKey,
          fingerprint: pdf.fingerprint,
          created_at: pdf.createdAt,
        })),
        publications: project.publications.map((publication) => ({
          id: publication.id,
          citation_key: publication.citationKey,
          entry_type: publication.type,
          title: publication.title,
          authors_json: JSON.stringify(publication.authors),
          publication_year: publication.year,
          venue: publication.venue,
          doi: publication.doi,
          url: publication.url,
          abstract: publication.abstract,
          metadata_source: publication.metadataSource,
          created_at: publication.createdAt,
          updated_at: publication.updatedAt,
        })),
        project_references: project.projectReferences.map((link) => ({
          id: link.id,
          reference_id: link.referenceId,
          citation_alias: link.citationAlias,
          snapshot_json: JSON.stringify(link.snapshot),
          created_at: link.createdAt,
          updated_at: link.updatedAt,
        })),
        project_research_shares: project.researchShares.map((share) => ({
          id: share.id,
          project_id: project.id,
          reference_id: share.referenceId,
          resource_id: share.resourceId,
          kind: share.kind,
          snapshot_json: JSON.stringify(share.content),
          created_at: share.createdAt,
          revoked_at: share.revokedAt,
        })),
        annotations: project.annotations.map((annotation) => ({
          id: annotation.id,
          pdf_id: annotation.pdfId,
          page: annotation.page,
          quote: annotation.quote,
          prefix: annotation.prefix,
          suffix: annotation.suffix,
          comment: annotation.comment,
          rects_json: JSON.stringify({ version: 2, fragments: annotation.fragments, updatedAt: annotation.updatedAt }),
          created_at: annotation.createdAt,
        })),
        claims: project.claims.map((claim) => ({
          id: claim.id,
          text: claim.text,
          note: claim.note,
          created_at: claim.createdAt,
          updated_at: claim.updatedAt,
        })),
        claim_evidence_links: project.claimEvidenceLinks.map((link) => ({
          id: link.id,
          claim_id: link.claimId,
          annotation_id: link.annotationId,
          relation: link.relation,
          created_at: link.createdAt,
        })),
        passage_links: project.links.map((link) => ({
          id: link.id,
          annotation_id: link.annotationId,
          ...anchorColumns(link.anchor, link.resolution),
          created_at: link.createdAt,
        })),
        claim_passage_links: project.claimLinks.map((link) => ({
          id: link.id,
          claim_id: link.claimId,
          ...anchorColumns(link.anchor, link.resolution),
          created_at: link.createdAt,
        })),
        manuscript_comments: project.comments.map((comment) => ({
          id: comment.id,
          author_id: comment.authorId,
          author_label: comment.authorLabel,
          body: comment.body,
          ...anchorColumns(comment.anchor, comment.resolution),
          status: comment.status,
          created_at: comment.createdAt,
          updated_at: comment.updatedAt,
        })),
        publication_pdf_links: [],
        project_reference_pdf_links: project.publicationPdfLinks.map((link) => ({
          id: link.id,
          publication_id: link.publicationId,
          pdf_id: link.pdfId,
          created_at: link.createdAt,
        })),
        review_artifact_pins: project.reviewArtifactPins.map((pin) => ({
          path: pin.path,
          review_id: pin.reviewId,
          link_id: pin.linkId,
          publication_id: pin.publicationId,
          review_revision: pin.reviewRevision,
          protocol_revision: pin.protocolRevision,
          analysis_definition_id: pin.analysisDefinitionId,
          analysis_definition_revision: pin.analysisDefinitionRevision,
          generator: pin.generator,
          generator_schema: pin.generatorSchema,
          digest: pin.digest,
          published_by: pin.publishedBy,
          generated_at: pin.generatedAt,
        })),
      },
    });
  } finally {
    document.destroy();
  }
}

function base64(bytes: ArrayBufferLike): string {
  let value = "";
  for (const byte of new Uint8Array(bytes)) value += String.fromCharCode(byte);
  return btoa(value);
}
