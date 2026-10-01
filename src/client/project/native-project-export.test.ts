import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeProjectExport } from "./native-project-export";
class ExportPanel extends NativeProjectExport {
  saved: Blob | null = null;
  override getAttribute(): string {
    return "/api/workspaces/project";
  }
  inspect(): Promise<void> {
    return this.preview();
  }
  view() {
    return this.render();
  }
  downloadForTest(): Promise<void> {
    return this.download();
  }
  protected override saveArchive(blob: Blob): void {
    this.saved = blob;
  }
}
afterEach(() => vi.restoreAllMocks());
describe("native project export panel", () => {
  it("discloses scope before offering download and prevents duplicate inspections", async () => {
    const panel = new ExportPanel();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        title: "Paper",
        entryPath: "paper.md",
        files: 2,
        references: 3,
        pdfs: 1,
        images: 1,
        sharedSnapshots: 1,
        exclusions: ["Private Library data"],
      }),
    );
    expect(JSON.stringify(panel.view())).not.toContain("Download Kirjolab project");
    const first = panel.inspect();
    await panel.inspect();
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/project/export/project-preview", { credentials: "same-origin" });
    expect(JSON.stringify(panel.view())).toContain("Private Library data");
    expect(JSON.stringify(panel.view())).toContain("Download Kirjolab project");
    fetchMock.mockResolvedValueOnce(new Response("zip", { headers: { "content-type": "application/zip" } }));
    await panel.downloadForTest();
    expect(await panel.saved?.text()).toBe("zip");
  });
  it("shows network and malformed response failures", async () => {
    const panel = new ExportPanel();
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(Response.json({ invalid: true }));
    await panel.inspect();
    expect(JSON.stringify(panel.view())).toContain("Offline");
    await panel.inspect();
    expect(JSON.stringify(panel.view())).toContain("invalid export preview");
  });
  it("keeps failed downloads in the dialog with retry available", async () => {
    const panel = new ExportPanel();
    await panel.downloadForTest();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          title: "Paper",
          entryPath: "paper.md",
          files: 1,
          references: 0,
          pdfs: 0,
          images: 0,
          sharedSnapshots: 0,
          exclusions: [],
        }),
      )
      .mockResolvedValueOnce(Response.json({ error: "Required PDF is missing" }, { status: 409 }));
    await panel.inspect();
    const pending = panel.downloadForTest();
    await panel.downloadForTest();
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(panel.saved).toBeNull();
    expect(JSON.stringify(panel.view())).toContain("Required PDF is missing");
  });
});
