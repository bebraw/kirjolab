import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { defaultReviewProtocol } from "../domain/review-study";
import { ReviewStudy } from "./review-study";

describe("ReviewStudy in the Workers runtime", () => {
  it("persists isolated immutable protocol revisions", async () => {
    const study = env.REVIEW_STUDIES.getByName("review-a");
    const other = env.REVIEW_STUDIES.getByName("review-b");
    const initial = await study.getSnapshot("mlr", "owner@example.com");
    expect(initial).toMatchObject({ revision: 1, protocol: { profile: "mlr", status: "draft" } });
    expect((await other.getSnapshot()).protocol.profile).toBe("slr");

    const content = {
      ...defaultReviewProtocol("mlr"),
      objective: "Map practices",
      researchQuestions: [{ id: "rq1", text: "Which practices exist?" }],
      conceptGroups: [{ id: "practice", label: "Practice", facet: null, terms: ["software practice"] }],
      sources: [
        { id: "scopus", name: "Scopus", url: "https://scopus.com", dialect: "scopus" as const, fieldScope: "title-abstract" as const },
      ],
    };
    const edited = await study.replaceProtocol({ expectedRevision: 1, content, actor: "owner@example.com" });
    expect(edited).toMatchObject({ revision: 2, protocol: { objective: "Map practices", revision: 2 } });
    expect(edited.protocolHistory).toHaveLength(2);
    expect(edited.protocol.sourceQueries[0]?.query).toBe('TITLE-ABS(("software practice"))');

    const frozen = await study.freezeProtocol(2, "owner@example.com");
    expect(frozen).toMatchObject({ revision: 3, protocol: { status: "frozen" } });
    await runInDurableObject(study, (instance: ReviewStudy) => {
      expect(() => instance.replaceProtocol({ expectedRevision: 3, content, actor: "owner@example.com" })).toThrow("amended");
    });
    const amended = await study.amendProtocol({
      expectedRevision: 3,
      content: { ...content, objective: "Map current practices" },
      rationale: "Pilot search exposed ambiguity",
      actor: "owner@example.com",
    });
    expect(amended).toMatchObject({ revision: 4, protocol: { status: "frozen", rationale: "Pilot search exposed ambiguity" } });
  });

  it("rejects stale writers and records its migration", async () => {
    const study = env.REVIEW_STUDIES.getByName("review-conflict");
    await study.getSnapshot();
    await runInDurableObject(study, (instance: ReviewStudy) => {
      expect(() => instance.replaceProtocol({ expectedRevision: 0, content: defaultReviewProtocol(), actor: "owner@example.com" })).toThrow(
        "revision conflict",
      );
    });
    expect(
      await runInDurableObject(study, (_instance: ReviewStudy, state) =>
        state.storage.sql.exec<{ version: number; name: string }>("SELECT version, name FROM _kirjolab_migrations").toArray(),
      ),
    ).toEqual([{ version: 1, name: "store-review-protocol-revisions" }]);
  });
});
