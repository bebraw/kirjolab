import { describe, expect, it } from "vitest";
import { renderButton } from "./markup";

describe("renderButton", () => {
  it("renders labelled button states through shared attributes", () => {
    expect(
      renderButton({
        label: "Remove <source>",
        id: "remove-source",
        tone: "secondary",
        destructive: true,
        compact: true,
        disabled: true,
        busy: true,
        pressed: false,
      }),
    ).toBe(
      '<button class="button-secondary" id="remove-source" type="button" aria-busy="true" aria-pressed="false" disabled data-compact="true" data-destructive="true"><span>Remove &lt;source&gt;</span></button>',
    );
  });

  it("requires an accessible name for icon-only buttons", () => {
    expect(renderButton({ icon: "close", ariaLabel: "Close", touchTarget: true })).toContain(
      'aria-label="Close" data-touch-target="true"><svg',
    );
  });

  it("rejects an empty visible label", () => {
    expect(() => renderButton({ label: "  " })).toThrow("Labelled buttons require visible text");
  });
});
