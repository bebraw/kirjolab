import {
  compareWebSnapshotText,
  crossrefMetadataFields,
  extractWebDocument,
  isReferenceLibrarySnapshot,
  normalizeWebSourceUrl,
  type BibliographicRecord,
  type CrossrefMetadata,
  type CrossrefMetadataField,
  type LibraryHighlight,
  type LibraryNote,
  type LibraryPdfArtifact,
  type ReadingState,
  type ReferenceLibrarySnapshot,
  type ReviewedPdfMetadata,
  type ScholarlyMetadataProvider,
  type WebCaptureRegistration,
  type WebSnapshot,
} from "../domain/reference-library";
import {
  isCreateCitationAssertionInput,
  isReviewCitationAssertionInput,
  type CitationAssertion,
  type CitationNetwork,
  type CreateCitationAssertionInput,
  type ReviewCitationAssertionInput,
} from "../domain/citation-assertions";
import type { PdfDraftItem, ReferenceDeletionImpact, ReferenceImportItem, WebCaptureItem } from "../durable-objects/reference-library";
import { normalizeDoi } from "../domain/bibliography";
import { isValidDoi } from "../domain/publication-intake";
import { fetchCrossrefReferences, fetchCrossrefWork, fingerprintPublicationMetadata, searchCrossrefWorks } from "../integrations/crossref";
import { fetchDataCiteWork } from "../integrations/datacite";
import type { AuthIdentity } from "../security/auth";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import {
  cslJsonToBibTeX,
  libraryArchiveVersion,
  parseCslJson,
  parsePortableResearch,
  portableResearch,
  referenceToCslJson,
} from "../domain/library-interchange";

const maximumPdfBytes = 25 * 1024 * 1024;
const maximumWebRawBytes = 2 * 1024 * 1024;
const maximumWebReadableBytes = 1024 * 1024;
const maximumWebRedirects = 5;

type ExternalFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface ReferenceLibraryApi {
  getSnapshot(includeArchived?: boolean): Promise<ReferenceLibrarySnapshot>;
  importBibTeX(source: string, actor: string): Promise<ReferenceImportItem[]>;
  registerPdf(artifact: LibraryPdfArtifact): Promise<LibraryPdfArtifact>;
  createPdfDraft(artifact: LibraryPdfArtifact, actor: string): Promise<PdfDraftItem>;
  identifyPdf(artifactId: string, referenceId: string): Promise<LibraryPdfArtifact>;
  setArtifactRights(artifactId: string, rights: LibraryPdfArtifact["rights"]): Promise<LibraryPdfArtifact>;
  archiveReference(referenceId: string, archived: boolean): Promise<BibliographicRecord>;
  updateReferenceMetadata(
    referenceId: string,
    fields: Pick<BibliographicRecord, "type" | "title" | "authors" | "year" | "venue" | "doi" | "url" | "abstract">,
    actor: string,
  ): Promise<BibliographicRecord>;
  applyReviewedPdfMetadata(
    referenceId: string,
    artifactId: string,
    fields: ReviewedPdfMetadata,
    actor: string,
  ): Promise<BibliographicRecord>;
  applyReviewedCrossrefMetadata(
    referenceId: string,
    expectedDoi: string,
    metadata: CrossrefMetadata,
    fields: readonly CrossrefMetadataField[],
    actor: string,
  ): Promise<BibliographicRecord>;
  applyReviewedProviderMetadata(
    referenceId: string,
    metadata: CrossrefMetadata,
    fields: readonly CrossrefMetadataField[],
    provider: ScholarlyMetadataProvider,
    actor: string,
  ): Promise<BibliographicRecord>;
  getPdfMetadataContext(referenceId: string, artifactId: string): Promise<{ reference: BibliographicRecord; artifact: LibraryPdfArtifact }>;
  setTags(referenceId: string, tags: readonly string[]): Promise<readonly string[]>;
  setCollections(referenceId: string, collections: readonly string[]): Promise<readonly string[]>;
  createNote(referenceId: string, body: string): Promise<LibraryNote>;
  createHighlight(referenceId: string, artifactId: string, page: number, quote: string, comment: string): Promise<LibraryHighlight>;
  setReadingState(
    referenceId: string,
    status: ReadingState["status"],
    rating: number | null,
    priority: ReadingState["priority"],
  ): Promise<ReadingState>;
  getDeletionImpact(referenceId: string): Promise<ReferenceDeletionImpact>;
  permanentlyDeleteReference(referenceId: string, expectedProjectIds: readonly string[]): Promise<BibliographicRecord>;
  registerWebCapture(registration: WebCaptureRegistration): Promise<WebCaptureItem>;
  getWebSnapshot(snapshotId: string): Promise<WebSnapshot>;
  getWebSnapshots(referenceId: string): Promise<readonly WebSnapshot[]>;
  getReferences(referenceIds: readonly string[]): Promise<BibliographicRecord[]>;
  findReferencesByDois(doiValues: readonly string[]): Promise<BibliographicRecord[]>;
  createCitationAssertions(inputs: readonly CreateCitationAssertionInput[], actor: string): Promise<CitationAssertion[]>;
  getCitationAssertions(referenceId?: string): Promise<CitationAssertion[]>;
  reviewCitationAssertion(assertionId: string, input: ReviewCitationAssertionInput, reviewer: string): Promise<CitationAssertion>;
  getCitationNetwork(projectId?: string): Promise<CitationNetwork>;
}

interface ReferenceLibraryApiEnv {
  readonly REFERENCE_LIBRARIES: { getByName(name: string): ReferenceLibraryApi };
  readonly PAPERS: Pick<R2Bucket, "put" | "get" | "delete">;
  readonly CROSSREF_MAILTO: string;
}

export async function handleReferenceLibraryApi(
  request: Request,
  env: ReferenceLibraryApiEnv,
  identity: AuthIdentity,
  fetchExternal: ExternalFetch = (input, init) => fetch(input, init),
): Promise<Response> {
  const url = new URL(request.url);
  const suffix = url.pathname.slice("/api/library".length) || "/";
  const library = env.REFERENCE_LIBRARIES.getByName(identity.ownerKey);
  try {
    if (suffix === "/" && request.method === "GET") {
      return Response.json(await library.getSnapshot(url.searchParams.get("archived") === "include"), noStore());
    }
    if (suffix === "/import" && request.method === "POST") {
      const body: unknown = await request.json();
      if (!isRecord(body) || typeof body.bibtex !== "string" || body.bibtex.length === 0 || body.bibtex.length > 2_000_000) {
        return jsonError("Invalid BibTeX import", 400);
      }
      return Response.json(await library.importBibTeX(body.bibtex, identity.email), { status: 201, ...noStore() });
    }
    if (suffix === "/import/csl-json" && request.method === "POST") {
      const body = await readBoundedJson(request, 2_000_000);
      const items = parseCslJson(body);
      return Response.json(await library.importBibTeX(cslJsonToBibTeX(items), identity.email), { status: 201, ...noStore() });
    }
    if (suffix === "/import/archive" && request.method === "POST") {
      return await importPortableLibrary(request, identity, library);
    }
    if (suffix === "/export/csl.json" && request.method === "GET") {
      const snapshot = await library.getSnapshot(true);
      return downloadJson(snapshot.references.map(referenceToCslJson), "kirjolab-library.csl.json");
    }
    if (suffix === "/export/library.zip" && request.method === "GET") {
      const snapshot = await library.getSnapshot(true);
      const timestamp = new Date("1980-01-01T00:00:00.000Z");
      const files: Zippable = {
        "manifest.json": [
          strToU8(`${JSON.stringify({ version: libraryArchiveVersion, binaryArtifacts: "metadata-only" }, null, 2)}\n`),
          { mtime: timestamp },
        ],
        "references.csl.json": [strToU8(`${JSON.stringify(snapshot.references.map(referenceToCslJson), null, 2)}\n`), { mtime: timestamp }],
        "research.json": [strToU8(`${JSON.stringify(portableResearch(snapshot), null, 2)}\n`), { mtime: timestamp }],
      };
      return new Response(zipSync(files, { level: 9, mtime: timestamp }), {
        headers: {
          "content-type": "application/zip",
          "content-disposition": 'attachment; filename="kirjolab-library.zip"',
          "cache-control": "no-store",
        },
      });
    }
    if (suffix === "/web-sources" && request.method === "POST") {
      return await captureWebSource(request, identity, env, library, fetchExternal);
    }
    if (suffix === "/citation-network" && request.method === "GET") {
      const projectId = url.searchParams.get("projectId")?.trim() || undefined;
      if (projectId && !/^[a-z0-9-]{1,64}$/iu.test(projectId)) return jsonError("Invalid citation-network project filter", 400);
      return Response.json(await library.getCitationNetwork(projectId), noStore());
    }
    if (suffix === "/citation-assertions" && request.method === "GET") {
      const referenceId = url.searchParams.get("referenceId")?.trim() || undefined;
      return Response.json(await library.getCitationAssertions(referenceId), noStore());
    }
    if (suffix === "/citation-assertions" && request.method === "POST") {
      const body: unknown = await request.json();
      if (!isCreateCitationAssertionInput(body)) return jsonError("Invalid citation assertion", 400);
      return Response.json((await library.createCitationAssertions([body], identity.email))[0], { status: 201, ...noStore() });
    }
    const assertionReviewMatch = /^\/citation-assertions\/([0-9a-f-]{36})\/review$/iu.exec(suffix);
    if (assertionReviewMatch?.[1] && request.method === "POST") {
      const body: unknown = await request.json();
      if (!isReviewCitationAssertionInput(body)) return jsonError("Invalid citation assertion review", 400);
      return Response.json(await library.reviewCitationAssertion(assertionReviewMatch[1], body, identity.email), noStore());
    }
    const comparisonMatch = /^\/web-snapshots\/([0-9a-f-]{36})\/compare\/([0-9a-f-]{36})$/iu.exec(suffix);
    if (comparisonMatch?.[1] && comparisonMatch[2] && request.method === "GET") {
      return await compareWebSnapshots(comparisonMatch[1], comparisonMatch[2], env, library);
    }
    const webSnapshotMatch = /^\/web-snapshots\/([0-9a-f-]{36})(?:\/(raw|readable))?$/iu.exec(suffix);
    if (webSnapshotMatch?.[1] && request.method === "GET") {
      const snapshot = await library.getWebSnapshot(webSnapshotMatch[1]);
      const representation = webSnapshotMatch[2];
      if (!representation) return Response.json(snapshot, noStore());
      if (representation !== "raw" && representation !== "readable") return jsonError("Invalid web snapshot representation", 400);
      return await downloadWebSnapshot(snapshot, representation, env);
    }
    if (suffix === "/pdfs" && request.method === "POST")
      return await uploadLibraryPdf(request, identity.ownerKey, identity.email, env, library);
    const pdfMatch = /^\/pdfs\/([0-9a-f-]{36})(?:\/(identify|rights))?$/iu.exec(suffix);
    if (pdfMatch?.[1] && request.method === "GET" && !pdfMatch[2]) {
      return await downloadLibraryPdf(pdfMatch[1], env, library);
    }
    if (pdfMatch?.[1] && pdfMatch[2] === "identify" && request.method === "POST") {
      const body: unknown = await request.json();
      if (!isRecord(body) || typeof body.referenceId !== "string") return jsonError("Invalid PDF identification", 400);
      return Response.json(await library.identifyPdf(pdfMatch[1], body.referenceId), noStore());
    }
    if (pdfMatch?.[1] && pdfMatch[2] === "rights" && request.method === "PUT") {
      const body: unknown = await request.json();
      if (!isRecord(body) || (body.rights !== "private" && body.rights !== "shareable" && body.rights !== "unknown")) {
        return jsonError("Invalid artifact rights", 400);
      }
      return Response.json(await library.setArtifactRights(pdfMatch[1], body.rights), noStore());
    }
    const crossrefMatch = /^\/references\/([0-9a-f-]{36})\/crossref\/(preview|accept)$/iu.exec(suffix);
    if (crossrefMatch?.[1] && crossrefMatch[2] && request.method === "POST") {
      return crossrefMatch[2] === "preview"
        ? await previewCrossrefMetadata(crossrefMatch[1], env, library, fetchExternal)
        : await acceptCrossrefMetadata(request, crossrefMatch[1], identity, env, library, fetchExternal);
    }
    const refinementMatch = /^\/references\/([0-9a-f-]{36})\/metadata-refinement\/(preview|accept)$/iu.exec(suffix);
    if (refinementMatch?.[1] && refinementMatch[2] && request.method === "POST") {
      return refinementMatch[2] === "preview"
        ? await previewMetadataRefinement(request, refinementMatch[1], env, library, fetchExternal)
        : await acceptMetadataRefinement(request, refinementMatch[1], identity, env, library, fetchExternal);
    }
    const referenceMatch =
      /^\/references\/([0-9a-f-]{36})(?:\/(tags|collections|notes|highlights|reading|deletion-impact|web-snapshots|citation-expansions|pdf-metadata))?$/iu.exec(
        suffix,
      );
    if (!referenceMatch?.[1]) return jsonError("Library route not found", 404);
    const referenceId = referenceMatch[1];
    const action = referenceMatch[2];
    if (action === "pdf-metadata" && request.method === "POST") {
      const body: unknown = await request.json();
      if (!isReviewedPdfMetadataInput(body)) return jsonError("Invalid reviewed PDF metadata", 400);
      return Response.json(await library.applyReviewedPdfMetadata(referenceId, body.artifactId, body.fields, identity.email), noStore());
    }
    if (!action && request.method === "PATCH") {
      const body: unknown = await request.json();
      if (!isRecord(body)) return jsonError("Invalid reference update", 400);
      if (typeof body.archived === "boolean") return Response.json(await library.archiveReference(referenceId, body.archived), noStore());
      if (
        typeof body.type !== "string" ||
        typeof body.title !== "string" ||
        !Array.isArray(body.authors) ||
        !body.authors.every((author) => typeof author === "string") ||
        typeof body.year !== "string" ||
        typeof body.venue !== "string" ||
        typeof body.doi !== "string" ||
        typeof body.url !== "string" ||
        typeof body.abstract !== "string" ||
        body.title.length > 2_000 ||
        body.abstract.length > 20_000
      )
        return jsonError("Invalid bibliographic metadata", 400);
      return Response.json(
        await library.updateReferenceMetadata(
          referenceId,
          {
            type: body.type,
            title: body.title,
            authors: body.authors,
            year: body.year,
            venue: body.venue,
            doi: body.doi,
            url: body.url,
            abstract: body.abstract,
          },
          identity.email,
        ),
        noStore(),
      );
    }
    if (action === "tags" && request.method === "PUT") {
      const body: unknown = await request.json();
      if (!isRecord(body) || !Array.isArray(body.tags) || !body.tags.every((tag) => typeof tag === "string")) {
        return jsonError("Invalid reference tags", 400);
      }
      return Response.json(await library.setTags(referenceId, body.tags), noStore());
    }
    if (action === "collections" && request.method === "PUT") {
      const body: unknown = await request.json();
      if (!isRecord(body) || !Array.isArray(body.collections) || !body.collections.every((item) => typeof item === "string")) {
        return jsonError("Invalid reference collections", 400);
      }
      return Response.json(await library.setCollections(referenceId, body.collections), noStore());
    }
    if (action === "notes" && request.method === "POST") {
      const body: unknown = await request.json();
      if (!isRecord(body) || typeof body.body !== "string") return jsonError("Invalid reference note", 400);
      return Response.json(await library.createNote(referenceId, body.body), { status: 201, ...noStore() });
    }
    if (action === "highlights" && request.method === "POST") {
      const body: unknown = await request.json();
      if (
        !isRecord(body) ||
        typeof body.artifactId !== "string" ||
        typeof body.page !== "number" ||
        typeof body.quote !== "string" ||
        typeof body.comment !== "string"
      ) {
        return jsonError("Invalid private highlight", 400);
      }
      return Response.json(await library.createHighlight(referenceId, body.artifactId, body.page, body.quote, body.comment), {
        status: 201,
        ...noStore(),
      });
    }
    if (action === "reading" && request.method === "PUT") {
      const body: unknown = await request.json();
      if (
        !isRecord(body) ||
        !isReadingStatus(body.status) ||
        (body.rating !== null && typeof body.rating !== "number") ||
        (body.priority !== "low" && body.priority !== "normal" && body.priority !== "high")
      ) {
        return jsonError("Invalid reading state", 400);
      }
      return Response.json(await library.setReadingState(referenceId, body.status, body.rating, body.priority), noStore());
    }
    if (action === "deletion-impact" && request.method === "GET") {
      return Response.json(await library.getDeletionImpact(referenceId), noStore());
    }
    if (action === "web-snapshots" && request.method === "GET") {
      return Response.json(await library.getWebSnapshots(referenceId), noStore());
    }
    if (action === "citation-expansions" && request.method === "POST") {
      return await expandCitationReferences(referenceId, identity, env, library, fetchExternal);
    }
    if (!action && request.method === "DELETE") {
      const body: unknown = await request.json();
      if (!isRecord(body) || !Array.isArray(body.expectedProjectIds) || !body.expectedProjectIds.every((id) => typeof id === "string")) {
        return jsonError("Review deletion impact before permanent deletion", 409);
      }
      return Response.json(await library.permanentlyDeleteReference(referenceId, body.expectedProjectIds), noStore());
    }
    return jsonError("Library route not found", 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reference library operation failed";
    const status = /changed|already|before deleting|before identifying/iu.test(message) ? 409 : /not found/iu.test(message) ? 404 : 400;
    return jsonError(message, status);
  }
}

async function previewCrossrefMetadata(
  referenceId: string,
  env: ReferenceLibraryApiEnv,
  library: ReferenceLibraryApi,
  fetchExternal: ExternalFetch,
): Promise<Response> {
  const reference = await libraryReference(referenceId, library);
  const conflict = await duplicateDoiResponse(reference, library);
  if (conflict) return conflict;
  if (!reference.doi) return jsonError("Reference has no DOI", 400);
  const metadata = await fetchCrossrefWork(reference.doi, env.CROSSREF_MAILTO, fetchExternal);
  const complete: CrossrefMetadata = { ...metadata, type: metadata.type ?? "misc" };
  return Response.json(
    {
      referenceId,
      doi: reference.doi,
      metadata: complete,
      metadataFingerprint: await fingerprintPublicationMetadata(complete),
    },
    noStore(),
  );
}

async function acceptCrossrefMetadata(
  request: Request,
  referenceId: string,
  identity: AuthIdentity,
  env: ReferenceLibraryApiEnv,
  library: ReferenceLibraryApi,
  fetchExternal: ExternalFetch,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isCrossrefAcceptanceInput(body)) return jsonError("Invalid Crossref metadata acceptance", 400);
  const reference = await libraryReference(referenceId, library);
  const conflict = await duplicateDoiResponse(reference, library);
  if (conflict) return conflict;
  if (!reference.doi) return jsonError("Reference has no DOI", 400);
  const metadata = await fetchCrossrefWork(reference.doi, env.CROSSREF_MAILTO, fetchExternal);
  const complete: CrossrefMetadata = { ...metadata, type: metadata.type ?? "misc" };
  if ((await fingerprintPublicationMetadata(complete)) !== body.metadataFingerprint) {
    return jsonError("Crossref metadata changed; review it again", 409);
  }
  return Response.json(
    await library.applyReviewedCrossrefMetadata(referenceId, reference.doi, complete, body.fields, identity.email),
    noStore(),
  );
}

async function previewMetadataRefinement(
  request: Request,
  referenceId: string,
  env: ReferenceLibraryApiEnv,
  library: ReferenceLibraryApi,
  fetchExternal: ExternalFetch,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isMetadataRefinementPreviewInput(body)) return jsonError("Invalid metadata refinement preview", 400);
  const { reference } = await library.getPdfMetadataContext(referenceId, body.artifactId);
  const query = {
    title: body.candidates.title?.trim() || reference.title,
    authors: body.candidates.authors ?? reference.authors,
    year: body.candidates.year?.trim() || reference.year,
  };
  const doi = normalizeDoi(body.candidates.doi?.trim() || reference.doi);
  const matches = doi
    ? [
        {
          provider: await doiMetadataProvider(doi, env.CROSSREF_MAILTO, fetchExternal),
          match: "doi" as const,
          score: null,
        },
      ]
    : (await searchCrossrefWorks(query, env.CROSSREF_MAILTO, fetchExternal)).map((match) => ({
        provider: { name: "crossref" as const, metadata: match.metadata },
        match: "bibliographic" as const,
        score: match.score,
      }));
  const candidates = await Promise.all(
    matches.map(async ({ provider, match, score }) => {
      const metadata: CrossrefMetadata = { ...provider.metadata, type: provider.metadata.type ?? "misc" };
      return {
        provider: provider.name,
        match,
        score,
        metadata,
        metadataFingerprint: await fingerprintPublicationMetadata(metadata),
      };
    }),
  );
  return Response.json({ referenceId, artifactId: body.artifactId, candidates }, noStore());
}

async function acceptMetadataRefinement(
  request: Request,
  referenceId: string,
  identity: AuthIdentity,
  env: ReferenceLibraryApiEnv,
  library: ReferenceLibraryApi,
  fetchExternal: ExternalFetch,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isMetadataRefinementAcceptanceInput(body)) return jsonError("Invalid metadata refinement acceptance", 400);
  const reference = await libraryReference(referenceId, library);
  const doi = normalizeDoi(body.doi);
  if (reference.doi && normalizeDoi(reference.doi) !== doi) return jsonError("Reference DOI changed; refine metadata again", 409);
  const conflict = await duplicateDoiValueResponse(reference, doi, library);
  if (conflict) return conflict;
  const metadataValue =
    body.provider === "crossref"
      ? await fetchCrossrefWork(doi, env.CROSSREF_MAILTO, fetchExternal)
      : await fetchDataCiteWork(doi, env.CROSSREF_MAILTO, fetchExternal);
  const metadata: CrossrefMetadata = { ...metadataValue, type: metadataValue.type ?? "misc" };
  if ((await fingerprintPublicationMetadata(metadata)) !== body.metadataFingerprint) {
    return jsonError("Provider metadata changed; review it again", 409);
  }
  return Response.json(
    await library.applyReviewedProviderMetadata(referenceId, metadata, body.fields, body.provider, identity.email),
    noStore(),
  );
}

async function doiMetadataProvider(
  doi: string,
  mailto: string,
  fetchExternal: ExternalFetch,
): Promise<{ name: ScholarlyMetadataProvider; metadata: Awaited<ReturnType<typeof fetchCrossrefWork>> }> {
  try {
    return { name: "crossref", metadata: await fetchCrossrefWork(doi, mailto, fetchExternal) };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "Crossref has no record for this DOI") throw error;
    return { name: "datacite", metadata: await fetchDataCiteWork(doi, mailto, fetchExternal) };
  }
}

async function libraryReference(referenceId: string, library: ReferenceLibraryApi): Promise<BibliographicRecord> {
  const reference = (await library.getReferences([referenceId]))[0];
  if (!reference) throw new Error("Reference not found");
  return reference;
}

async function duplicateDoiResponse(reference: BibliographicRecord, library: ReferenceLibraryApi): Promise<Response | null> {
  if (!reference.doi) return null;
  return duplicateDoiValueResponse(reference, reference.doi, library);
}

async function duplicateDoiValueResponse(
  reference: BibliographicRecord,
  doi: string,
  library: ReferenceLibraryApi,
): Promise<Response | null> {
  const duplicate = (await library.findReferencesByDois([doi])).find((candidate) => candidate.id !== reference.id);
  return duplicate
    ? Response.json(
        {
          error: "DOI already belongs to another library record",
          duplicateReference: { id: duplicate.id, referenceKey: duplicate.referenceKey, title: duplicate.title },
        },
        { status: 409, ...noStore() },
      )
    : null;
}

function isCrossrefAcceptanceInput(value: unknown): value is { metadataFingerprint: string; fields: CrossrefMetadataField[] } {
  if (
    !isRecord(value) ||
    typeof value.metadataFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.metadataFingerprint) ||
    !Array.isArray(value.fields) ||
    value.fields.length === 0 ||
    value.fields.length > crossrefMetadataFields.length ||
    !value.fields.every((field) => typeof field === "string" && crossrefMetadataFields.includes(field as CrossrefMetadataField))
  ) {
    return false;
  }
  return new Set(value.fields).size === value.fields.length;
}

function isMetadataRefinementPreviewInput(value: unknown): value is { artifactId: string; candidates: ReviewedPdfMetadata } {
  if (!isRecord(value) || typeof value.artifactId !== "string" || !/^[0-9a-f-]{36}$/iu.test(value.artifactId)) return false;
  return isPdfMetadataFields(value.candidates, true);
}

function isMetadataRefinementAcceptanceInput(value: unknown): value is {
  provider: ScholarlyMetadataProvider;
  doi: string;
  metadataFingerprint: string;
  fields: CrossrefMetadataField[];
} {
  return (
    isRecord(value) &&
    (value.provider === "crossref" || value.provider === "datacite") &&
    typeof value.doi === "string" &&
    isValidDoi(value.doi) &&
    isCrossrefAcceptanceInput(value)
  );
}

function isReviewedPdfMetadataInput(value: unknown): value is { artifactId: string; fields: ReviewedPdfMetadata } {
  if (!isRecord(value) || typeof value.artifactId !== "string" || !/^[0-9a-f-]{36}$/iu.test(value.artifactId)) return false;
  return isPdfMetadataFields(value.fields, false);
}

function isPdfMetadataFields(value: unknown, allowEmpty: boolean): value is ReviewedPdfMetadata {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if ((!allowEmpty && keys.length === 0) || keys.some((key) => !["title", "authors", "year", "doi"].includes(key))) return false;
  const { title, authors, year, doi } = value;
  return (
    (title === undefined || (typeof title === "string" && title.trim().length > 0 && title.length <= 2_000)) &&
    (authors === undefined ||
      (Array.isArray(authors) &&
        authors.length <= 64 &&
        authors.every((author) => typeof author === "string" && author.trim() && author.length <= 300))) &&
    (year === undefined || (typeof year === "string" && (/^\d{4}$/u.test(year) || year === ""))) &&
    (doi === undefined || (typeof doi === "string" && doi.length <= 500))
  );
}

async function expandCitationReferences(
  referenceId: string,
  identity: AuthIdentity,
  env: ReferenceLibraryApiEnv,
  library: ReferenceLibraryApi,
  fetchExternal: ExternalFetch,
): Promise<Response> {
  const source = (await library.getReferences([referenceId]))[0];
  if (!source) return jsonError("Reference not found", 404);
  if (!source.doi) return jsonError("Add a DOI before expanding external citation references", 409);
  const expansion = await fetchCrossrefReferences(source.doi, env.CROSSREF_MAILTO, fetchExternal);
  const matches = await library.findReferencesByDois(expansion.candidates.map((candidate) => candidate.doi));
  const byDoi = new Map(matches.map((reference) => [reference.doi.toLocaleLowerCase(), reference]));
  const inputs = new Map<string, CreateCitationAssertionInput>();
  for (const candidate of expansion.candidates) {
    const target = byDoi.get(candidate.doi.toLocaleLowerCase());
    if (!target || target.id === source.id || inputs.has(target.id)) continue;
    inputs.set(target.id, {
      citingReferenceId: source.id,
      citedReferenceId: target.id,
      polarity: "cites",
      evidenceState: "extracted",
      method: "provider",
      observedAt: expansion.retrievedAt,
      sourceKind: "provider-response",
      sourceId: expansion.responseId,
      sourceLocator: expansion.sourceLocator,
      confidence: null,
    });
  }
  const assertions = inputs.size > 0 ? await library.createCitationAssertions([...inputs.values()], "Crossref") : [];
  const matchedDois = new Set(assertions.map((assertion) => matches.find((reference) => reference.id === assertion.citedReferenceId)?.doi));
  return Response.json(
    {
      provider: expansion.provider,
      direction: expansion.direction,
      retrievedAt: expansion.retrievedAt,
      responseId: expansion.responseId,
      sourceLocator: expansion.sourceLocator,
      assertions,
      unmatched: expansion.candidates.filter((candidate) => !matchedDois.has(candidate.doi)),
      truncated: expansion.truncated,
      requestedBy: identity.email,
    },
    { status: 201, ...noStore() },
  );
}

async function captureWebSource(
  request: Request,
  identity: AuthIdentity,
  env: ReferenceLibraryApiEnv,
  library: ReferenceLibraryApi,
  fetchWeb: ExternalFetch,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isWebCaptureBody(body)) return jsonError("Invalid web source capture", 400);
  let requestedUrl: string;
  try {
    requestedUrl = normalizeWebSourceUrl(body.url);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid web source URL", 400);
  }
  const accessedAt = new Date().toISOString();
  const snapshotId = crypto.randomUUID();
  const retrieval = await retrieveWebSource(requestedUrl, fetchWeb);
  const extraction = extractWebDocument(retrieval.sourceText, retrieval.contentType);
  const title = extraction.title || retrieval.finalUrl;
  const authors = extraction.authors;
  const publisher = extraction.publisher;
  const publishedAt = extraction.publishedAt;
  const diagnostics = [...retrieval.diagnostics, ...extraction.diagnostics];
  if (!extraction.title) diagnostics.push("Page title unavailable; using its URL until metadata is refined.");
  const readable = boundedUtf8(extraction.readableText, maximumWebReadableBytes);
  if (readable.truncated) diagnostics.push("Readable text exceeded 1 MiB and was truncated.");
  const baseKey = `libraries/${identity.ownerKey}/web/${snapshotId}`;
  const rawObjectKey = retrieval.raw.length > 0 ? `${baseKey}/raw` : null;
  const readableObjectKey = readable.bytes.length > 0 ? `${baseKey}/readable.txt` : null;
  const contentHash = await sha256Fingerprint(retrieval.raw);
  const registration: WebCaptureRegistration = {
    canonicalUrl: retrieval.finalUrl,
    actor: identity.email,
    snapshot: {
      id: snapshotId,
      requestedUrl,
      finalUrl: retrieval.finalUrl,
      accessedAt,
      status: retrieval.status,
      contentType: retrieval.contentType,
      rawObjectKey,
      readableObjectKey,
      rawSize: retrieval.raw.length,
      readableSize: readable.bytes.length,
      contentHash,
      title,
      authors,
      publisher,
      publishedAt,
      complete: retrieval.complete && !readable.truncated,
      diagnostics: [...new Set(diagnostics)],
      redirectChain: retrieval.redirectChain,
      etag: retrieval.etag,
      lastModified: retrieval.lastModified,
    },
  };
  try {
    const writes: Promise<unknown>[] = [];
    if (rawObjectKey) {
      writes.push(
        env.PAPERS.put(rawObjectKey, retrieval.raw, {
          httpMetadata: { contentType: "application/octet-stream" },
          customMetadata: { contentHash },
        }),
      );
    }
    if (readableObjectKey) {
      writes.push(env.PAPERS.put(readableObjectKey, readable.bytes, { httpMetadata: { contentType: "text/plain; charset=utf-8" } }));
    }
    await Promise.all(writes);
    return Response.json(await library.registerWebCapture(registration), { status: 201, ...noStore() });
  } catch (error) {
    await Promise.all([
      rawObjectKey ? env.PAPERS.delete(rawObjectKey) : Promise.resolve(),
      readableObjectKey ? env.PAPERS.delete(readableObjectKey) : Promise.resolve(),
    ]);
    throw error;
  }
}

interface RetrievedWebSource {
  readonly finalUrl: string;
  readonly status: number;
  readonly contentType: string;
  readonly raw: Uint8Array;
  readonly sourceText: string;
  readonly complete: boolean;
  readonly diagnostics: readonly string[];
  readonly redirectChain: readonly string[];
  readonly etag: string;
  readonly lastModified: string;
}

async function retrieveWebSource(requestedUrl: string, fetchWeb: ExternalFetch): Promise<RetrievedWebSource> {
  const redirectChain: string[] = [];
  const diagnostics: string[] = [];
  let currentUrl = requestedUrl;
  try {
    for (let redirect = 0; redirect <= maximumWebRedirects; redirect += 1) {
      const response = await fetchWeb(
        new Request(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(15_000),
          headers: {
            accept: "text/html, application/xhtml+xml, text/plain;q=0.9, */*;q=0.1",
            "user-agent": "Kirjolab-Web-Capture/1.0",
          },
        }),
      );
      if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
        await response.body?.cancel();
        if (redirect === maximumWebRedirects) throw new Error("Web source exceeded the redirect limit");
        const destination = normalizeWebSourceUrl(new URL(response.headers.get("location") ?? "", currentUrl).href);
        redirectChain.push(destination);
        currentUrl = destination;
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      const bounded = await readBoundedBytes(response.body, maximumWebRawBytes);
      if (bounded.truncated) diagnostics.push("Fetched content exceeded 2 MiB and was truncated.");
      if (!response.ok) diagnostics.push(`The source returned HTTP ${response.status}.`);
      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (Number.isFinite(declaredLength) && declaredLength > maximumWebRawBytes)
        diagnostics.push("The declared response size exceeded 2 MiB.");
      return {
        finalUrl: currentUrl,
        status: response.status,
        contentType,
        raw: bounded.bytes,
        sourceText: new TextDecoder().decode(bounded.bytes),
        complete: response.ok && !bounded.truncated,
        diagnostics,
        redirectChain,
        etag: response.headers.get("etag") ?? "",
        lastModified: response.headers.get("last-modified") ?? "",
      };
    }
  } catch (error) {
    diagnostics.push(
      error instanceof Error && /redirect limit/iu.test(error.message)
        ? error.message
        : "The page could not be retrieved during this capture.",
    );
  }
  return {
    finalUrl: currentUrl,
    status: 0,
    contentType: "",
    raw: new Uint8Array(),
    sourceText: "",
    complete: false,
    diagnostics,
    redirectChain,
    etag: "",
    lastModified: "",
  };
}

async function readBoundedBytes(
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!body) return { bytes: new Uint8Array(), truncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    const remaining = maximumBytes - size;
    if (remaining <= 0) {
      truncated = true;
      await reader.cancel();
      break;
    }
    const chunk = result.value.length > remaining ? result.value.subarray(0, remaining) : result.value;
    chunks.push(chunk);
    size += chunk.length;
    if (chunk.length < result.value.length) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes, truncated };
}

function boundedUtf8(value: string, maximumBytes: number): { bytes: Uint8Array; truncated: boolean } {
  const encoded = new TextEncoder().encode(value);
  if (encoded.length <= maximumBytes) return { bytes: encoded, truncated: false };
  let end = maximumBytes;
  while (end > 0 && (encoded[end] ?? 0) >= 0x80 && (encoded[end] ?? 0) < 0xc0) end -= 1;
  return { bytes: encoded.subarray(0, end), truncated: true };
}

async function sha256Fingerprint(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function compareWebSnapshots(
  beforeId: string,
  afterId: string,
  env: ReferenceLibraryApiEnv,
  library: ReferenceLibraryApi,
): Promise<Response> {
  const [before, after] = await Promise.all([library.getWebSnapshot(beforeId), library.getWebSnapshot(afterId)]);
  if (before.referenceId !== after.referenceId) return jsonError("Web snapshots must belong to the same source", 409);
  const [beforeText, afterText] = await Promise.all([readWebSnapshotText(before, env), readWebSnapshotText(after, env)]);
  return Response.json({ before, after, comparison: compareWebSnapshotText(beforeText, afterText) }, noStore());
}

async function readWebSnapshotText(snapshot: WebSnapshot, env: ReferenceLibraryApiEnv): Promise<string> {
  if (!snapshot.readableObjectKey) return "";
  const object = await env.PAPERS.get(snapshot.readableObjectKey);
  if (!object) throw new Error("Web snapshot readable content not found");
  if (object.size > maximumWebReadableBytes) throw new Error("Stored web snapshot exceeds the readable-text limit");
  return await object.text();
}

async function downloadWebSnapshot(
  snapshot: WebSnapshot,
  representation: "raw" | "readable",
  env: ReferenceLibraryApiEnv,
): Promise<Response> {
  const objectKey = representation === "raw" ? snapshot.rawObjectKey : snapshot.readableObjectKey;
  if (!objectKey) return jsonError(`Web snapshot ${representation} content is unavailable`, 404);
  const object = await env.PAPERS.get(objectKey);
  if (!object) return jsonError("Web snapshot content not found", 404);
  if (representation === "raw" && object.customMetadata?.contentHash !== snapshot.contentHash) {
    return jsonError("Web snapshot content no longer matches its captured fingerprint", 410);
  }
  const headers = new Headers({
    "cache-control": "private, no-store",
    "content-disposition": `attachment; filename="web-snapshot-${snapshot.id}.${representation === "raw" ? "bin" : "txt"}"`,
    "content-security-policy": "sandbox; default-src 'none'",
    "content-type": representation === "raw" ? "application/octet-stream" : "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  return new Response(object.body, { headers });
}

async function uploadLibraryPdf(
  request: Request,
  ownerKey: string,
  actor: string,
  env: ReferenceLibraryApiEnv,
  library: ReferenceLibraryApi,
): Promise<Response> {
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/pdf") return jsonError("Only PDF uploads are supported", 415);
  if (!request.body) return jsonError("PDF body is required", 400);
  const size = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(size) || size <= 0) return jsonError("Content-Length is required", 411);
  if (size > maximumPdfBytes) return jsonError("PDF exceeds the 25 MB limit", 413);
  const id = crypto.randomUUID();
  const objectKey = `libraries/${ownerKey}/${id}.pdf`;
  const stream = new FixedLengthStream(size);
  const upload = env.PAPERS.put(objectKey, stream.readable, { httpMetadata: { contentType: "application/pdf" } });
  const pipeline = request.body.pipeTo(stream.writable);
  const [stored] = await Promise.all([upload, pipeline]);
  const artifact: LibraryPdfArtifact = {
    id,
    referenceId: null,
    name: safeFilename(request.headers.get("x-file-name") ?? "paper.pdf"),
    contentType: "application/pdf",
    size,
    objectKey,
    fingerprint: `r2-etag:${stored.etag.replaceAll('"', "")}`,
    rights: "private",
    createdAt: new Date().toISOString(),
  };
  try {
    const draft = await library.createPdfDraft(artifact, actor);
    return Response.json(draft, { status: 201, ...noStore() });
  } catch (error) {
    await env.PAPERS.delete(objectKey);
    throw error;
  }
}

async function downloadLibraryPdf(artifactId: string, env: ReferenceLibraryApiEnv, library: ReferenceLibraryApi): Promise<Response> {
  const snapshot = await library.getSnapshot(true);
  if (!isReferenceLibrarySnapshot(snapshot)) throw new Error("Reference library returned an invalid snapshot");
  const artifact = snapshot.artifacts.find((item) => item.id === artifactId);
  if (!artifact) return jsonError("PDF artifact not found", 404);
  const object = await env.PAPERS.get(artifact.objectKey);
  if (!object) return jsonError("PDF artifact not found", 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, no-store");
  headers.set("content-disposition", "inline");
  return new Response(object.body, { headers });
}

function isReadingStatus(value: unknown): value is ReadingState["status"] {
  return value === "unread" || value === "reading" || value === "read";
}

function isWebCaptureBody(value: unknown): value is {
  readonly url: string;
} {
  return (
    isRecord(value) && Object.keys(value).length === 1 && typeof value.url === "string" && value.url.length > 0 && value.url.length <= 4096
  );
}

function safeFilename(value: string): string {
  const decoded = decodeURIComponent(value);
  const sanitized = decoded.replaceAll(/[\r\n"/\\]/gu, "-").trim();
  return sanitized.toLowerCase().endsWith(".pdf") ? sanitized : `${sanitized || "paper"}.pdf`;
}

function noStore(): { headers: { "cache-control": string } } {
  return { headers: { "cache-control": "no-store" } };
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, ...noStore() });
}

async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maximumBytes) throw new Error("Import exceeds the size limit");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) throw new Error("Import exceeds the size limit");
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function importPortableLibrary(request: Request, identity: AuthIdentity, library: ReferenceLibraryApi): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > 5_000_000) return jsonError("Portable library archive exceeds 5 MB", 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 5_000_000) return jsonError("Portable library archive exceeds 5 MB", 413);
  const files = unzipSync(bytes, {
    filter: (file) => (file.name === "references.csl.json" || file.name === "research.json") && file.originalSize <= 2_000_000,
  });
  const referencesFile = files["references.csl.json"];
  const researchFile = files["research.json"];
  if (!referencesFile || !researchFile) return jsonError("Portable library archive is missing required metadata", 400);
  if (referencesFile.byteLength + researchFile.byteLength > 3_000_000) return jsonError("Portable library metadata exceeds 3 MB", 413);
  const items = parseCslJson(JSON.parse(strFromU8(referencesFile)));
  const research = parsePortableResearch(JSON.parse(strFromU8(researchFile)));
  const imported = await library.importBibTeX(cslJsonToBibTeX(items), identity.email);
  const identities = new Map(
    items.map((item, index) => [item.id, imported[index]?.reference.id]).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  for (const [oldId, tags] of Object.entries(research.tags)) {
    const referenceId = identities.get(oldId);
    if (referenceId) await library.setTags(referenceId, tags);
  }
  for (const [oldId, collections] of Object.entries(research.collections)) {
    const referenceId = identities.get(oldId);
    if (referenceId) await library.setCollections(referenceId, collections);
  }
  for (const note of research.notes) {
    const referenceId = identities.get(note.referenceId);
    if (referenceId) await library.createNote(referenceId, note.body);
  }
  for (const state of research.reading) {
    const referenceId = identities.get(state.referenceId);
    if (referenceId) await library.setReadingState(referenceId, state.status, state.rating, state.priority);
  }
  return Response.json({ imported: imported.length, restoredOrganization: identities.size }, { status: 201, ...noStore() });
}

function downloadJson(value: unknown, filename: string): Response {
  return new Response(`${JSON.stringify(value, null, 2)}\n`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
