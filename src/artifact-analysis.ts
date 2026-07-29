import puppeteer, { type Browser, type HTTPRequest, type Page } from "@cloudflare/puppeteer";
import {
  isArtifactAnalysisJob,
  isPdfHighlightAnalysisResult,
  isPdfReferenceAnalysisResult,
  type ArtifactAnalysisKind,
  type ArtifactAnalysisJob,
  type ArtifactAnalysisResult,
  type PdfHighlightAnalysisResult,
  type PdfReferenceAnalysisResult,
} from "./domain/reference-library";

const analysisPdfUrl = "https://artifact-analysis.invalid/input.pdf";
const analysisWorkerUrl = "https://artifact-analysis.invalid/pdf.worker.js";
const maximumAttempts = 4;

export async function consumeArtifactAnalysisBatch(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    if (!isArtifactAnalysisJob(message.body)) {
      console.error(JSON.stringify({ event: "artifact_analysis_rejected", messageId: message.id }));
      message.ack();
      continue;
    }
    try {
      await processArtifactAnalysisJob(message.body, env);
      message.ack();
    } catch (error) {
      const finalAttempt = message.attempts >= maximumAttempts;
      console.error(
        JSON.stringify({
          event: "artifact_analysis_failed",
          artifactId: message.body.artifactId,
          attempt: message.attempts,
          finalAttempt,
          error: errorMessage(error),
        }),
      );
      const library = env.REFERENCE_LIBRARIES.getByName(message.body.ownerKey);
      await library.failArtifactAnalysis(
        message.body.artifactId,
        message.body.kind,
        message.body.fingerprint,
        message.body.requestedAt,
        errorMessage(error),
      );
      if (finalAttempt) {
        message.ack();
      } else {
        message.retry({ delaySeconds: Math.min(30 * 2 ** Math.max(0, message.attempts - 1), 300) });
      }
    }
  }
}

async function processArtifactAnalysisJob(job: ArtifactAnalysisJob, env: Env): Promise<void> {
  const library = env.REFERENCE_LIBRARIES.getByName(job.ownerKey);
  const shouldRun = await library.startArtifactAnalysis(job.artifactId, job.kind, job.fingerprint, job.requestedAt);
  if (!shouldRun) return;
  const snapshot = await library.getSnapshot(true);
  const artifact = snapshot.artifacts.find((candidate) => candidate.id === job.artifactId && candidate.fingerprint === job.fingerprint);
  if (!artifact) throw new Error("PDF artifact no longer matches the queued analysis");
  const object = await env.PAPERS.get(artifact.objectKey);
  if (!object) throw new Error("PDF artifact content was not found");

  const [pdf, analyzerScript, workerScript] = await Promise.all([
    object.arrayBuffer().then((value) => new Uint8Array(value)),
    loadPdfArtifactAnalyzerScript(),
    loadPdfWorkerScript(),
  ]);
  const result = await analyzePdfArtifact(env.ARTIFACT_ANALYSIS_BROWSER, pdf, analyzerScript, workerScript, job.kind);
  if (job.kind === "pdf-highlights" && !isPdfHighlightAnalysisResult(result)) {
    throw new Error("Browser returned an invalid PDF highlight analysis");
  }
  if (job.kind === "pdf-references" && !isPdfReferenceAnalysisResult(result)) {
    throw new Error("Browser returned an invalid PDF reference analysis");
  }
  await library.completeArtifactAnalysis(job.artifactId, job.kind, job.fingerprint, job.requestedAt, result);
}

async function analyzePdfArtifact(
  binding: Env["ARTIFACT_ANALYSIS_BROWSER"],
  pdf: Uint8Array,
  analyzerScript: string,
  workerScript: string,
  kind: ArtifactAnalysisKind,
): Promise<ArtifactAnalysisResult> {
  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch(binding as Parameters<typeof puppeteer.launch>[0]);
    const page = await browser.newPage();
    await installArtifactInterception(page, pdf, workerScript);
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    await page.addScriptTag({ content: analyzerScript });
    return await withTimeout(
      page.evaluate(
        async ({ url, kind }) => {
          const analyzer = globalThis as typeof globalThis & {
            analyzePdfHighlights(input: string): Promise<PdfHighlightAnalysisResult>;
            analyzePdfReferences(input: string): Promise<PdfReferenceAnalysisResult>;
          };
          return kind === "pdf-highlights" ? await analyzer.analyzePdfHighlights(url) : await analyzer.analyzePdfReferences(url);
        },
        { kind, url: analysisPdfUrl },
      ),
      2 * 60 * 1_000,
    );
  } finally {
    await browser?.close();
  }
}

async function installArtifactInterception(page: Page, pdf: Uint8Array, workerScript: string): Promise<void> {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    void respondToArtifactRequest(request, pdf, workerScript).catch((error: unknown) => {
      console.error(JSON.stringify({ event: "artifact_analysis_interception_failed", error: errorMessage(error) }));
    });
  });
}

async function respondToArtifactRequest(request: HTTPRequest, pdf: Uint8Array, workerScript: string): Promise<void> {
  if (request.url() === analysisPdfUrl) {
    await request.respond({
      status: 200,
      contentType: "application/pdf",
      headers: { "cache-control": "no-store", "content-length": String(pdf.byteLength) },
      body: pdf,
    });
    return;
  }
  if (request.url() === analysisWorkerUrl) {
    await request.respond({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      headers: { "cache-control": "no-store" },
      body: workerScript,
    });
    return;
  }
  await request.abort("blockedbyclient");
}

async function loadPdfArtifactAnalyzerScript(): Promise<string> {
  return await loadGeneratedTextAsset(
    async () => (await import("../.generated/pdf-artifact-analyzer.txt")).default,
    async () => await loadGeneratedTextFromDisk(new URL("../.generated/pdf-artifact-analyzer.txt", import.meta.url).href),
  );
}

async function loadPdfWorkerScript(): Promise<string> {
  return await loadGeneratedTextAsset(
    async () => (await import("../.generated/pdf-worker.txt")).default,
    async () => await loadGeneratedTextFromDisk(new URL("../.generated/pdf-worker.txt", import.meta.url).href),
  );
}

export async function loadGeneratedTextAsset(loadBundled: () => Promise<string>, loadFromDisk: () => Promise<string>): Promise<string> {
  if (typeof WebSocketPair !== "undefined") return await loadBundled();
  return await loadFromDisk();
}

async function loadGeneratedTextFromDisk(nodeUrl: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  return await readFile(fileURLToPath(nodeUrl), "utf8");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 1_000) : "Artifact analysis failed";
}

async function withTimeout<Result>(pending: Promise<Result>, milliseconds: number): Promise<Result> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("PDF artifact analysis timed out")), milliseconds);
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
