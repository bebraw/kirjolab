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
    expect(
      renderButton({
        icon: "close",
        ariaLabel: "Close",
        className: "toolbar-action",
        title: "Dismiss",
        touchTarget: true,
      }),
    ).toBe(
      '<button class="button-icon toolbar-action" type="button" aria-label="Close" title="Dismiss" data-touch-target="true"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"></path></svg></button>',
    );
  });

  it("rejects an empty visible label", () => {
    expect(() => renderButton({ label: "  " })).toThrow("Labelled buttons require visible text");
  });

  it("uses visible text as the accessible name for labelled buttons", () => {
    expect(renderButton({ label: "Save" })).not.toContain("aria-label");
  });
});
