import { describe, expect, it } from "vitest";
import { latexConversionMaximumSemanticRecords } from "./latex-contracts";
import { resolveMaximumSemanticRecords } from "./latex-semantic-limit";

describe("LaTeX semantic limits", () => {
  it("retains a valid tightened semantic-record ceiling", () => {
    expect(resolveMaximumSemanticRecords({ maximumSemanticRecords: 1 })).toBe(1);
    expect(resolveMaximumSemanticRecords({ maximumSemanticRecords: 7 })).toBe(7);
  });

  it("clamps omitted and oversized semantic-record ceilings to the hard maximum", () => {
    expect(resolveMaximumSemanticRecords({})).toBe(latexConversionMaximumSemanticRecords);
    expect(resolveMaximumSemanticRecords({ maximumSemanticRecords: latexConversionMaximumSemanticRecords + 1 })).toBe(
      latexConversionMaximumSemanticRecords,
    );
  });

  it.each([0, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects the malformed semantic-record ceiling %s with a stable code",
    (maximumSemanticRecords) => {
      expect(() => resolveMaximumSemanticRecords({ maximumSemanticRecords })).toThrowError(
        expect.objectContaining({
          name: "LatexConversionError",
          code: "invalid-conversion-options",
          message: "maximumSemanticRecords must be a positive safe integer",
        }),
      );
    },
  );
});
