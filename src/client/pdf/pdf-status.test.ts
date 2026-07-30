import { describe, expect, it } from "vitest";
import { pdfFailureMessage } from "./pdf-status";

describe("PDF status copy", () => {
  it("uses stable user-facing failures without service details", () => {
    expect(pdfFailureMessage("viewer")).toBe("Could not display this PDF. Try reopening it.");
    expect(pdfFailureMessage("navigation")).toBe("Could not load the document map. Retry in a moment.");
    expect(pdfFailureMessage("analysis-load")).toBe("Could not load PDF analysis. Retry in a moment.");
    expect(pdfFailureMessage("analysis")).toBe("Could not analyze this PDF. Retry when the local analysis service is available.");
  });
});
