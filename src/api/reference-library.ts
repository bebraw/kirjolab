import {
  compareWebSnapshotText,
  crossrefMetadataFields,
  extractWebDocument,
  isReferenceLibrarySnapshot,
  isLibraryHighlightImportCandidate,
  maximumMetadataRefinementCandidates,
  normalizeWebSourceUrl,
  type BibliographicRecord,
  type CrossrefMetadata,
  type CrossrefMetadataField,
  type LibraryHighlight,
  type LibraryHighlightImportCandidate,
  type LibraryNote,
  type LibraryPdfArtifact,
  type LibraryPdfDrawing,
  type LibraryPdfMarkup,
  type LibraryPdfNote,
  type LibraryPdfPoint,
  type MetadataRefinementPreview,
  type PdfDraftResult,
  type ReadingState,
  type ReferenceLibrarySnapshot,
  type ReviewedPdfMetadata,
  type ReviewedProviderMetadataSelection,
  type ScholarlyMetadataProvider,
  type WebCaptureRegistration,
  type WebSnapshot,
} from "../domain/reference-library";
import {
  isReferenceDiscoveryQuery,
  mergeReferenceDiscoveryCandidates,
  type ReferenceDiscoveryCandidate,
} from "../domain/reference-discovery";
import {
  isCreateCitationAssertionInput,
  isReviewCitationAssertionInput,
  type CitationAssertion,
  type CitationNetwork,
  type CreateCitationAssertionInput,
  type ReviewCitationAssertionInput,
} from "../domain/citation-assertions";
import {
  isAcceptCitationCandidateInput,
  type CitationCandidateAcceptance,
  type CitationCandidateSource,
} from "../domain/citation-expansion";
import type { ReferenceDeletionImpact, ReferenceImportItem, WebCaptureItem } from "../durable-objects/reference-library";
import { normalizeDoi, parseBibTeX } from "../domain/bibliography";
import { isValidDoi } from "../domain/publication-intake";
import { fetchCrossrefReferences, fetchCrossrefWork, fingerprintPublicationMetadata, searchCrossrefWorks } from "../integrations/crossref";
import { fetchDataCiteWork } from "../integrations/datacite";
import { fetchOpenAlexWork, searchOpenAlexWorks } from "../integrations/openalex";
import { fetchSemanticScholarWork, searchSemanticScholarWorks } from "../integrations/semantic-scholar";
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
import { renderAnnotatedPdf } from "./annotated-pdf";
import { downloadR2Object } from "./r2-download";
import { workspaceStorageKey } from "./reviews";

const maximumPdfBytes = 25 * 1024 * 1024;
const maximumWebRawBytes = 2 * 1024 * 1024;
const maximumWebReadableBytes = 1024 * 1024;
const maximumWebRedirects = 5;

type ExternalFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface ReferenceLibraryApi {
  getSnapshot(includeArchived?: boolean): Promise<ReferenceLibrarySnapshot>;
  importBibTeX(source: string, actor: string): Promise<ReferenceImportItem[]>;
  registerPdf(artifact: LibraryPdfArtifact): Promise<LibraryPdfArtifact>;
  createPdfDraft(artifact: LibraryPdfArtifact, actor: string): Promise<PdfDraftResult>;
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
  applyReviewedProviderMetadataBatch(
    referenceId: string,
    selections: readonly ReviewedProviderMetadataSelection[],
    actor: string,
  ): Promise<BibliographicRecord>;
  getPdfMetadataContext(referenceId: string, artifactId: string): Promise<{ reference: BibliographicRecord; artifact: LibraryPdfArtifact }>;
  getMetadataRefinementPreview(cacheKey: string): Promise<MetadataRefinementPreview | null>;
  cacheMetadataRefinementPreview(cacheKey: string, preview: MetadataRefinementPreview): Promise<void>;
  setTags(referenceId: string, tags: readonly string[]): Promise<readonly string[]>;
  setCollections(referenceId: string, collections: readonly string[]): Promise<readonly string[]>;
  createNote(referenceId: string, body: string): Promise<LibraryNote>;
  createHighlight(
    referenceId: string,
    artifactId: string,
    page: number,
    quote: string,
    comment: string,
    rects: unknown,
  ): Promise<LibraryHighlight>;
  updateHighlightComment(referenceId: string, highlightId: string, comment: string): Promise<LibraryHighlight>;
  importHighlights(
    referenceId: string,
    artifactId: string,
    candidates: readonly LibraryHighlightImportCandidate[],
  ): Promise<LibraryHighlight[]>;
  createPdfNote(referenceId: string, artifactId: string, page: number, x: number, y: number, body: string): Promise<LibraryPdfNote>;
  createPdfDrawing(
    referenceId: string,
    artifactId: string,
    page: number,
    color: string,
    width: number,
    points: readonly LibraryPdfPoint[],
  ): Promise<LibraryPdfDrawing>;
  updatePdfNote(referenceId: string, markupId: string, x: number, y: number, body?: string): Promise<LibraryPdfNote>;
  updatePdfDrawing(referenceId: string, markupId: string, color: string, width: number): Promise<LibraryPdfDrawing>;
  deletePdfMarkup(referenceId: string, markupId: string): Promise<LibraryPdfMarkup>;
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
  acceptCitationCandidate(
    citingReferenceId: string,
    metadata: CrossrefMetadata,
    source: CitationCandidateSource,
    actor: string,
  ): Promise<CitationCandidateAcceptance>;
  getCitationAssertions(referenceId?: string): Promise<CitationAssertion[]>;
  reviewCitationAssertion(assertionId: string, input: ReviewCitationAssertionInput, reviewer: string): Promise<CitationAssertion>;
  getCitationNetwork(projectId?: string): Promise<CitationNetwork>;
}

interface ReferenceLibraryApiEnv {
  readonly REFERENCE_LIBRARIES: { getByName(name: string): ReferenceLibraryApi };
  readonly DOCUMENT_ROOMS?: {
    getByName(name: string): {
      refineGeneratedProjectReferenceAlias(
        workspaceId: string,
        referenceId: string,
        previousAlias: string,
        nextAlias: string,
      ): Promise<boolean>;
    };
  };
  readonly PAPERS: Pick<R2Bucket, "put" | "get" | "delete">;
  readonly CROSSREF_MAILTO: string;
  readonly OPENALEX_API_KEY?: string;
  readonly SEMANTIC_SCHOLAR_API_KEY?: string;
}

interface ReferenceLibraryRouteContext {
  readonly request: Request;
  readonly url: URL;
  readonly suffix: string;
  readonly env: ReferenceLibraryApiEnv;
  readonly identity: AuthIdentity;
  readonly library: ReferenceLibraryApi;
  readonly fetchExternal: ExternalFetch;
}

interface LibraryReferenceRouteContext extends ReferenceLibraryRouteContext {
  readonly referenceId: string;
  readonly action: string | undefined;
}

type ReferenceMetadataUpdate = Pick<BibliographicRecord, "type" | "title" | "authors" | "year" | "venue" | "doi" | "url" | "abstract">;

interface LibraryHighlightCreation {
  readonly artifactId: string;
  readonly page: number;
  readonly quote: string;
  readonly comment: string;
  readonly rects: readonly unknown[];
}

interface LibraryHighlightImportCreation {
  readonly artifactId: string;
  readonly candidates: readonly LibraryHighlightImportCandidate[];
}

interface LibraryPdfNoteCreation {
  readonly kind: "note";
  readonly artifactId: string;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly body: string;
}

interface LibraryPdfDrawingCreation {
  readonly kind: "drawing";
  readonly artifactId: string;
  readonly page: number;
  readonly color: string;
  readonly width: number;
  readonly points: readonly LibraryPdfPoint[];
}

const referenceMetadataStringFields = ["type", "year", "venue", "doi", "url"] as const;

export async function handleReferenceLibraryApi(
  request: Request,
  env: ReferenceLibraryApiEnv,
  identity: AuthIdentity,
  fetchExternal: ExternalFetch = (input, init) => fetch(input, init),
): Promise<Response> {
  const url = new URL(request.url);
  const suffix = url.pathname.slice("/api/library".length) || "/";
  const library = env.REFERENCE_LIBRARIES.getByName(identity.ownerKey);
  const context = { request, url, suffix, env, identity, library, fetchExternal } satisfies ReferenceLibraryRouteContext;
  try {
    const collectionResponse = await handleLibraryCollectionRoutes(context);
    if (collectionResponse) return collectionResponse;
    const webResponse = await handleLibraryWebRoutes(context);
    if (webResponse) return webResponse;
    const citationResponse = await handleLibraryCitationRoutes(context);
    if (citationResponse) return citationResponse;
    const pdfResponse = await handleLibraryPdfRoutes(context);
    if (pdfResponse) return pdfResponse;
    const metadataResponse = await handleLibraryMetadataRoutes(context);
    if (metadataResponse) return metadataResponse;
    const annotationResponse = await handleLibraryAnnotationMutationRoutes(context);
    if (annotationResponse) return annotationResponse;
    const referenceMatch =
      /^\/references\/([0-9a-f-]{36})(?:\/(tags|collections|notes|highlights|highlight-imports|pdf-markups|reading|deletion-impact|web-snapshots|citation-expansions|citation-candidates|pdf-metadata))?$/iu.exec(
        suffix,
      );
    if (!referenceMatch?.[1]) return jsonError("Library route not found", 404);
    const referenceId = referenceMatch[1];
    const action = referenceMatch[2];
    const referenceContext = { ...context, referenceId, action } satisfies LibraryReferenceRouteContext;
    const referenceMetadataResponse = await handleLibraryReferenceMetadataRoutes(referenceContext);
    if (referenceMetadataResponse) return referenceMetadataResponse;
    const organizationResponse = await handleLibraryReferenceOrganizationRoutes(referenceContext);
    if (organizationResponse) return organizationResponse;
    const annotationCreationResponse = await handleLibraryReferenceAnnotationCreationRoutes(referenceContext);
    if (annotationCreationResponse) return annotationCreationResponse;
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
    if (action === "citation-candidates" && request.method === "POST") {
      return await acceptCitationCandidate(request, referenceId, identity, env, library, fetchExternal);
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

async function handleLibraryCollectionRoutes(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, url, suffix, library } = context;
  if (suffix === "/" && request.method === "GET") {
    return Response.json(await library.getSnapshot(url.searchParams.get("archived") === "include"), noStore());
  }

  const importResponse = await handleLibraryImportRoutes(context);
  if (importResponse) return importResponse;
  const discoveryResponse = await handleLibraryDiscoveryRoute(context);
  if (discoveryResponse) return discoveryResponse;
  return await handleLibraryExportRoutes(context);
}

async function handleLibraryImportRoutes(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, suffix, identity, library } = context;
  if (suffix === "/import" && request.method === "POST") {
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.bibtex !== "string" || body.bibtex.length === 0 || body.bibtex.length > 2_000_000) {
      return jsonError("Invalid BibTeX import", 400);
    }
    if (parseBibTeX(body.bibtex).length === 0) return jsonError("No valid BibTeX entries found", 400);
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
  return null;
}

async function handleLibraryDiscoveryRoute(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, suffix, env, fetchExternal } = context;
  if (suffix === "/discovery" && request.method === "POST") {
    const body: unknown = await request.json();
    const query = isRecord(body)
      ? {
          query: body.query,
          author: typeof body.author === "string" ? body.author : "",
          year: typeof body.year === "string" ? body.year : "",
          type: typeof body.type === "string" ? body.type : "",
        }
      : body;
    if (!isReferenceDiscoveryQuery(query)) return jsonError("Invalid reference discovery query", 400);
    const matches = await searchReferenceDiscoveryProviders(
      { title: query.query.trim(), authors: [query.author.trim()].filter(Boolean), year: query.year },
      env,
      fetchExternal,
    );
    return Response.json(
      matches.filter(({ metadata }) => !query.type || metadata.type === query.type),
      noStore(),
    );
  }
  return null;
}

async function handleLibraryExportRoutes(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, suffix, library } = context;
  if (suffix === "/export/csl.json" && request.method === "GET") {
    const snapshot = await library.getSnapshot(true);
    return downloadJson(snapshot.references.map(referenceToCslJson), "kirjolab-library.csl.json");
  }
  if (suffix !== "/export/library.zip" || request.method !== "GET") return null;

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

async function handleLibraryWebRoutes(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const captureResponse = await handleLibraryWebCaptureRoute(context);
  if (captureResponse) return captureResponse;
  const comparisonResponse = await handleLibraryWebComparisonRoute(context);
  if (comparisonResponse) return comparisonResponse;
  return await handleLibraryWebSnapshotRoute(context);
}

async function handleLibraryWebCaptureRoute(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, suffix, identity, env, library, fetchExternal } = context;
  if (suffix !== "/web-sources" || request.method !== "POST") return null;
  return await captureWebSource(request, identity, env, library, fetchExternal);
}

async function handleLibraryWebComparisonRoute(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, suffix, env, library } = context;
  const comparisonMatch = /^\/web-snapshots\/([0-9a-f-]{36})\/compare\/([0-9a-f-]{36})$/iu.exec(suffix);
  if (!comparisonMatch?.[1] || !comparisonMatch[2] || request.method !== "GET") return null;
  return await compareWebSnapshots(comparisonMatch[1], comparisonMatch[2], env, library);
}

async function handleLibraryWebSnapshotRoute(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, suffix, env, library } = context;
  const webSnapshotMatch = /^\/web-snapshots\/([0-9a-f-]{36})(?:\/(raw|readable))?$/iu.exec(suffix);
  if (!webSnapshotMatch?.[1] || request.method !== "GET") return null;

  const snapshot = await library.getWebSnapshot(webSnapshotMatch[1]);
  const representation = webSnapshotMatch[2];
  if (!representation) return Response.json(snapshot, noStore());
  if (representation !== "raw" && representation !== "readable") return jsonError("Invalid web snapshot representation", 400);
  return await downloadWebSnapshot(snapshot, representation, env);
}

async function handleLibraryCitationRoutes(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const networkResponse = await handleLibraryCitationNetworkRoute(context);
  if (networkResponse) return networkResponse;
  const assertionResponse = await handleLibraryCitationAssertionRoutes(context);
  if (assertionResponse) return assertionResponse;
  return await handleLibraryCitationReviewRoute(context);
}

async function handleLibraryCitationNetworkRoute(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, url, suffix, library } = context;
  if (suffix !== "/citation-network" || request.method !== "GET") return null;
  const projectId = url.searchParams.get("projectId")?.trim() || undefined;
  if (projectId && !/^[a-z0-9-]{1,64}$/iu.test(projectId)) return jsonError("Invalid citation-network project filter", 400);
  return Response.json(await library.getCitationNetwork(projectId), noStore());
}

async function handleLibraryCitationAssertionRoutes(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, url, suffix, identity, library } = context;
  if (suffix === "/citation-assertions" && request.method === "GET") {
    const referenceId = url.searchParams.get("referenceId")?.trim() || undefined;
    return Response.json(await library.getCitationAssertions(referenceId), noStore());
  }
  if (suffix === "/citation-assertions" && request.method === "POST") {
    const body: unknown = await request.json();
    if (!isCreateCitationAssertionInput(body)) return jsonError("Invalid citation assertion", 400);
    return Response.json((await library.createCitationAssertions([body], identity.email))[0], { status: 201, ...noStore() });
  }
  return null;
}

async function handleLibraryCitationReviewRoute(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, suffix, identity, library } = context;
  const assertionReviewMatch = /^\/citation-assertions\/([0-9a-f-]{36})\/review$/iu.exec(suffix);
  if (!assertionReviewMatch?.[1] || request.method !== "POST") return null;

  const body: unknown = await request.json();
  if (!isReviewCitationAssertionInput(body)) return jsonError("Invalid citation assertion review", 400);
  return Response.json(await library.reviewCitationAssertion(assertionReviewMatch[1], body, identity.email), noStore());
}

async function handleLibraryPdfRoutes(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, suffix, identity, env, library } = context;
  if (suffix === "/pdfs" && request.method === "POST") {
    return await uploadLibraryPdf(request, identity.ownerKey, identity.email, env, library);
  }
  const downloadResponse = await handleLibraryPdfDownloadRoute(context);
  if (downloadResponse) return downloadResponse;
  const identificationResponse = await handleLibraryPdfIdentificationRoute(context);
  if (identificationResponse) return identificationResponse;
  return await handleLibraryPdfRightsRoute(context);
}

async function handleLibraryPdfDownloadRoute(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, suffix, env, library } = context;
  const pdfMatch = /^\/pdfs\/([0-9a-f-]{36})(?:\/(identify|rights|annotated))?$/iu.exec(suffix);
  if (!pdfMatch?.[1] || request.method !== "GET") return null;
  if (!pdfMatch[2]) return await downloadLibraryPdf(request, pdfMatch[1], env, library);
  if (pdfMatch[2] === "annotated") return await downloadAnnotatedLibraryPdf(pdfMatch[1], env, library);
  return null;
}

async function handleLibraryPdfIdentificationRoute(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, suffix, library } = context;
  const pdfMatch = /^\/pdfs\/([0-9a-f-]{36})\/identify$/iu.exec(suffix);
  if (!pdfMatch?.[1] || request.method !== "POST") return null;
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.referenceId !== "string") return jsonError("Invalid PDF identification", 400);
  return Response.json(await library.identifyPdf(pdfMatch[1], body.referenceId), noStore());
}

async function handleLibraryPdfRightsRoute(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, suffix, library } = context;
  const pdfMatch = /^\/pdfs\/([0-9a-f-]{36})\/rights$/iu.exec(suffix);
  if (!pdfMatch?.[1] || request.method !== "PUT") return null;
  const body: unknown = await request.json();
  if (!isRecord(body) || (body.rights !== "private" && body.rights !== "shareable" && body.rights !== "unknown")) {
    return jsonError("Invalid artifact rights", 400);
  }
  return Response.json(await library.setArtifactRights(pdfMatch[1], body.rights), noStore());
}

async function handleLibraryMetadataRoutes(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const crossrefResponse = await handleLibraryCrossrefRoute(context);
  if (crossrefResponse) return crossrefResponse;
  return await handleLibraryMetadataRefinementRoute(context);
}

async function handleLibraryCrossrefRoute(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, suffix, identity, env, library, fetchExternal } = context;
  const crossrefMatch = /^\/references\/([0-9a-f-]{36})\/crossref\/(preview|accept)$/iu.exec(suffix);
  if (!crossrefMatch?.[1] || !crossrefMatch[2] || request.method !== "POST") return null;
  return crossrefMatch[2] === "preview"
    ? await previewCrossrefMetadata(crossrefMatch[1], env, library, fetchExternal)
    : await acceptCrossrefMetadata(request, crossrefMatch[1], identity, env, library, fetchExternal);
}

async function handleLibraryMetadataRefinementRoute(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, suffix, identity, env, library, fetchExternal } = context;
  const refinementMatch = /^\/references\/([0-9a-f-]{36})\/metadata-refinement\/(preview|accept)$/iu.exec(suffix);
  if (!refinementMatch?.[1] || !refinementMatch[2] || request.method !== "POST") return null;
  return refinementMatch[2] === "preview"
    ? await previewMetadataRefinement(request, refinementMatch[1], env, library, fetchExternal)
    : await acceptMetadataRefinement(request, refinementMatch[1], identity, env, library, fetchExternal);
}

async function handleLibraryAnnotationMutationRoutes(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const pdfMarkupResponse = await handleLibraryPdfMarkupMutationRoute(context);
  if (pdfMarkupResponse) return pdfMarkupResponse;
  return await handleLibraryHighlightMutationRoute(context);
}

async function handleLibraryPdfMarkupMutationRoute(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, suffix, library } = context;
  const pdfMarkupMatch = /^\/references\/([0-9a-f-]{36})\/pdf-markups\/([0-9a-f-]{36})$/iu.exec(suffix);
  if (!pdfMarkupMatch?.[1] || !pdfMarkupMatch[2]) return null;
  if (request.method === "DELETE") {
    return Response.json(await library.deletePdfMarkup(pdfMarkupMatch[1], pdfMarkupMatch[2]), noStore());
  }
  if (request.method !== "PATCH") return null;
  return await updateLibraryPdfMarkup(request, pdfMarkupMatch[1], pdfMarkupMatch[2], library);
}

async function updateLibraryPdfMarkup(
  request: Request,
  referenceId: string,
  markupId: string,
  library: ReferenceLibraryApi,
): Promise<Response> {
  const body: unknown = await request.json();
  if (isRecord(body) && typeof body.color === "string" && typeof body.width === "number") {
    return Response.json(await library.updatePdfDrawing(referenceId, markupId, body.color, body.width), noStore());
  }
  if (!isPdfNotePositionUpdate(body)) return jsonError("Invalid private PDF note position", 400);
  return Response.json(await library.updatePdfNote(referenceId, markupId, body.x, body.y, body.body), noStore());
}

function isPdfNotePositionUpdate(value: unknown): value is { readonly x: number; readonly y: number; readonly body?: string } {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    (value.body === undefined || typeof value.body === "string")
  );
}

async function handleLibraryHighlightMutationRoute(context: ReferenceLibraryRouteContext): Promise<Response | null> {
  const { request, suffix, library } = context;
  const highlightMatch = /^\/references\/([0-9a-f-]{36})\/highlights\/([0-9a-f-]{36})$/iu.exec(suffix);
  if (!highlightMatch?.[1] || !highlightMatch[2] || request.method !== "PATCH") return null;
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.comment !== "string") return jsonError("Invalid private highlight comment", 400);
  return Response.json(await library.updateHighlightComment(highlightMatch[1], highlightMatch[2], body.comment), noStore());
}

async function handleLibraryReferenceMetadataRoutes(context: LibraryReferenceRouteContext): Promise<Response | null> {
  const { request, action, referenceId, identity, env, library } = context;
  if (action === "pdf-metadata" && request.method === "POST") {
    const body: unknown = await request.json();
    if (!isReviewedPdfMetadataInput(body)) return jsonError("Invalid reviewed PDF metadata", 400);
    return Response.json(
      await mutateReferenceMetadata(referenceId, identity, env, library, () =>
        library.applyReviewedPdfMetadata(referenceId, body.artifactId, body.fields, identity.email),
      ),
      noStore(),
    );
  }
  if (action !== undefined || request.method !== "PATCH") return null;

  const body: unknown = await request.json();
  if (!isRecord(body)) return jsonError("Invalid reference update", 400);
  if (typeof body.archived === "boolean") return Response.json(await library.archiveReference(referenceId, body.archived), noStore());
  if (!isReferenceMetadataUpdate(body)) return jsonError("Invalid bibliographic metadata", 400);
  return Response.json(
    await mutateReferenceMetadata(referenceId, identity, env, library, () =>
      library.updateReferenceMetadata(referenceId, body, identity.email),
    ),
    noStore(),
  );
}

function isReferenceMetadataUpdate(value: unknown): value is ReferenceMetadataUpdate {
  return (
    isRecord(value) &&
    referenceMetadataStringFields.every((field) => typeof value[field] === "string") &&
    Array.isArray(value.authors) &&
    value.authors.every((author) => typeof author === "string") &&
    typeof value.title === "string" &&
    value.title.length <= 2_000 &&
    typeof value.abstract === "string" &&
    value.abstract.length <= 20_000
  );
}

async function handleLibraryReferenceOrganizationRoutes(context: LibraryReferenceRouteContext): Promise<Response | null> {
  const tagsResponse = await handleLibraryReferenceTagsRoute(context);
  if (tagsResponse) return tagsResponse;
  const collectionsResponse = await handleLibraryReferenceCollectionsRoute(context);
  if (collectionsResponse) return collectionsResponse;
  return await handleLibraryReferenceNotesRoute(context);
}

async function handleLibraryReferenceTagsRoute(context: LibraryReferenceRouteContext): Promise<Response | null> {
  const { request, action, referenceId, library } = context;
  if (action !== "tags" || request.method !== "PUT") return null;
  const body: unknown = await request.json();
  if (!isRecord(body) || !Array.isArray(body.tags) || !body.tags.every((tag) => typeof tag === "string")) {
    return jsonError("Invalid reference tags", 400);
  }
  return Response.json(await library.setTags(referenceId, body.tags), noStore());
}

async function handleLibraryReferenceCollectionsRoute(context: LibraryReferenceRouteContext): Promise<Response | null> {
  const { request, action, referenceId, library } = context;
  if (action !== "collections" || request.method !== "PUT") return null;
  const body: unknown = await request.json();
  if (!isRecord(body) || !Array.isArray(body.collections) || !body.collections.every((item) => typeof item === "string")) {
    return jsonError("Invalid reference collections", 400);
  }
  return Response.json(await library.setCollections(referenceId, body.collections), noStore());
}

async function handleLibraryReferenceNotesRoute(context: LibraryReferenceRouteContext): Promise<Response | null> {
  const { request, action, referenceId, library } = context;
  if (action !== "notes" || request.method !== "POST") return null;
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.body !== "string") return jsonError("Invalid reference note", 400);
  return Response.json(await library.createNote(referenceId, body.body), { status: 201, ...noStore() });
}

async function handleLibraryReferenceAnnotationCreationRoutes(context: LibraryReferenceRouteContext): Promise<Response | null> {
  const highlightResponse = await handleLibraryReferenceHighlightCreationRoute(context);
  if (highlightResponse) return highlightResponse;
  const importResponse = await handleLibraryReferenceHighlightImportRoute(context);
  if (importResponse) return importResponse;
  return await handleLibraryReferencePdfMarkupCreationRoute(context);
}

async function handleLibraryReferenceHighlightCreationRoute(context: LibraryReferenceRouteContext): Promise<Response | null> {
  const { request, action, referenceId, library } = context;
  if (action !== "highlights" || request.method !== "POST") return null;
  const body: unknown = await request.json();
  if (!isLibraryHighlightCreation(body)) return jsonError("Invalid private highlight", 400);
  return Response.json(await library.createHighlight(referenceId, body.artifactId, body.page, body.quote, body.comment, body.rects), {
    status: 201,
    ...noStore(),
  });
}

function isLibraryHighlightCreation(value: unknown): value is LibraryHighlightCreation {
  return (
    isRecord(value) &&
    typeof value.artifactId === "string" &&
    typeof value.page === "number" &&
    typeof value.quote === "string" &&
    typeof value.comment === "string" &&
    Array.isArray(value.rects)
  );
}

async function handleLibraryReferenceHighlightImportRoute(context: LibraryReferenceRouteContext): Promise<Response | null> {
  const { request, action, referenceId, library } = context;
  if (action !== "highlight-imports" || request.method !== "POST") return null;
  const body: unknown = await request.json();
  if (!isLibraryHighlightImportCreation(body)) return jsonError("Invalid PDF highlight import", 400);
  return Response.json(await library.importHighlights(referenceId, body.artifactId, body.candidates), {
    status: 201,
    ...noStore(),
  });
}

function isLibraryHighlightImportCreation(value: unknown): value is LibraryHighlightImportCreation {
  return (
    isRecord(value) &&
    typeof value.artifactId === "string" &&
    Array.isArray(value.candidates) &&
    value.candidates.length >= 1 &&
    value.candidates.length <= 128 &&
    value.candidates.every(isLibraryHighlightImportCandidate)
  );
}

async function handleLibraryReferencePdfMarkupCreationRoute(context: LibraryReferenceRouteContext): Promise<Response | null> {
  const { request, action, referenceId, library } = context;
  if (action !== "pdf-markups" || request.method !== "POST") return null;
  const body: unknown = await request.json();
  if (isLibraryPdfNoteCreation(body)) {
    return Response.json(await library.createPdfNote(referenceId, body.artifactId, body.page, body.x, body.y, body.body), {
      status: 201,
      ...noStore(),
    });
  }
  if (isLibraryPdfDrawingCreation(body)) {
    return Response.json(await library.createPdfDrawing(referenceId, body.artifactId, body.page, body.color, body.width, body.points), {
      status: 201,
      ...noStore(),
    });
  }
  return jsonError("Invalid private PDF annotation", 400);
}

function isLibraryPdfNoteCreation(value: unknown): value is LibraryPdfNoteCreation {
  return (
    isRecord(value) &&
    value.kind === "note" &&
    typeof value.artifactId === "string" &&
    typeof value.page === "number" &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.body === "string"
  );
}

function isLibraryPdfDrawingCreation(value: unknown): value is LibraryPdfDrawingCreation {
  return (
    isRecord(value) &&
    value.kind === "drawing" &&
    typeof value.artifactId === "string" &&
    typeof value.page === "number" &&
    typeof value.color === "string" &&
    typeof value.width === "number" &&
    Array.isArray(value.points) &&
    value.points.every(isLibraryPdfPoint)
  );
}

function isLibraryPdfPoint(value: unknown): value is LibraryPdfPoint {
  return isRecord(value) && typeof value.x === "number" && typeof value.y === "number";
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
    await mutateReferenceMetadata(referenceId, identity, env, library, () =>
      library.applyReviewedCrossrefMetadata(referenceId, reference.doi, complete, body.fields, identity.email),
    ),
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
  const cacheKey = metadataRefinementPreviewCacheKey(reference, body.artifactId, body.candidates, env);
  const cached = await library.getMetadataRefinementPreview(cacheKey);
  if (cached) {
    return Response.json(cached, {
      headers: { "cache-control": "no-store", "x-kirjolab-metadata-cache": "hit" },
    });
  }
  const query = {
    title: body.candidates.title?.trim() || reference.title,
    authors: body.candidates.authors ?? reference.authors,
    year: body.candidates.year?.trim() || reference.year,
  };
  const doi = normalizeDoi(body.candidates.doi?.trim() || reference.doi);
  const matches = doi
    ? (await doiMetadataProviders(doi, env, fetchExternal)).map((provider) => ({ provider, match: "doi" as const, score: null }))
    : await searchMetadataProviders(query, env, fetchExternal);
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
  const preview: MetadataRefinementPreview = { referenceId, artifactId: body.artifactId, candidates };
  await library.cacheMetadataRefinementPreview(cacheKey, preview);
  return Response.json(preview, {
    headers: { "cache-control": "no-store", "x-kirjolab-metadata-cache": "miss" },
  });
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
  if (!isMetadataRefinementAcceptanceInput(body) && !isMetadataRefinementBatchAcceptanceInput(body)) {
    return jsonError("Invalid metadata refinement acceptance", 400);
  }
  const reference = await libraryReference(referenceId, library);
  const requestedSelections = "selections" in body ? body.selections : [body];
  const doi = normalizeDoi(requestedSelections[0]!.doi);
  if (reference.doi && normalizeDoi(reference.doi) !== doi) return jsonError("Reference DOI changed; refine metadata again", 409);
  const conflict = await duplicateDoiValueResponse(reference, doi, library);
  if (conflict) return conflict;
  const selections: ReviewedProviderMetadataSelection[] = [];
  for (const selection of requestedSelections) {
    const metadataValue = await fetchProviderWork(selection.provider, doi, env, fetchExternal);
    const metadata: CrossrefMetadata = { ...metadataValue, type: metadataValue.type ?? "misc" };
    if ((await fingerprintPublicationMetadata(metadata)) !== selection.metadataFingerprint) {
      return jsonError("Provider metadata changed; review it again", 409);
    }
    selections.push({ provider: selection.provider, metadata, fields: selection.fields });
  }
  const updated = await mutateReferenceMetadata(referenceId, identity, env, library, () =>
    selections.length === 1 && !("selections" in body)
      ? library.applyReviewedProviderMetadata(
          referenceId,
          selections[0]!.metadata,
          selections[0]!.fields,
          selections[0]!.provider,
          identity.email,
        )
      : library.applyReviewedProviderMetadataBatch(referenceId, selections, identity.email),
  );
  return Response.json(updated, noStore());
}

function metadataRefinementPreviewCacheKey(
  reference: BibliographicRecord,
  artifactId: string,
  candidates: ReviewedPdfMetadata,
  env: ReferenceLibraryApiEnv,
): string {
  return JSON.stringify({
    version: 1,
    referenceId: reference.id,
    artifactId,
    title: candidates.title?.trim() || reference.title.trim(),
    authors: (candidates.authors?.length ? candidates.authors : reference.authors).map((author) => author.trim()),
    year: candidates.year?.trim() || reference.year.trim(),
    doi: normalizeDoi(candidates.doi?.trim() || reference.doi),
    providers: {
      openalex: Boolean(env.OPENALEX_API_KEY?.trim()),
      crossref: true,
      datacite: true,
      semanticScholar: Boolean(env.SEMANTIC_SCHOLAR_API_KEY?.trim()),
    },
  });
}

async function doiMetadataProviders(
  doi: string,
  env: ReferenceLibraryApiEnv,
  fetchExternal: ExternalFetch,
): Promise<Array<{ name: ScholarlyMetadataProvider; metadata: Awaited<ReturnType<typeof fetchCrossrefWork>> }>> {
  const providers: Array<{ name: ScholarlyMetadataProvider; metadata: Awaited<ReturnType<typeof fetchCrossrefWork>> }> = [];
  let lastError: unknown;
  const collect = async (name: ScholarlyMetadataProvider): Promise<void> => {
    try {
      providers.push({ name, metadata: await fetchProviderWork(name, doi, env, fetchExternal) });
    } catch (error) {
      lastError = error;
    }
  };
  if (env.OPENALEX_API_KEY?.trim()) {
    await collect("openalex");
  }
  await collect("crossref");
  await collect("datacite");
  if (env.SEMANTIC_SCHOLAR_API_KEY?.trim()) await collect("semantic-scholar");
  if (providers.length === 0 && lastError) throw lastError;
  return providers;
}

async function searchMetadataProviders(
  query: { readonly title: string; readonly authors: readonly string[]; readonly year: string },
  env: ReferenceLibraryApiEnv,
  fetchExternal: ExternalFetch,
  options: { readonly usePublicSemanticScholar?: boolean } = {},
): Promise<
  Array<{
    provider: { name: ScholarlyMetadataProvider; metadata: Awaited<ReturnType<typeof fetchCrossrefWork>> };
    match: "bibliographic";
    score: number | null;
  }>
> {
  const results: Array<{
    provider: { name: ScholarlyMetadataProvider; metadata: Awaited<ReturnType<typeof fetchCrossrefWork>> };
    match: "bibliographic";
    score: number | null;
  }> = [];
  const seen = new Set<string>();
  let lastError: unknown;
  const append = (
    provider: ScholarlyMetadataProvider,
    matches: readonly { metadata: Awaited<ReturnType<typeof fetchCrossrefWork>>; score: number | null }[],
  ) => {
    for (const match of matches) {
      const doi = normalizeDoi(match.metadata.doi);
      const identity = `${provider}:${doi}`;
      if (!doi || seen.has(identity) || results.length >= maximumMetadataRefinementCandidates) continue;
      seen.add(identity);
      results.push({ provider: { name: provider, metadata: match.metadata }, match: "bibliographic", score: match.score });
    }
  };
  if (env.OPENALEX_API_KEY?.trim()) {
    try {
      append("openalex", await searchOpenAlexWorks(query, env.OPENALEX_API_KEY, fetchExternal));
    } catch (error) {
      lastError = error;
      // Continue to registry-backed discovery when the optional OpenAlex layer is unavailable.
    }
  }
  if (results.length < maximumMetadataRefinementCandidates) {
    try {
      append("crossref", await searchCrossrefWorks(query, env.CROSSREF_MAILTO, fetchExternal));
    } catch (error) {
      lastError = error;
    }
  }
  if (results.length < maximumMetadataRefinementCandidates && (options.usePublicSemanticScholar || env.SEMANTIC_SCHOLAR_API_KEY?.trim())) {
    try {
      append("semantic-scholar", await searchSemanticScholarWorks(query, env.SEMANTIC_SCHOLAR_API_KEY ?? "", fetchExternal));
    } catch (error) {
      lastError = error;
      // Earlier provider results remain reviewable when the public Semantic Scholar pool is unavailable.
    }
  }
  if (results.length === 0 && lastError) throw lastError;
  return results;
}

async function searchReferenceDiscoveryProviders(
  query: { readonly title: string; readonly authors: readonly string[]; readonly year: string },
  env: ReferenceLibraryApiEnv,
  fetchExternal: ExternalFetch,
): Promise<readonly ReturnType<typeof mergeReferenceDiscoveryCandidates>[number][]> {
  const candidates: ReferenceDiscoveryCandidate[] = [];
  let lastError: unknown;
  const collect = async (
    provider: ReferenceDiscoveryCandidate["provider"],
    search: () => Promise<readonly Omit<ReferenceDiscoveryCandidate, "provider">[]>,
  ): Promise<void> => {
    try {
      for (const candidate of await search()) candidates.push({ provider, ...candidate });
    } catch (error) {
      lastError = error;
    }
  };
  if (env.OPENALEX_API_KEY?.trim()) {
    await collect("openalex", () => searchOpenAlexWorks(query, env.OPENALEX_API_KEY ?? "", fetchExternal));
  }
  await collect("crossref", () => searchCrossrefWorks(query, env.CROSSREF_MAILTO, fetchExternal));
  await collect("semantic-scholar", () => searchSemanticScholarWorks(query, env.SEMANTIC_SCHOLAR_API_KEY ?? "", fetchExternal));
  if (candidates.length === 0 && lastError) throw lastError;
  return mergeReferenceDiscoveryCandidates(candidates);
}

function fetchProviderWork(
  provider: ScholarlyMetadataProvider,
  doi: string,
  env: ReferenceLibraryApiEnv,
  fetchExternal: ExternalFetch,
): Promise<Awaited<ReturnType<typeof fetchCrossrefWork>>> {
  if (provider === "openalex") return fetchOpenAlexWork(doi, env.OPENALEX_API_KEY ?? "", fetchExternal);
  if (provider === "crossref") return fetchCrossrefWork(doi, env.CROSSREF_MAILTO, fetchExternal);
  if (provider === "datacite") return fetchDataCiteWork(doi, env.CROSSREF_MAILTO, fetchExternal);
  return fetchSemanticScholarWork(doi, env.SEMANTIC_SCHOLAR_API_KEY ?? "", fetchExternal);
}

async function libraryReference(referenceId: string, library: ReferenceLibraryApi): Promise<BibliographicRecord> {
  const reference = (await library.getReferences([referenceId]))[0];
  if (!reference) throw new Error("Reference not found");
  return reference;
}

async function mutateReferenceMetadata(
  referenceId: string,
  identity: AuthIdentity,
  env: ReferenceLibraryApiEnv,
  library: ReferenceLibraryApi,
  mutate: () => Promise<BibliographicRecord>,
): Promise<BibliographicRecord> {
  const [previous, impact] = await Promise.all([libraryReference(referenceId, library), library.getDeletionImpact(referenceId)]);
  const updated = await mutate();
  if (updated.referenceKey === previous.referenceKey || !env.DOCUMENT_ROOMS) return updated;
  await Promise.allSettled(
    impact.projectIds.map((projectId) =>
      env
        .DOCUMENT_ROOMS!.getByName(workspaceStorageKey(identity, projectId))
        .refineGeneratedProjectReferenceAlias(projectId, referenceId, previous.referenceKey, updated.referenceKey),
    ),
  );
  return updated;
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
    ["openalex", "crossref", "datacite", "semantic-scholar"].includes(String(value.provider)) &&
    typeof value.doi === "string" &&
    isValidDoi(value.doi) &&
    isCrossrefAcceptanceInput(value)
  );
}

function isMetadataRefinementBatchAcceptanceInput(value: unknown): value is {
  selections: Array<{
    provider: ScholarlyMetadataProvider;
    doi: string;
    metadataFingerprint: string;
    fields: CrossrefMetadataField[];
  }>;
} {
  if (!isRecord(value) || !Array.isArray(value.selections) || value.selections.length === 0 || value.selections.length > 4) return false;
  if (!value.selections.every(isMetadataRefinementAcceptanceInput)) return false;
  const dois = new Set(value.selections.map((selection) => normalizeDoi(selection.doi)));
  const sources = new Set(value.selections.map((selection) => `${selection.provider}:${normalizeDoi(selection.doi)}`));
  const fields = value.selections.flatMap((selection) => selection.fields);
  return dois.size === 1 && sources.size === value.selections.length && new Set(fields).size === fields.length;
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
      seedReferenceId: source.id,
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

async function acceptCitationCandidate(
  request: Request,
  referenceId: string,
  identity: AuthIdentity,
  env: ReferenceLibraryApiEnv,
  library: ReferenceLibraryApi,
  fetchExternal: ExternalFetch,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isAcceptCitationCandidateInput(body)) return jsonError("Invalid citation candidate", 400);
  const source = (await library.getReferences([referenceId]))[0];
  if (!source) return jsonError("Reference not found", 404);
  if (!source.doi) return jsonError("Add a DOI before accepting external citation references", 409);
  const expansion = await fetchCrossrefReferences(source.doi, env.CROSSREF_MAILTO, fetchExternal);
  const doi = normalizeDoi(body.doi);
  if (expansion.responseId !== body.responseId || !expansion.candidates.some((candidate) => candidate.doi === doi)) {
    return jsonError("Citation expansion changed; expand the source again before saving", 409);
  }
  const fetched = await fetchCrossrefWork(doi, env.CROSSREF_MAILTO, fetchExternal);
  const metadata: CrossrefMetadata = { ...fetched, type: fetched.type ?? "misc" };
  const accepted = await library.acceptCitationCandidate(
    source.id,
    metadata,
    {
      observedAt: expansion.retrievedAt,
      responseId: expansion.responseId,
      sourceLocator: expansion.sourceLocator,
    },
    identity.email,
  );
  return Response.json(accepted, { status: accepted.created ? 201 : 200, ...noStore() });
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
  let draft: PdfDraftResult;
  try {
    draft = await library.createPdfDraft(artifact, actor);
  } catch (error) {
    await env.PAPERS.delete(objectKey);
    throw error;
  }
  if (!draft.created) await env.PAPERS.delete(objectKey);
  return Response.json(draft, { status: draft.created ? 201 : 200, ...noStore() });
}

async function downloadLibraryPdf(
  request: Request,
  artifactId: string,
  env: ReferenceLibraryApiEnv,
  library: ReferenceLibraryApi,
): Promise<Response> {
  const snapshot = await library.getSnapshot(true);
  if (!isReferenceLibrarySnapshot(snapshot)) throw new Error("Reference library returned an invalid snapshot");
  const artifact = snapshot.artifacts.find((item) => item.id === artifactId);
  if (!artifact) return jsonError("PDF artifact not found", 404);
  return (
    (await downloadR2Object(request, env.PAPERS, artifact.objectKey, {
      cacheControl: "private, no-store",
      contentDisposition: "inline",
    })) ?? jsonError("PDF artifact not found", 404)
  );
}

async function downloadAnnotatedLibraryPdf(
  artifactId: string,
  env: ReferenceLibraryApiEnv,
  library: ReferenceLibraryApi,
): Promise<Response> {
  const snapshot = await library.getSnapshot(true);
  if (!isReferenceLibrarySnapshot(snapshot)) throw new Error("Reference library returned an invalid snapshot");
  const artifact = snapshot.artifacts.find((item) => item.id === artifactId);
  if (!artifact) return jsonError("PDF artifact not found", 404);
  const object = await env.PAPERS.get(artifact.objectKey);
  if (!object) return jsonError("PDF artifact not found", 404);
  if (object.size > maximumPdfBytes) return jsonError("Stored PDF exceeds the 25 MB limit", 413);
  const bytes = await renderAnnotatedPdf(new Uint8Array(await object.arrayBuffer()), {
    markups: (snapshot.pdfMarkups ?? []).filter((markup) => markup.artifactId === artifact.id),
    highlights: snapshot.highlights.filter((highlight) => highlight.artifactId === artifact.id),
  });
  const filename = annotatedPdfFilename(artifact.name);
  return new Response(bytes, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-type": "application/pdf",
      "x-content-type-options": "nosniff",
    },
  });
}

function annotatedPdfFilename(value: string): string {
  const stem = value
    .replace(/\.pdf$/iu, "")
    .normalize("NFKD")
    .replaceAll(/[^\x20-\x7e]/gu, "")
    .replaceAll(/[^a-z0-9 .()_-]+/giu, "-")
    .replaceAll(/-+/gu, "-")
    .replaceAll(/^[-.\s]+|[-.\s]+$/gu, "")
    .slice(0, 180);
  return `${stem || "paper"}-annotated.pdf`;
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
