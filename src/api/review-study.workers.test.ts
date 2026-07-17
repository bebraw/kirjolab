import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { defaultReviewProtocol } from "../domain/review-study";
import type { AuthIdentity } from "../security/auth";
import { handleReviewStudyApi } from "./review-study";

const identity = {
  subject: "local:test",
  email: "reviewer@example.com",
  ownerKey: "review-api-test",
  mode: "local",
} satisfies AuthIdentity;

describe("review-study API in the Workers runtime", () => {
  it("reads, edits, and freezes an authenticated study stub", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-api-${crypto.randomUUID()}`);
    const read = await handleReviewStudyApi(
      new Request("http://example.com/api/workspaces/project/review-study"),
      study,
      identity,
      "/review-study",
    );
    expect(read.headers.get("cache-control")).toBe("no-store");
    const initial = (await read.json()) as { revision: number };

    const content = {
      ...defaultReviewProtocol(),
      objective: "Answer a reproducible question",
      researchQuestions: [{ id: "rq1", text: "What is known?" }],
    };
    const update = await handleReviewStudyApi(
      jsonRequest(
        "http://example.com/api/workspaces/project/review-study/protocol",
        { expectedRevision: initial.revision, content },
        "PUT",
      ),
      study,
      identity,
      "/review-study/protocol",
    );
    expect(update.status).toBe(200);
    await expect(update.json()).resolves.toMatchObject({ revision: 2, protocol: { objective: "Answer a reproducible question" } });

    const freeze = await handleReviewStudyApi(
      jsonRequest("http://example.com/api/workspaces/project/review-study/protocol/freeze", { expectedRevision: 2 }),
      study,
      identity,
      "/review-study/protocol/freeze",
    );
    await expect(freeze.json()).resolves.toMatchObject({ revision: 3, protocol: { status: "frozen", createdBy: identity.email } });
  });

  it("rejects malformed protocol requests and unknown routes", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-api-invalid-${crypto.randomUUID()}`);
    await expect(
      handleReviewStudyApi(
        jsonRequest("http://example.com/api/workspaces/project/review-study/protocol", { expectedRevision: 0, content: {} }, "PUT"),
        study,
        identity,
        "/review-study/protocol",
      ),
    ).rejects.toThrow("revision");
    expect(
      (
        await handleReviewStudyApi(
          new Request("http://example.com/api/workspaces/project/review-study/missing"),
          study,
          identity,
          "/review-study/missing",
        )
      ).status,
    ).toBe(404);
  });

  it("previews and confirms a source search import", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-api-search-${crypto.randomUUID()}`);
    const initial = (await (
      await handleReviewStudyApi(new Request("http://example.com/review"), study, identity, "/review-study")
    ).json()) as { revision: number };
    const content = {
      ...defaultReviewProtocol(),
      sources: [
        { id: "acm", name: "ACM DL", url: "https://dl.acm.org", dialect: "acm-dl" as const, fieldScope: "title-abstract" as const },
      ],
    };
    await handleReviewStudyApi(
      jsonRequest("http://example.com/protocol", { expectedRevision: initial.revision, content }, "PUT"),
      study,
      identity,
      "/review-study/protocol",
    );
    await handleReviewStudyApi(
      jsonRequest("http://example.com/freeze", { expectedRevision: 2 }),
      study,
      identity,
      "/review-study/protocol/freeze",
    );
    const bibtex = "@article{study, title={A Study}, author={Doe, Jane}, year={2025}}";
    const previewResponse = await handleReviewStudyApi(
      jsonRequest("http://example.com/preview", { bibtex }),
      study,
      identity,
      "/review-study/search-import-previews",
    );
    const preview = (await previewResponse.json()) as { digest: string };
    const confirm = await handleReviewStudyApi(
      jsonRequest("http://example.com/runs", {
        expectedRevision: 3,
        sourceId: "acm",
        query: "[[Title: study]]",
        searchedAt: "2026-07-17T10:00:00Z",
        bibtex,
        digest: preview.digest,
      }),
      study,
      identity,
      "/review-study/search-runs",
    );
    await expect(confirm.json()).resolves.toMatchObject({ revision: 4, counts: { identified: 1, unique: 1 } });
  });
});

function jsonRequest(url: string, body: unknown, method: "POST" | "PUT" = "POST"): Request {
  return new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
