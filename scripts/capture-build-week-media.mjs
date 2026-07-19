import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, request } from "@playwright/test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mediaRoot = resolve(projectRoot, ".generated/build-week-media");
const uploadDirectory = join(mediaRoot, "upload");
const captionsPath = join(mediaRoot, "captions.md");
const baseURL = "http://127.0.0.1:8788";
const healthURL = `${baseURL}/api/health`;
const defaultCdpURL = "http://127.0.0.1:9222";
const capturePort = 8788;
const inspectorPort = 9230;
const captureWidth = 2_880;
const captureHeight = 1_920;
const maximumImageBytes = 5 * 1_024 * 1_024;
const maximumCaptionCharacters = 140;
const captureServerTimeoutMs = 120_000;

export const BUILD_WEEK_MEDIA = Object.freeze([
  {
    filename: "01-dashboard.png",
    caption: "Dashboard — Recent projects, sources, and independent reviews stay condensed into fast paths back to the work that matters.",
  },
  {
    filename: "02-library.png",
    caption:
      "Private library — Organize references, PDFs, web captures, annotations, and reading state without tying research to a project.",
  },
  {
    filename: "03-authoring-preview.png",
    caption:
      "Portable authoring — Plain Markdown and BibTeX sit beside a live scientific preview with citations, sections, and included files.",
  },
  {
    filename: "04-evidence-trail.png",
    caption:
      "Evidence trail — A manuscript claim stays linked to the exact PDF highlight that supports it, so provenance remains inspectable.",
  },
  {
    filename: "05-reference-annotation.png",
    caption:
      "Reference annotation — Select a passage, add a private note, and save its page and geometry without modifying the original PDF.",
  },
  {
    filename: "06-evidence-map.png",
    caption: "Evidence map — Typed links reveal how projects, manuscript sections, publications, claims, and model candidates connect.",
  },
  {
    filename: "07-reviewable-ai.png",
    caption:
      "Reviewable AI — Every local-model suggestion shows its target, evidence, model, and provenance before a researcher accepts it.",
  },
  {
    filename: "08-collaboration.png",
    caption: "Collaboration — Anchored comments, live presence, and pending suggestions stay outside portable source until reviewed.",
  },
  {
    filename: "09-share-links.png",
    caption: "Link sharing — Create or revoke separate read-only and edit links without asking collaborators to make accounts.",
  },
  {
    filename: "10-shared-editor.png",
    caption:
      "Scoped editor — An edit link opens the familiar source-and-PDF workspace while private research, history, and settings stay hidden.",
  },
  {
    filename: "11-portable-export.png",
    caption: "Portable export — Download publication-ready PDF and LaTeX, readable Markdown and BibTeX, or the complete source bundle.",
  },
  {
    filename: "12-revision-history.png",
    caption: "Recoverable history — Compare, name, branch, or restore project revisions without giving up the current draft.",
  },
  {
    filename: "13-project-templates.png",
    caption:
      "Reusable starts — Preview structure and publication settings before choosing a template or importing LaTeX or GitHub content.",
  },
  {
    filename: "14-review-catalog.png",
    caption: "Review catalog — Systematic and multivocal reviews now have independent identities, roles, lifecycles, and entry points.",
  },
  {
    filename: "15-independent-review.png",
    caption: "Independent review — An SLR or MLR links explicitly to projects, then carries frozen criteria through append-only screening.",
  },
]);

const libraryBibtex = `@article{lovelace2026traceable,
  title = {Traceable Evidence in Collaborative Writing},
  author = {Lovelace, Ada and Example, Lin},
  year = {2026},
  journal = {Journal of Inspectable Scholarship},
  abstract = {A synthetic record for evaluating evidence-aware authoring.}
}

@article{merton1942normative,
  title = {The Normative Structure of Science},
  author = {Merton, Robert K.},
  year = {1942},
  journal = {The Sociology of Science}
}

@article{example2025review,
  title = {Human Review Boundaries for Model-Assisted Research},
  author = {Example, Lin and Scholar, Mira},
  year = {2025},
  journal = {Open Research Systems}
}

@article{example2024portable,
  title = {Portable Scholarly Workflows},
  author = {Example, Ada},
  year = {2024},
  journal = {Journal of Durable Knowledge}
}`;

const projectBibtex = `@article{lovelace2026traceable,
  title = {Traceable Evidence in Collaborative Writing},
  author = {Lovelace, Ada and Example, Lin},
  year = {2026},
  journal = {Journal of Inspectable Scholarship},
  abstract = {A synthetic record for evaluating evidence-aware authoring.}
}`;

const reviewBibtex = `@article{traceable-review,
  title = {Traceable Assistance in Evidence Reviews},
  author = {Example, Ada},
  year = {2026},
  doi = {10.5555/kirjolab.demo},
  abstract = {A synthetic study of provenance-preserving review assistance.}
}

@article{opaque-review,
  title = {Opaque Automation Without Evidence},
  author = {Example, Lin},
  year = {2025},
  abstract = {A synthetic comparison record without traceable evidence.}
}`;

const helpText = `
Capture the current Build Week media set through an isolated local Worker.

Usage:
  npm run media:build-week
  npm run media:build-week -- --validate

Environment:
  KIRJOLAB_BUILD_WEEK_CDP_URL   Loopback Chrome DevTools endpoint.
                                Defaults to http://127.0.0.1:9222.

The capture command leaves reusable output only in .generated/build-week-media/.
`.trim();

export function parseCaptureOptions(argv = process.argv.slice(2), environment = process.env) {
  const unknown = argv.filter((argument) => argument !== "--help" && argument !== "-h" && argument !== "--validate");
  if (unknown.length > 0) throw new Error(`Unknown Build Week media option: ${unknown.join(", ")}`);
  if ((argv.includes("--help") || argv.includes("-h")) && argv.includes("--validate")) {
    throw new Error("Choose either help or validation mode");
  }
  const cdpURL = assertLoopbackCdpURL(environment.KIRJOLAB_BUILD_WEEK_CDP_URL || defaultCdpURL);
  return {
    cdpURL,
    mode: argv.includes("--help") || argv.includes("-h") ? "help" : argv.includes("--validate") ? "validate" : "capture",
  };
}

export function assertLoopbackCdpURL(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The Build Week CDP URL is invalid");
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error("The Build Week CDP URL must be an uncredentialed loopback HTTP origin");
  }
  return url.origin;
}

export function renderCaptionsMarkdown(media = BUILD_WEEK_MEDIA) {
  assertMediaManifest(media);
  const captions = media.map((item, index) => `${index + 1}. ${item.caption}`).join("\n");
  return `# Build Week Project Media\n\nUpload the images from \`upload/\` in numeric order.\n\n${captions}\n`;
}

export function assertMediaManifest(media = BUILD_WEEK_MEDIA) {
  if (!Array.isArray(media) || media.length !== 15) throw new Error("Build Week media must define exactly 15 images");
  const filenames = new Set();
  for (const item of media) {
    if (!item || typeof item.filename !== "string" || !/^\d{2}-[a-z0-9-]+\.png$/u.test(item.filename)) {
      throw new Error("Build Week media filename is invalid");
    }
    if (filenames.has(item.filename)) throw new Error(`Build Week media filename is duplicated: ${item.filename}`);
    filenames.add(item.filename);
    if (typeof item.caption !== "string" || item.caption.trim() !== item.caption || item.caption.length === 0) {
      throw new Error(`Build Week media caption is invalid: ${item.filename}`);
    }
    if (Array.from(item.caption).length > maximumCaptionCharacters) {
      throw new Error(`Build Week media caption exceeds ${maximumCaptionCharacters} characters: ${item.filename}`);
    }
  }
}

export function readPngMetadata(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!Buffer.isBuffer(bytes) || bytes.length < 33 || !bytes.subarray(0, signature.length).equals(signature)) {
    throw new Error("Media file is not a valid PNG");
  }
  let offset = signature.length;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  const chunks = [];
  while (offset + 12 <= bytes.length) {
    const chunkLength = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + chunkLength;
    if (chunkEnd > bytes.length) throw new Error("PNG chunk is truncated");
    const chunkType = bytes.toString("ascii", offset + 4, offset + 8);
    chunks.push(chunkType);
    if (chunkType === "IHDR") {
      if (chunkLength !== 13 || width !== null) throw new Error("PNG IHDR chunk is invalid");
      width = bytes.readUInt32BE(offset + 8);
      height = bytes.readUInt32BE(offset + 12);
      bitDepth = bytes[offset + 16];
      colorType = bytes[offset + 17];
    }
    offset = chunkEnd;
    if (chunkType === "IEND") break;
  }
  if (width === null || height === null || bitDepth === null || colorType === null || !chunks.includes("IEND")) {
    throw new Error("PNG structure is incomplete");
  }
  return { width, height, bitDepth, colorType, chunks };
}

export async function validateBuildWeekMedia({ imageDirectory = uploadDirectory, captionFile = captionsPath } = {}) {
  assertMediaManifest();
  const expectedFilenames = BUILD_WEEK_MEDIA.map((item) => item.filename);
  const entries = await readdir(imageDirectory, { withFileTypes: true });
  const actualFilenames = entries.map((entry) => entry.name).sort();
  if (entries.some((entry) => !entry.isFile()) || !sameStrings(actualFilenames, expectedFilenames)) {
    throw new Error(`Build Week upload files differ from the manifest: ${actualFilenames.join(", ")}`);
  }

  const hashes = new Set();
  let largestBytes = 0;
  for (const filename of expectedFilenames) {
    const filePath = join(imageDirectory, filename);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size >= maximumImageBytes) {
      throw new Error(`Build Week image size is invalid: ${filename}`);
    }
    largestBytes = Math.max(largestBytes, fileStat.size);
    const bytes = await readFile(filePath);
    const metadata = readPngMetadata(bytes);
    if (metadata.width !== captureWidth || metadata.height !== captureHeight) {
      throw new Error(`Build Week image dimensions are invalid: ${filename}`);
    }
    if (metadata.bitDepth !== 8 || (metadata.colorType !== 2 && metadata.colorType !== 6)) {
      throw new Error(`Build Week image must use 8-bit RGB or RGBA data: ${filename}`);
    }
    if (!metadata.chunks.includes("iCCP") && !metadata.chunks.includes("sRGB")) {
      throw new Error(`Build Week image lacks RGB profile metadata: ${filename}`);
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (hashes.has(digest)) throw new Error(`Build Week image content is duplicated: ${filename}`);
    hashes.add(digest);
  }

  const captionText = await readFile(captionFile, "utf8");
  const actualCaptions = parseCaptionMarkdown(captionText);
  const expectedCaptions = BUILD_WEEK_MEDIA.map((item) => item.caption);
  if (!sameStrings(actualCaptions, expectedCaptions)) throw new Error("Build Week captions differ from the manifest");

  return {
    count: expectedFilenames.length,
    width: captureWidth,
    height: captureHeight,
    largestBytes,
    longestCaptionCharacters: Math.max(...actualCaptions.map((caption) => Array.from(caption).length)),
  };
}

export function createBuildWeekEvidencePdf() {
  const text = [
    ["F2", 20, 72, 742, "Traceable Evidence in Collaborative Writing"],
    ["F1", 10, 72, 721, "Ada Lovelace and Lin Example - Journal of Inspectable Scholarship (2026)"],
    ["F2", 12, 72, 686, "Abstract"],
    ["F1", 9, 72, 668, "Research evidence often loses provenance when sources, notes, and manuscripts are separated."],
    ["F1", 9, 72, 654, "This synthetic study evaluates a workflow that keeps exact source passages beside scholarly claims."],
    ["F2", 12, 72, 619, "Introduction"],
    ["F1", 9, 72, 601, "Scholarly writing depends on repeated movement between reading, reasoning, drafting, and review."],
    ["F1", 9, 72, 587, "A durable evidence trail makes those transitions inspectable without flattening research into prose."],
    ["F2", 12, 72, 552, "Method"],
    ["F1", 9, 72, 534, "Traceable evidence lets a reader inspect the source behind a scholarly claim."],
    ["F1", 9, 72, 520, "Each model proposal retains its source scope and requires an explicit researcher disposition."],
    ["F1", 9, 72, 506, "Annotations remain separate from the original PDF and carry stable page and quote selectors."],
    ["F2", 12, 72, 471, "Results"],
    ["F1", 9, 72, 453, "Participants could move from a manuscript passage to its claim and supporting annotation."],
    ["F1", 9, 72, 439, "Pending suggestions did not change canonical source until a researcher accepted them."],
    ["F1", 9, 72, 425, "Portable Markdown and BibTeX remained usable independently of the collaborative runtime."],
    ["F2", 12, 72, 390, "Conclusion"],
    ["F1", 9, 72, 372, "Keeping evidence beside the manuscript preserves an inspectable path from source to prose."],
    ["F1", 8, 72, 54, "Synthetic Build Week fixture - no private or third-party research material"],
  ];
  const content = [
    "BT",
    ...text.flatMap(([font, size, x, y, value]) => [`/${font} ${size} Tf`, `1 0 0 1 ${x} ${y} Tm`, `(${escapePdfText(value)}) Tj`]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source, "ascii");
}

export async function runBuildWeekMediaCapture({ cdpURL = defaultCdpURL } = {}) {
  const normalizedCdpURL = assertLoopbackCdpURL(cdpURL);
  assertMediaManifest();
  const stagingDirectory = await mkdtemp(join(tmpdir(), "kirjolab-build-week-media-"));
  const stagingUploadDirectory = join(stagingDirectory, "upload");
  let api;
  let browser;
  let browserContext;
  let captureServer;
  let workspaceId = null;
  let result;
  let failure;

  try {
    await mkdir(stagingUploadDirectory);
    await assertPortAvailable(capturePort);
    await assertPortAvailable(inspectorPort);
    browser = await chromium.connectOverCDP(normalizedCdpURL);
    browserContext = await browser.newContext({
      colorScheme: "light",
      deviceScaleFactor: 2,
      locale: "en-US",
      reducedMotion: "reduce",
      serviceWorkers: "block",
      timezoneId: "UTC",
      viewport: { width: 1_440, height: 960 },
    });
    captureServer = await startCaptureServer();
    api = await request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
    const project = await seedProject(api, (id) => {
      workspaceId = id;
    });
    const reviewId = await seedReview(api, project.workspaceId);
    await captureScreens(browserContext, stagingUploadDirectory, { ...project, reviewId });
    const stagedCaptions = join(stagingDirectory, "captions.md");
    await writeFile(stagedCaptions, renderCaptionsMarkdown(), "utf8");
    await validateBuildWeekMedia({ imageDirectory: stagingUploadDirectory, captionFile: stagedCaptions });
    await promoteBuildWeekMedia(stagingUploadDirectory, stagedCaptions);
    result = await validateBuildWeekMedia();
  } catch (error) {
    failure = error;
  }

  const cleanupErrors = [];
  await cleanupStep(cleanupErrors, async () => {
    if (api && workspaceId) await revokeShareLinks(api, workspaceId);
  });
  await cleanupStep(cleanupErrors, async () => await api?.dispose());
  await cleanupStep(cleanupErrors, async () => await browserContext?.close());
  await cleanupStep(cleanupErrors, async () => await browser?.close());
  await cleanupStep(cleanupErrors, async () => {
    if (browser) await assertCdpReachable(normalizedCdpURL);
  });
  await cleanupStep(cleanupErrors, async () => {
    if (captureServer) await stopCaptureServer(captureServer);
  });
  await cleanupStep(cleanupErrors, async () => await rm(stagingDirectory, { recursive: true, force: true }));

  if (failure && cleanupErrors.length > 0) {
    throw new AggregateError([failure, ...cleanupErrors], "Build Week media capture and cleanup failed");
  }
  if (failure) throw failure;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, "Build Week media cleanup failed");
  return result;
}

async function seedProject(api, onWorkspace) {
  await json(await api.post("/api/library/import", { data: { bibtex: libraryBibtex } }), "private library import");
  const workspace = asRecord(
    await json(await api.post("/api/workspaces", { data: { title: "Evidence Becomes Prose" } }), "workspace creation"),
    "workspace",
  );
  const workspaceId = requiredString(workspace, "id", "workspace");
  onWorkspace(workspaceId);
  const workspaceApi = `/api/workspaces/${workspaceId}`;
  let snapshot = asRecord(
    await json(await api.post(`${workspaceApi}/bibliography/import`, { data: { bibtex: projectBibtex } }), "project bibliography import"),
    "workspace snapshot",
  );
  const pdfBytes = createBuildWeekEvidencePdf();
  const pdf = asRecord(
    await json(
      await api.post(`${workspaceApi}/pdfs`, {
        data: pdfBytes,
        headers: {
          "content-length": String(pdfBytes.byteLength),
          "content-type": "application/pdf",
          "x-file-name": "traceable-evidence.pdf",
        },
      }),
      "PDF upload",
    ),
    "PDF",
  );
  const pdfId = requiredString(pdf, "id", "PDF");
  const publications = requiredArray(snapshot, "publications", "workspace snapshot");
  const publication = publications.find(
    (item) => isRecord(item) && item.title === "Traceable Evidence in Collaborative Writing" && typeof item.id === "string",
  );
  if (!isRecord(publication)) throw new Error("Synthetic publication was not imported");
  await json(
    await api.post(`${workspaceApi}/publication-pdf-links`, {
      data: { pdfId, publicationId: publication.id },
    }),
    "publication PDF link",
  );
  const annotation = asRecord(
    await json(
      await api.post(`${workspaceApi}/annotations`, {
        data: {
          comment: "Use this passage to ground the manuscript's central claim.",
          page: 1,
          pdfId,
          prefix: "The synthetic study reports that ",
          quote: "Traceable evidence lets a reader inspect the source behind a scholarly claim.",
          rects: [],
          suffix: " This relationship remains available during revision.",
        },
      }),
      "annotation",
    ),
    "annotation",
  );
  const annotationId = requiredString(annotation, "id", "annotation");
  const annotationUpdatedAt = requiredString(annotation, "updatedAt", "annotation");
  const claim = asRecord(
    await json(
      await api.post(`${workspaceApi}/claims`, {
        data: {
          evidence: [{ annotationId, relation: "supports" }],
          note: "Keep the source relationship visible while drafting.",
          text: "Integrated evidence context makes scholarly claims easier to inspect and revise.",
        },
      }),
      "claim",
    ),
    "claim",
  );
  const claimId = requiredString(claim, "id", "claim");
  snapshot = asRecord(await json(await api.get(workspaceApi), "workspace snapshot"), "workspace snapshot");
  const source = requiredString(snapshot, "source", "workspace snapshot");
  const entryFileId = requiredString(snapshot, "entryFileId", "workspace snapshot");
  const sourceRevision = requiredNumber(snapshot, "revision", "workspace snapshot");
  const excerpt = "Evidence becomes prose";
  const start = source.indexOf(excerpt);
  if (start < 0) throw new Error("Default manuscript does not contain the expected excerpt");
  const passage = { end: start + excerpt.length, excerpt, fileId: entryFileId, sourceRevision, start };
  await json(await api.post(`${workspaceApi}/claim-links`, { data: { claimId, ...passage } }), "claim passage link");
  await json(
    await api.post(`${workspaceApi}/comments`, {
      data: { ...passage, body: "The source, claim, and wording are ready for a final author review." },
    }),
    "comment",
  );
  await json(
    await api.post(`${workspaceApi}/claim-candidates`, {
      data: {
        evidence: [{ id: annotationId, kind: "annotation", version: annotationUpdatedAt }],
        instruction: "Draft one precise claim grounded only in the selected evidence.",
        model: "local-research-model",
        promptVersion: "draft-claim-v1",
        proposedNote: "Review wording and citation scope before accepting.",
        proposedText: "Keeping evidence beside the manuscript preserves an inspectable path from source to prose.",
        providerAdapter: "openai-compatible",
        providerLabel: "Local companion · OpenAI-compatible",
        relation: "supports",
      },
    }),
    "claim candidate",
  );
  await json(await api.post(`${workspaceApi}/share-link`), "read-only share link");
  const editLink = asRecord(await json(await api.post(`${workspaceApi}/edit-link`), "edit share link"), "edit share link");
  const editHref = requiredString(editLink, "href", "edit share link");
  if (!editHref.startsWith("/edit/")) throw new Error("Edit share link is invalid");
  return { editHref, workspaceId };
}

async function seedReview(api, workspaceId) {
  const review = asRecord(
    await json(await api.post("/api/reviews", { data: { profile: "slr", title: "Traceable AI Evidence Review" } }), "review creation"),
    "review",
  );
  const reviewId = requiredString(review, "id", "review");
  const reviewApi = `/api/reviews/${reviewId}`;
  const reviewStudyApi = `${reviewApi}/review-study`;
  await json(await api.post(`${reviewApi}/project-links`, { data: { workspaceId } }), "review project link");
  const initialReview = asRecord(await json(await api.get(reviewStudyApi), "initial review"), "initial review");
  const initialProtocol = asRecord(initialReview.protocol, "initial review protocol");
  const methodConfiguration = asRecord(initialProtocol.methodConfiguration, "review method configuration");
  const includeCriterionId = "include-review-workflow";
  const excludeCriterionId = "exclude-opaque-workflow";
  const protocol = {
    amendmentImpact: null,
    conceptGroups: [
      { facet: "population", id: "concept-review", label: "Review", terms: ["systematic review", "evidence review"] },
      { facet: "outcome", id: "concept-audit", label: "Audit", terms: ["provenance", "traceability"] },
    ],
    eligibilityCriteria: [
      {
        applicableStages: ["title-abstract", "full-text"],
        id: includeCriterionId,
        kind: "include",
        text: "Reports an evidence-review workflow",
      },
      {
        applicableStages: ["title-abstract", "full-text"],
        id: excludeCriterionId,
        kind: "exclude",
        text: "Does not report an evidence-review workflow",
      },
    ],
    extractionFields: [
      {
        cardinality: "single",
        condition: null,
        id: "field-mechanism",
        label: "Audit mechanism",
        requiredness: "required",
        researchQuestionIds: ["rq-audit"],
        type: "text",
        values: [],
      },
    ],
    knownRelevantStudies: [
      {
        abstract: "A synthetic study of provenance-preserving review assistance.",
        id: "seed-traceable",
        title: "Traceable Assistance in Evidence Reviews",
      },
    ],
    methodConfiguration,
    modelAssistance: { mode: "assisted" },
    objective: "Evaluate how AI assistance remains traceable in systematic evidence reviews.",
    picoc: {
      comparison: "Opaque automated review workflows",
      context: "Systematic literature reviews",
      intervention: "AI-assisted screening and extraction",
      outcome: "Auditable decisions and reproducible synthesis",
      population: "Research teams conducting evidence reviews",
    },
    profile: "slr",
    qualityAssessment: {
      answers: [
        { id: "yes", label: "Yes", rejects: false, weight: 1 },
        { id: "no", label: "No", rejects: true, weight: 0 },
      ],
      minimumScore: 1,
      questions: [{ id: "quality-trace", text: "Is the evidence trail described?" }],
    },
    researchQuestions: [{ id: "rq-audit", text: "How is model assistance kept auditable?" }],
    screening: { blinded: false, reviewersPerStage: 1 },
    sources: [
      {
        dialect: "generic",
        evidenceClass: "formal",
        fieldScope: "title-abstract",
        greySourceClass: null,
        id: "source-demo",
        name: "Demo index",
        sourceClass: "manual-search",
        url: "https://example.test",
      },
    ],
  };
  const replacedReview = asRecord(
    await json(
      await api.put(`${reviewStudyApi}/protocol`, {
        data: { content: protocol, expectedRevision: requiredNumber(initialReview, "revision", "initial review") },
      }),
      "review protocol",
    ),
    "replaced review",
  );
  const frozenReview = asRecord(
    await json(
      await api.post(`${reviewStudyApi}/protocol/freeze`, {
        data: { expectedRevision: requiredNumber(replacedReview, "revision", "replaced review") },
      }),
      "review freeze",
    ),
    "frozen review",
  );
  const importPreview = asRecord(
    await json(await api.post(`${reviewStudyApi}/search-import-previews`, { data: { bibtex: reviewBibtex } }), "review import preview"),
    "review import preview",
  );
  const searchedReview = asRecord(
    await json(
      await api.post(`${reviewStudyApi}/search-runs`, {
        data: {
          bibtex: reviewBibtex,
          digest: requiredString(importPreview, "digest", "review import preview"),
          expectedRevision: requiredNumber(frozenReview, "revision", "frozen review"),
          filename: "demo-index-results.bib",
          mediaType: "application/x-bibtex",
          query: '("systematic review" OR "evidence review") AND (provenance OR traceability)',
          reportedResultCount: 2,
          searchedAt: "2026-07-19T09:30:00.000Z",
          sourceId: "source-demo",
        },
      }),
      "review search run",
    ),
    "searched review",
  );
  const records = requiredArray(searchedReview, "records", "searched review");
  const includedRecord = reviewRecordByTitle(records, "Traceable Assistance in Evidence Reviews");
  const excludedRecord = reviewRecordByTitle(records, "Opaque Automation Without Evidence");
  let reviewRevision = requiredNumber(searchedReview, "revision", "searched review");
  let screeningReview = asRecord(
    await json(
      await api.post(`${reviewStudyApi}/records/${includedRecord.id}/screening-decisions`, {
        data: {
          criterionId: includeCriterionId,
          decision: "include",
          expectedRevision: reviewRevision,
          reason: "The abstract reports a traceable evidence-review workflow.",
          stage: "title-abstract",
        },
      }),
      "included title screening",
    ),
    "screening review",
  );
  reviewRevision = requiredNumber(screeningReview, "revision", "screening review");
  screeningReview = asRecord(
    await json(
      await api.post(`${reviewStudyApi}/records/${includedRecord.id}/screening-decisions`, {
        data: {
          criterionId: includeCriterionId,
          decision: "include",
          expectedRevision: reviewRevision,
          reason: "The full text describes explicit provenance and human disposition.",
          stage: "full-text",
        },
      }),
      "included full-text screening",
    ),
    "screening review",
  );
  reviewRevision = requiredNumber(screeningReview, "revision", "screening review");
  screeningReview = asRecord(
    await json(
      await api.post(`${reviewStudyApi}/records/${includedRecord.id}/final-inclusion-decisions`, {
        data: {
          criterionId: includeCriterionId,
          expectedRevision: reviewRevision,
          outcome: "include",
          reason: "The eligible study enters the synthesis corpus.",
        },
      }),
      "final inclusion",
    ),
    "screening review",
  );
  reviewRevision = requiredNumber(screeningReview, "revision", "screening review");
  await json(
    await api.post(`${reviewStudyApi}/records/${excludedRecord.id}/screening-decisions`, {
      data: {
        criterionId: excludeCriterionId,
        decision: "exclude",
        expectedRevision: reviewRevision,
        reason: "The record describes opaque automation without an evidence-review workflow.",
        stage: "title-abstract",
      },
    }),
    "excluded title screening",
  );
  return reviewId;
}

async function captureScreens(browserContext, stagingDirectory, state) {
  const writer = orderedShotWriter(stagingDirectory);
  const page = await browserContext.newPage();
  try {
    await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Pick up the thread." }).waitFor();
    await settle(page);
    await writer.shot(page, "01-dashboard.png");

    await page.goto(`${baseURL}/library`, { waitUntil: "domcontentloaded" });
    await page.locator("#reference-library-list").getByText("Traceable Evidence in Collaborative Writing").waitFor();
    await settle(page, 500);
    await writer.shot(page, "02-library.png");

    await page.goto(`${baseURL}/editor/${state.workspaceId}`, { waitUntil: "domcontentloaded" });
    await page.locator("#source-editor").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector("#diagnostic-summary")?.textContent !== "Validating…");
    await settle(page, 500);
    await writer.shot(page, "03-authoring-preview.png");

    await page.locator("#show-research-rail").click();
    await page.locator("#project-evidence").waitFor({ state: "visible" });
    await page.locator("#project-evidence").evaluate((element) => {
      element.open = true;
    });
    await page.locator("#claim-list").evaluate((element) => {
      const details = element.closest("details");
      if (details) details.open = true;
    });
    await page
      .locator("#claim-list")
      .getByText(/Integrated evidence context/u)
      .waitFor();
    await settle(page);
    await writer.shot(page, "04-evidence-trail.png");

    await captureReferenceAnnotation(browserContext, writer);

    await page.locator("#show-map-mode").click();
    await page.locator("#project-map").waitFor({ state: "visible" });
    await page
      .locator("#project-map-nodes")
      .getByText(/Traceable Evidence in Collaborative Writing/u)
      .waitFor();
    await settle(page, 500);
    await writer.shot(page, "06-evidence-map.png");

    await page.locator("#show-write-mode").click();
    await page.locator("#context-assistant-tab").click();
    const candidate = page.locator("#candidate-list article").filter({ hasText: "local-research-model" });
    await candidate.getByRole("button", { name: "Open review" }).click();
    await page
      .locator("#context-candidate-after")
      .getByText(/Keeping evidence beside the manuscript preserves/u)
      .waitFor();
    await settle(page);
    await writer.shot(page, "07-reviewable-ai.png");

    await page.locator("#show-comments-rail").click();
    await page
      .locator("#manuscript-comment-list")
      .getByText(/ready for a final author review/u)
      .waitFor();
    await settle(page);
    await writer.shot(page, "08-collaboration.png");

    await page.locator("#share-workspace").click();
    await page.locator("#share-workspace-dialog").waitFor({ state: "visible" });
    await page.locator("#read-only-share-link").waitFor({ state: "visible" });
    await page.locator("#edit-share-link").waitFor({ state: "visible" });
    await settle(page);
    await writer.shot(page, "09-share-links.png");

    const sharedPage = await browserContext.newPage();
    try {
      await sharedPage.goto(`${baseURL}${state.editHref}`, { waitUntil: "domcontentloaded" });
      await sharedPage.locator("#edit-source").waitFor({ state: "visible" });
      await sharedPage.locator("#edit-live-status").waitFor({ state: "visible" });
      await settle(sharedPage, 700);
      await writer.shot(sharedPage, "10-shared-editor.png");
    } finally {
      await sharedPage.close();
    }

    await page.locator("#close-share-workspace").click();
    await page.locator("#open-export").click();
    await page.locator("#export-dialog").waitFor({ state: "visible" });
    await page.locator("#export-statistics").getByText(/words/u).waitFor();
    await settle(page);
    await writer.shot(page, "11-portable-export.png");

    await page.locator("#close-export").click();
    await page.locator("#editor-more-menu > summary").click();
    await page.locator("#open-project-history").click();
    await page.locator("#project-history-dialog").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector("#project-history-list")?.textContent?.includes("Loading revision history"));
    await settle(page);
    await writer.shot(page, "12-revision-history.png");

    await page.locator("#close-project-history").click();
    await page.locator("#new-workspace").evaluate((element) => {
      const menu = element.closest("details");
      if (menu) menu.open = true;
    });
    await page.locator("#new-workspace").click();
    await page.locator("#new-workspace-dialog").waitFor({ state: "visible" });
    await page
      .locator("#new-workspace-template-list")
      .getByText(/Research article/u)
      .first()
      .waitFor();
    await settle(page);
    await writer.shot(page, "13-project-templates.png");

    await page.goto(`${baseURL}/review`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Keep the method reusable." }).waitFor();
    await page.getByText("Traceable AI Evidence Review").first().waitFor();
    await settle(page);
    await writer.shot(page, "14-review-catalog.png");

    await page.goto(`${baseURL}/review/${state.reviewId}`, { waitUntil: "domcontentloaded" });
    await page
      .locator("#review-protocol-state")
      .getByText(/Frozen/u)
      .waitFor();
    await page.locator("#review-step-screen").click();
    await page.locator("#review-screen-content").waitFor({ state: "visible" });
    await page.locator("#review-screen-list").getByText("Traceable Assistance in Evidence Reviews").waitFor();
    await settle(page, 600);
    await writer.shot(page, "15-independent-review.png");
    writer.assertComplete();
  } finally {
    await page.close();
  }
}

async function captureReferenceAnnotation(browserContext, writer) {
  const page = await browserContext.newPage();
  try {
    await page.goto(`${baseURL}/library`, { waitUntil: "domcontentloaded" });
    await page.locator("#library-pdf-upload").setInputFiles({
      buffer: createBuildWeekEvidencePdf(),
      mimeType: "application/pdf",
      name: "traceable-evidence.pdf",
    });
    const pdfRow = page
      .locator("#reference-library-list .library-reference-row")
      .filter({ has: page.getByRole("button", { exact: true, name: "PDF" }) });
    await pdfRow.waitFor();
    await pdfRow.getByRole("button", { exact: true, name: "PDF" }).click();
    await page.getByRole("tab", { name: "traceable-evidence.pdf" }).waitFor();
    await page.locator("#toast").waitFor({ state: "hidden" });
    await page
      .locator("#library-paper-page-indicator")
      .getByText(/1 \/ 1/u)
      .waitFor();
    const passage = page.locator("#paper-text-layer span").filter({ hasText: "Annotations remain separate from the original PDF" }).first();
    await passage.waitFor();
    await page.locator("#library-text-tool").click();
    await page.waitForFunction(() => document.querySelector("#library-text-tool")?.getAttribute("aria-pressed") === "true");
    await passage.evaluate((element) => {
      const textLayer = element.closest("#paper-text-layer");
      const selection = window.getSelection();
      if (!textLayer || !selection || !element.firstChild) throw new Error("Expected selectable synthetic PDF text");
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      textLayer.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    await page.locator("#paper-highlights [data-draft='true']").first().waitFor();
    await page.locator("#library-highlight-form").waitFor({ state: "visible" });
    await page.locator("#library-highlight-status").getByText("Page 1 selection ready.", { exact: true }).waitFor();
    const note = page.locator("#library-highlight-comment");
    await note.fill("Reusable evidence note");
    await note.evaluate((element) => {
      element.scrollLeft = 0;
      element.blur();
    });
    await settle(page);
    await writer.shot(page, "05-reference-annotation.png");
  } finally {
    await page.close();
  }
}

async function promoteBuildWeekMedia(stagingUploadDirectory, stagedCaptions) {
  await mkdir(mediaRoot, { recursive: true });
  const suffix = `${process.pid}-${Date.now()}`;
  const nextUpload = join(mediaRoot, `.upload-staging-${suffix}`);
  const nextCaptions = join(mediaRoot, `.captions-staging-${suffix}.md`);
  const uploadBackup = join(mediaRoot, `.upload-backup-${suffix}`);
  const captionsBackup = join(mediaRoot, `.captions-backup-${suffix}.md`);
  await mkdir(nextUpload);
  for (const item of BUILD_WEEK_MEDIA) {
    await copyFile(join(stagingUploadDirectory, item.filename), join(nextUpload, item.filename));
  }
  await copyFile(stagedCaptions, nextCaptions);
  await validateBuildWeekMedia({ imageDirectory: nextUpload, captionFile: nextCaptions });

  let captionsBackedUp = false;
  let captionsInstalled = false;
  let uploadBackedUp = false;
  let uploadInstalled = false;
  try {
    if (await pathExists(uploadDirectory)) {
      await rename(uploadDirectory, uploadBackup);
      uploadBackedUp = true;
    }
    if (await pathExists(captionsPath)) {
      await rename(captionsPath, captionsBackup);
      captionsBackedUp = true;
    }
    await rename(nextUpload, uploadDirectory);
    uploadInstalled = true;
    await rename(nextCaptions, captionsPath);
    captionsInstalled = true;
  } catch (error) {
    if (captionsInstalled) await rm(captionsPath, { force: true });
    if (captionsBackedUp) await rename(captionsBackup, captionsPath);
    if (uploadInstalled) await rm(uploadDirectory, { recursive: true, force: true });
    if (uploadBackedUp) await rename(uploadBackup, uploadDirectory);
    throw error;
  } finally {
    await rm(nextUpload, { recursive: true, force: true });
    await rm(nextCaptions, { force: true });
  }
  if (uploadBackedUp) await rm(uploadBackup, { recursive: true });
  if (captionsBackedUp) await rm(captionsBackup);
}

async function startCaptureServer() {
  const child = spawn(process.execPath, ["./scripts/run-e2e-server.mjs"], {
    cwd: projectRoot,
    detached: process.platform !== "win32",
    env: captureServerEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let spawnFailure = null;
  const appendOutput = (chunk) => {
    output = `${output}${chunk}`.slice(-16_000);
  };
  child.stdout.on("data", appendOutput);
  child.stderr.on("data", appendOutput);
  child.once("error", (error) => {
    spawnFailure = error;
    appendOutput(error);
  });
  try {
    await waitForCaptureServer(
      child,
      () => output,
      () => spawnFailure,
    );
    return child;
  } catch (error) {
    try {
      await stopCaptureServer(child);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Capture server startup and cleanup failed");
    }
    throw error;
  }
}

async function waitForCaptureServer(child, output, spawnFailure) {
  const deadline = Date.now() + captureServerTimeoutMs;
  while (Date.now() < deadline) {
    if (spawnFailure()) throw new Error(`Capture server failed to start: ${output()}`);
    if (child.exitCode !== null) throw new Error(`Capture server exited early (${child.exitCode}): ${output()}`);
    try {
      const response = await fetch(healthURL, { redirect: "manual" });
      if (response.ok) {
        const health = await response.json();
        if (isRecord(health) && health.ok === true && health.name === "kirjolab") return;
      }
    } catch {
      // Keep polling until the bounded startup deadline.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for the isolated capture server at ${healthURL}: ${output()}`);
}

async function stopCaptureServer(child) {
  if (child.exitCode === null && child.signalCode === null && typeof child.pid === "number") {
    terminateProcess(child, "SIGTERM");
    const stopped = await waitForProcessExit(child, 5_000);
    if (!stopped) {
      terminateProcess(child, "SIGKILL");
      if (!(await waitForProcessExit(child, 5_000))) {
        throw new Error("The isolated capture server process did not stop");
      }
    }
  }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await fetch(healthURL);
    } catch {
      return;
    }
    await delay(100);
  }
  throw new Error("The isolated capture server did not release port 8788");
}

async function waitForProcessExit(child, timeoutMilliseconds) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return await new Promise((resolvePromise) => {
    let timer;
    const finish = (exited) => {
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
      resolvePromise(exited);
    };
    const onExit = () => finish(true);
    const onError = () => finish(child.exitCode !== null || child.signalCode !== null || typeof child.pid !== "number");
    child.once("exit", onExit);
    child.once("error", onError);
    timer = setTimeout(() => finish(false), timeoutMilliseconds);
  });
}

function terminateProcess(child, signal) {
  if (process.platform !== "win32" && typeof child.pid === "number") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to the direct child when its process group has already exited.
    }
  }
  child.kill(signal);
}

async function assertPortAvailable(port) {
  await new Promise((resolvePromise, rejectPromise) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", () => rejectPromise(new Error(`Local capture port ${port} is already in use`)));
    probe.listen({ exclusive: true, host: "127.0.0.1", port }, () => probe.close(resolvePromise));
  });
}

async function assertCdpReachable(cdpURL) {
  const response = await fetch(`${cdpURL}/json/version`);
  if (!response.ok) throw new Error("The debug Chrome endpoint stopped after capture cleanup");
  const version = await response.json();
  if (!isRecord(version) || typeof version.webSocketDebuggerUrl !== "string") {
    throw new Error("The debug Chrome endpoint returned an invalid version document");
  }
}

function captureServerEnvironment() {
  const environment = { CI: "1" };
  for (const name of ["LANG", "LC_ALL", "PATH", "SHELL", "TERM", "TMPDIR"]) {
    const value = process.env[name];
    if (value) environment[name] = value;
  }
  return environment;
}

async function revokeShareLinks(api, workspaceId) {
  const endpoints = [`/api/workspaces/${workspaceId}/share-link`, `/api/workspaces/${workspaceId}/edit-link`];
  for (const endpoint of endpoints) {
    const response = await api.delete(endpoint);
    if (!response.ok() && response.status() !== 404) {
      throw new Error(`Temporary share-link cleanup failed (${response.status()})`);
    }
  }
}

function orderedShotWriter(directory) {
  let index = 0;
  return {
    assertComplete() {
      if (index !== BUILD_WEEK_MEDIA.length) throw new Error(`Captured ${index} of ${BUILD_WEEK_MEDIA.length} Build Week images`);
    },
    async shot(page, filename) {
      const expected = BUILD_WEEK_MEDIA[index]?.filename;
      if (filename !== expected) throw new Error(`Expected Build Week image ${expected}, received ${filename}`);
      await page.screenshot({ animations: "disabled", caret: "hide", path: join(directory, filename) });
      index += 1;
    },
  };
}

async function settle(page, milliseconds = 350) {
  await page.waitForTimeout(milliseconds);
  await page.evaluate(() => document.fonts.ready);
}

async function json(response, label) {
  const body = await response.text();
  if (!response.ok()) throw new Error(`${label} failed (${response.status()}): ${body}`);
  return body ? JSON.parse(body) : null;
}

function reviewRecordByTitle(records, title) {
  const record = records.find((item) => isRecord(item) && isRecord(item.metadata) && item.metadata.title === title);
  if (!isRecord(record) || typeof record.id !== "string") throw new Error(`Review record was not imported: ${title}`);
  return record;
}

function parseCaptionMarkdown(source) {
  const captions = [];
  for (const line of source.split(/\r?\n/u)) {
    const match = /^(\d+)\. (.+)$/u.exec(line);
    if (!match) continue;
    if (Number(match[1]) !== captions.length + 1) throw new Error("Build Week captions are not sequentially numbered");
    captions.push(match[2]);
  }
  if (captions.length !== BUILD_WEEK_MEDIA.length) throw new Error("Build Week caption count is invalid");
  return captions;
}

function sameStrings(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function escapePdfText(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function asRecord(value, label) {
  if (!isRecord(value)) throw new Error(`Expected ${label}`);
  return value;
}

function requiredString(record, key, label) {
  const value = record[key];
  if (typeof value !== "string" || !value) throw new Error(`Expected ${label}.${key}`);
  return value;
}

function requiredNumber(record, key, label) {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`Expected ${label}.${key}`);
  return value;
}

function requiredArray(record, key, label) {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`Expected ${label}.${key}`);
  return value;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

async function cleanupStep(errors, action) {
  try {
    await action();
  } catch (error) {
    errors.push(error);
  }
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function runCli() {
  const options = parseCaptureOptions();
  if (options.mode === "help") {
    console.log(helpText);
    return;
  }
  const summary = options.mode === "validate" ? await validateBuildWeekMedia() : await runBuildWeekMediaCapture({ cdpURL: options.cdpURL });
  console.log(
    `[build-week-media] ${options.mode === "validate" ? "validated" : "captured"} ${summary.count} images at ${summary.width}x${summary.height}; largest ${summary.largestBytes} bytes; longest caption ${summary.longestCaptionCharacters} characters`,
  );
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entryPath === import.meta.url) {
  runCli().catch((error) => {
    console.error(`[build-week-media] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
