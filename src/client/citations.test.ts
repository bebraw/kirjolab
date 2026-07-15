import { describe, expect, it } from "vitest";
import { citationKeysAtPosition, createCitationInsertion, parseCitationKeys } from "./citations";

describe("citation navigation", () => {
  it("parses ordered case-insensitive citation keys without duplicates", () => {
    expect(parseCitationKeys(" Merton1942, doe2026, merton1942, , Smith ")).toEqual(["Merton1942", "doe2026", "Smith"]);
  });

  it("finds citation keys while the caret is within a directive", () => {
    const source = 'Before :cite[merton1942, doe2026]{locator="p. 4"} after';
    const start = source.indexOf(":cite");

    expect(citationKeysAtPosition(source, start)).toEqual(["merton1942", "doe2026"]);
    expect(citationKeysAtPosition(source, source.indexOf("locator"))).toEqual(["merton1942", "doe2026"]);
    expect(citationKeysAtPosition(source, source.length)).toEqual([]);
    expect(citationKeysAtPosition("::cite[not-a-text-directive]", 5)).toEqual([]);
    expect(citationKeysAtPosition(":cite[]", 3)).toEqual([]);
    expect(citationKeysAtPosition(":citet[textual]", 5)).toEqual(["textual"]);
    expect(citationKeysAtPosition(":citep[parenthetical]", 6)).toEqual(["parenthetical"]);
  });
});

describe("citation insertion", () => {
  it("inserts portable syntax with only the needed word boundaries", () => {
    expect(createCitationInsertion("Prose", 5, "merton1942")).toEqual({
      index: 5,
      text: " :cite[merton1942]",
      caret: 23,
    });
    expect(createCitationInsertion("Prosecontinues", 5, "merton1942")).toEqual({
      index: 5,
      text: " :cite[merton1942] ",
      caret: 23,
    });
    expect(createCitationInsertion("(claim).", 1, "merton1942")).toEqual({
      index: 1,
      text: ":cite[merton1942] ",
      caret: 18,
    });
    expect(createCitationInsertion("Claim.", 5, "merton1942")).toEqual({
      index: 5,
      text: " :cite[merton1942]",
      caret: 23,
    });
  });

  it("clamps the insertion point and rejects unsafe directive keys", () => {
    expect(createCitationInsertion("", 99, "key")).toEqual({ index: 0, text: ":cite[key]", caret: 10 });
    expect(createCitationInsertion("text", -4, "key")).toEqual({ index: 0, text: ":cite[key] ", caret: 10 });
    expect(createCitationInsertion("text", 2, "two words")).toBeNull();
    expect(createCitationInsertion("text", 2, "bad]key")).toBeNull();
    expect(createCitationInsertion("text", 2, "  ")).toBeNull();
  });
});
