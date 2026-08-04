import { describe, expect, it } from "vitest";

import { lowerBound } from "./lower-bound";

describe("lowerBound", () => {
  it("returns the first item that does not precede the target", () => {
    expect(lowerBound([1, 3, 5, 7], (value) => value < 5)).toBe(2);
  });

  it("returns the collection length when every item precedes the target", () => {
    expect(lowerBound([1, 3, 5], (value) => value < 10)).toBe(3);
  });

  it("returns zero when no item precedes the target", () => {
    expect(lowerBound([1, 3, 5], () => false)).toBe(0);
  });

  it("returns zero for an empty collection", () => {
    expect(lowerBound([], () => false)).toBe(0);
  });

  it("rejects sparse indexed collections", () => {
    expect(lowerBound({ 0: 1, length: 2 }, (value) => value < 2)).toBeNull();
  });
});
