import { describe, expect, it, vi } from "vitest";
import type { ArtifactAnalysisJob } from "../domain/reference-library";
import { handleResearchCorpusRequest, parseCorpusAllowedOrigins, type ResearchCorpusEnvironment } from "./worker";
import type { CorpusLibraryAuthority } from "./cloudflare-adapter";

describe("Research Corpus Worker", () => {
  it("authenticates before selecting private owner state", async () => {
    const { env, getByName } = fixture({ AUTH_MODE: "access" });

    const response = await handleResearchCorpusRequest(new Request("https://corpus.example/v1/artifacts"), env);

    expect(response.status).toBe(401);
    expect(getByName).not.toHaveBeenCalled();
  });

  it("answers an allowed browser preflight before Access authentication", async () => {
    const { env, getByName } = fixture({
      AUTH_MODE: "access",
      CORPUS_ALLOWED_ORIGINS: "https://writer.example",
    });

    const response = await handleResearchCorpusRequest(
      new Request("https://corpus.example/v1/artifacts", {
        method: "OPTIONS",
        headers: { origin: "https://writer.example" },
      }),
      env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://writer.example");
    expect(getByName).not.toHaveBeenCalled();
  });

  it("rejects an unconfigured browser preflight before Access authentication", async () => {
    const { env, getByName } = fixture({
      AUTH_MODE: "access",
      CORPUS_ALLOWED_ORIGINS: "https://writer.example",
    });

    const response = await handleResearchCorpusRequest(
      new Request("https://corpus.example/mcp", {
        method: "OPTIONS",
        headers: { origin: "https://evil.example" },
      }),
      env,
    );

    expect(response.status).toBe(403);
    expect(getByName).not.toHaveBeenCalled();
  });

  it("serves the loopback owner's corpus through the independent entry point", async () => {
    const { env, getByName } = fixture();

    const response = await handleResearchCorpusRequest(new Request("http://localhost/v1/artifacts"), env);

    expect(response.status).toBe(200);
    expect(getByName).toHaveBeenCalledWith("local");
  });

  it("keeps local identity unavailable away from loopback", async () => {
    const { env, getByName } = fixture();

    const response = await handleResearchCorpusRequest(new Request("https://corpus.example/v1/artifacts"), env);

    expect(response.status).toBe(503);
    expect(getByName).not.toHaveBeenCalled();
  });

  it("fails closed when the exact origin allowlist is malformed", async () => {
    const { env } = fixture({ CORPUS_ALLOWED_ORIGINS: "https://writer.example/path" });

    const response = await handleResearchCorpusRequest(new Request("http://localhost/v1/artifacts"), env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Research Corpus origin configuration is invalid" });
  });

  it("parses canonical HTTPS and loopback development origins", () => {
    expect([...parseCorpusAllowedOrigins("https://writer.example, http://localhost:3000")]).toEqual([
      "https://writer.example",
      "http://localhost:3000",
    ]);
    expect(() => parseCorpusAllowedOrigins("http://writer.example")).toThrow();
    expect(() => parseCorpusAllowedOrigins("https://writer.example/path")).toThrow();
    expect(() => parseCorpusAllowedOrigins("https://writer.example/")).toThrow();
  });

  it("returns a private not-found response outside the corpus routes", async () => {
    const { env } = fixture();

    const response = await handleResearchCorpusRequest(new Request("http://localhost/unknown"), env);

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

function fixture(overrides: Partial<Pick<ResearchCorpusEnvironment, "AUTH_MODE" | "CORPUS_ALLOWED_ORIGINS">> = {}) {
  const library: CorpusLibraryAuthority = {
    createPdfDraft: vi.fn(async () => {
      throw new Error("not used");
    }),
    getPdfArtifactPage: vi.fn(async () => ({ items: [], next: null })),
    getPdfArtifact: vi.fn(async () => null),
    getArtifactAnalysis: vi.fn(async () => null),
    queueArtifactAnalysis: vi.fn(async () => {
      throw new Error("not used");
    }),
    failArtifactAnalysis: vi.fn(async () => false),
  };
  const getByName = vi.fn(() => library);
  const env: ResearchCorpusEnvironment = {
    AUTH_MODE: "local",
    ACCESS_TEAM_DOMAIN: overrides.AUTH_MODE === "access" ? "https://team.cloudflareaccess.com" : "",
    ACCESS_AUD: overrides.AUTH_MODE === "access" ? "audience" : "",
    CORPUS_ALLOWED_ORIGINS: "",
    REFERENCE_LIBRARIES: { getByName },
    ARTIFACT_ANALYSIS_QUEUE: { send: vi.fn(async (_job: ArtifactAnalysisJob) => undefined) },
    PAPERS: { delete: vi.fn(async () => undefined), get: vi.fn(async () => null), put: vi.fn(async () => unusedR2Object()) },
    ...overrides,
  };
  return { env, getByName };
}

function unusedR2Object(): R2Object {
  return {
    key: "unused",
    version: "unused",
    size: 0,
    etag: "unused",
    httpEtag: '"unused"',
    checksums: { toJSON: () => ({}) },
    uploaded: new Date(0),
    storageClass: "Standard",
    writeHttpMetadata: () => undefined,
  };
}
