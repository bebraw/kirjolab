import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectImportPreview } from "../../domain/project/project-interchange-contracts";
import { ProjectImportPanel } from "./project-import-panel";

const preview: ProjectImportPreview = {
  kind: "native",
  archiveSha256: "a".repeat(64),
  previewDigest: "b".repeat(64),
  reusedReferences: 1,
  newReferences: 1,
  summary: {
    title: "Imported",
    entryPath: "paper.md",
    files: 2,
    references: 2,
    images: 0,
    pdfs: 0,
    sharedSnapshots: 0,
    exclusions: ["History is excluded"],
  },
};
class Panel extends ProjectImportPanel {
  override querySelector<E extends Element = Element>(): E | null {
    return null;
  }
  select(file?: File): void {
    this.archiveChanged(targetEvent({ files: file ? [file] : [] }));
  }
  titleForTest(value: string): void {
    this.updateTitle(targetEvent({ value }));
  }
  inspect(): Promise<void> {
    return this.preview(new Event("submit"));
  }
  create(): Promise<void> {
    return this.confirm();
  }
  cancelEvent(event: Event): void {
    this.preventBusyCancel(event);
  }
  view() {
    return this.render();
  }
}
function targetEvent(value: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value });
  return event;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("native project import panel", () => {
  it("previews scope, preserves one attempt across failed confirmation and navigates after retry", async () => {
    const panel = new Panel(),
      archive = new File(["zip"], "project.zip");
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(preview))
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValueOnce(Response.json({ workspace: { href: "/editor/imported" } }));
    panel.select(archive);
    await panel.inspect();
    panel.titleForTest("Reviewed title");
    expect(JSON.stringify(panel.view())).toContain("History is excluded");
    await panel.create();
    await panel.create();
    expect(fetchMock.mock.calls[1]![0]).toBe(fetchMock.mock.calls[2]![0]);
    expect(String(fetchMock.mock.calls[1]![0])).toContain("title=Reviewed+title");
    expect(assign).toHaveBeenCalledWith("/editor/imported");
  });
  it("blocks legacy archives and rejects oversized files without a request", async () => {
    const panel = new Panel();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ...preview, kind: "legacy", previewDigest: null }));
    await panel.inspect();
    await panel.create();
    expect(fetchMock).not.toHaveBeenCalled();
    panel.select(new File(["zip"], "legacy.zip"));
    await panel.inspect();
    await panel.create();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(panel.view())).toContain("cannot restore a complete project");
    const large = new File(["zip"], "large.zip");
    Object.defineProperty(large, "size", { value: 20 * 1024 * 1024 + 1 });
    panel.select(large);
    await panel.inspect();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(panel.view())).toContain("exceeds 20 MiB");
  });
  it("ignores stale previews and prevents creation after archive selection changes", async () => {
    const panel = new Panel();
    let resolve: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((done) => {
      resolve = done;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValueOnce(pending).mockResolvedValueOnce(Response.json(preview));
    panel.select(new File(["first"], "first.zip"));
    const request = panel.inspect();
    panel.reset();
    resolve(Response.json(preview));
    await request;
    await panel.create();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    panel.select(new File(["second"], "second.zip"));
    await panel.inspect();
    panel.select();
    await panel.create();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("shows response errors and blocks duplicate requests while busy", async () => {
    const panel = new Panel();
    panel.select(new File(["zip"], "project.zip"));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ invalid: true }))
      .mockResolvedValueOnce(Response.json(preview))
      .mockResolvedValueOnce(Response.json({ workspace: { href: "https://untrusted.test" } }));
    await panel.inspect();
    expect(JSON.stringify(panel.view())).toContain("invalid project preview");
    const pending = panel.inspect();
    const cancel = new Event("cancel", { cancelable: true });
    panel.cancelEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    await panel.inspect();
    await panel.create();
    await pending;
    const allowedCancel = new Event("cancel", { cancelable: true });
    panel.cancelEvent(allowedCancel);
    expect(allowedCancel.defaultPrevented).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    panel.titleForTest("");
    await panel.create();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    panel.titleForTest("Title");
    await panel.create();
    expect(JSON.stringify(panel.view())).toContain("invalid project data");
  });
});
