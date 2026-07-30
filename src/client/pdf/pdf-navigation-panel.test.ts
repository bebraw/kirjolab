import { describe, expect, it } from "vitest";
import { PdfNavigationPanel, togglePdfBookmark } from "./pdf-navigation-panel";

class TestPdfNavigationPanel extends PdfNavigationPanel {
  renderForTest() {
    return this.render();
  }
}

function templateText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(templateText).join(" ");
  if (!value || typeof value !== "object") return "";
  const template = value as { readonly strings?: readonly string[]; readonly values?: readonly unknown[] };
  return [...(template.strings ?? []), ...(template.values ?? []).map(templateText)].join(" ");
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("PDF bookmarks", () => {
  it("adds, sorts, and removes personal page bookmarks", () => {
    expect(togglePdfBookmark([7, 2], 4)).toEqual([2, 4, 7]);
    expect(togglePdfBookmark([2, 4, 7], 4)).toEqual([2, 7]);
  });

  it("keeps document-map loading visible beside placeholder pages", async () => {
    let releaseThumbnail = (_value: string): void => undefined;
    const firstThumbnail = new Promise<string>((resolve) => {
      releaseThumbnail = resolve;
    });
    const panel = new TestPdfNavigationPanel();
    panel.bind({
      navigation: async () => ({ outline: [], pages: 2 }),
      openPage: async () => undefined,
      thumbnail: async (page) => (page === 1 ? await firstThumbnail : "page-two"),
    });

    panel.show();
    await settle();
    expect(templateText(panel.renderForTest())).toContain("Loading page previews… 0 of 2");

    releaseThumbnail("page-one");
    await settle();
    await settle();
    expect(templateText(panel.renderForTest())).not.toContain("Loading page previews");
  });

  it("offers stable retry guidance without exposing navigation failures", async () => {
    const panel = new TestPdfNavigationPanel();
    panel.bind({
      navigation: async () => {
        throw new Error("/private/tmp/pdf-worker-profile failed");
      },
      openPage: async () => undefined,
      thumbnail: async () => "",
    });

    panel.show();
    await settle();
    const text = templateText(panel.renderForTest());
    expect(text).toContain("Could not load the document map. Retry in a moment.");
    expect(text).toContain("Retry");
    expect(text).not.toContain("/private/tmp");
  });
});
