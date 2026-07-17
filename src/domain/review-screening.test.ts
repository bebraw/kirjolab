import { describe, expect, it } from "vitest";
import { screeningStageState, type ScreeningDecision } from "./review-screening";

const decision = (reviewer: string, value: ScreeningDecision["decision"]): ScreeningDecision => ({
  id: crypto.randomUUID(),
  recordId: "record",
  stage: "title-abstract",
  reviewer,
  decision: value,
  reason: "Reason",
  criterion: "Criterion",
  createdAt: new Date().toISOString(),
});

describe("review screening", () => {
  it("requires the configured number of independent decisions", () => {
    expect(screeningStageState([decision("a", "include")], null, 2).outcome).toBe("pending");
    expect(screeningStageState([decision("a", "include"), decision("b", "include")], null, 2).outcome).toBe("include");
  });

  it("surfaces conflicts and lets adjudication override without deleting decisions", () => {
    const decisions = [decision("a", "include"), decision("b", "exclude")];
    expect(screeningStageState(decisions, null, 2).outcome).toBe("conflict");
    const state = screeningStageState(
      decisions,
      {
        id: "resolution",
        recordId: "record",
        stage: "title-abstract",
        outcome: "include",
        reason: "Consensus",
        adjudicator: "lead",
        createdAt: new Date().toISOString(),
      },
      2,
    );
    expect(state).toMatchObject({ outcome: "include", decisions });
  });

  it("uses the latest append-only decision per reviewer", () => {
    expect(screeningStageState([decision("a", "exclude"), decision("a", "include")], null, 1).outcome).toBe("include");
  });
});
