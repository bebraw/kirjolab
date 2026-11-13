import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryPdfShareDialog } from "./library-pdf-share-dialog";
import { isTemplateResult } from "lit/directive-helpers.js";
import type { TemplateResult } from "lit";

const share = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "paper-annotated.pdf",
  createdAt: "2026-11-13T10:00:00.000Z",
  href: `/share/pdf/${"a".repeat(43)}`,
};

class TestDialog extends LibraryPdfShareDialog {
  readonly modal = {
    open: false,
    showModal: vi.fn(() => {
      this.modal.open = true;
    }),
    close: vi.fn(() => {
      this.modal.open = false;
    }),
  };
  override get updateComplete(): Promise<boolean> {
    return Promise.resolve(true);
  }
  protected override get dialog() {
    return this.modal;
  }
  createForTest(): Promise<void> {
    return this.createShare();
  }
  copyForTest(): Promise<void> {
    return this.copyShare(share);
  }
  revokeForTest(): Promise<void> {
    return this.revokeShare(share);
  }
  renderForTest() {
    return this.render();
  }
}

function templateText(value: unknown): string {
  if (Array.isArray(value)) return value.map(templateText).join("");
  if (!isTemplateResult(value, 1)) return typeof value === "string" ? value : "";
  return value.strings.reduce((output, part, index) => `${output}${part}${templateText(value.values[index])}`, "");
}

function templates(value: unknown): TemplateResult[] {
  if (Array.isArray(value)) return value.flatMap(templates);
  return isTemplateResult(value, 1) ? [value, ...value.values.flatMap(templates)] : [];
}

function element(value: unknown, tag: string, text: string) {
  for (const template of templates(value)) {
    const markup = template.strings.map((part, index) => `${part}${index < template.values.length ? `SLOT${index}` : ""}`).join("");
    for (const match of markup.matchAll(new RegExp(`<${tag}\\b[^>]*>${tag === "input" ? "" : `[\\s\\S]*?</${tag}>`}`, "g"))) {
      if (!match[0].includes(text)) continue;
      return {
        markup: match[0],
        binding(attribute: string): unknown {
          const index = new RegExp(`${attribute.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}=SLOT(\\d+)`).exec(match[0])?.[1];
          if (index === undefined) throw new Error(`Missing ${attribute} on ${tag} ${text}`);
          return template.values[Number(index)];
        },
      };
    }
  }
  throw new Error(`Missing ${tag} ${text}`);
}

async function click(dialog: TestDialog, label: string): Promise<void> {
  const handler = element(dialog.renderForTest(), "button", label).binding("@click");
  if (typeof handler !== "function") throw new Error(`Missing click handler for ${label}`);
  await handler.call(dialog);
}

function dispatch(dialog: TestDialog, tag: string, text: string, event: Event): void {
  const handler = element(dialog.renderForTest(), tag, text).binding(`@${event.type}`);
  if (typeof handler !== "function") throw new Error(`Missing ${event.type} handler`);
  handler.call(dialog, event);
}

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: "https://kirjolab.example" } });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("annotated PDF sharing dialog", () => {
  it("explains the public immutable copy and renders safe readable links", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ shares: [share] }));
    const dialog = new TestDialog();
    await dialog.open({ id: "artifact", name: "Colleague's paper.pdf" });
    const rendered = dialog.renderForTest();
    const text = templateText(rendered);
    expect(text).toContain("Colleague's paper.pdf");
    expect(text).toContain("Anyone with the link can read and download this PDF");
    expect(text).toContain("including all its saved highlights, comments, page notes, and drawings.");
    expect(text).toContain("Each link shares a fixed copy. Later changes stay private.");
    expect(text).toContain("Revoking a link stops future access; downloaded copies remain.");
    expect(text).toContain(`Shared ${new Date(share.createdAt).toLocaleString()}`);
    const link = element(rendered, "a", "Open copy");
    expect(link.binding("href")).toBe(share.href);
    expect(link.markup).toContain('target="_blank" rel="noopener noreferrer"');
    const input = element(rendered, "input", "readonly");
    expect(input.binding(".value")).toBe(`https://kirjolab.example${share.href}`);
    expect(element(rendered, "button", "Copy link").binding("?disabled")).toBe(false);
    expect(element(rendered, "button", "Revoke link").binding("?disabled")).toBe(false);
    expect(element(rendered, "button", "button-primary").binding("?disabled")).toBe(false);
    expect(text).not.toContain("Retry</button>");
  });

  it("keeps loading modal actions disabled and ignores another PDF until the request finishes", async () => {
    let respond = (_response: Response): void => undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );
    const dialog = new TestDialog();
    const opening = dialog.open({ id: "first", name: "First paper.pdf" });
    await Promise.resolve();
    expect(templateText(dialog.renderForTest())).toContain("Loading shared copies…");
    expect(templateText(dialog.renderForTest())).toContain("Please wait…");
    expect(element(dialog.renderForTest(), "button", "Done").binding("?disabled")).toBe(true);
    expect(element(dialog.renderForTest(), "button", "button-primary").binding("?disabled")).toBe(true);
    expect(templateText(dialog.renderForTest())).not.toContain("Retry</button>");
    const cancel = new Event("cancel", { cancelable: true });
    dispatch(dialog, "dialog", "pdf-share-heading", cancel);
    expect(cancel.defaultPrevented).toBe(true);
    await click(dialog, "Done");
    expect(dialog.modal.close).not.toHaveBeenCalled();
    await dialog.open({ id: "second", name: "Second paper.pdf" });
    await dialog.createForTest();
    await dialog.revokeForTest();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(templateText(dialog.renderForTest())).toContain("First paper.pdf");
    respond(Response.json({ shares: [] }));
    await opening;
    expect(templateText(dialog.renderForTest())).not.toContain("Loading shared copies…");
    expect(templateText(dialog.renderForTest())).toContain("No shared copies yet.");
    const idleCancel = new Event("cancel", { cancelable: true });
    dispatch(dialog, "dialog", "pdf-share-heading", idleCancel);
    expect(idleCancel.defaultPrevented).toBe(false);
    await click(dialog, "Done");
    expect(dialog.modal.close).toHaveBeenCalledOnce();
  });

  it("retries a failed list from the rendered action without allowing premature creation", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ error: "Shared copies unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ shares: [share] }));
    const dialog = new TestDialog();
    await dialog.open({ id: "artifact", name: "paper.pdf" });
    expect(templateText(dialog.renderForTest())).toContain("Shared copies unavailable");
    expect(element(dialog.renderForTest(), "button", "button-primary").binding("?disabled")).toBe(true);
    await dialog.revokeForTest();
    await click(dialog, "button-primary");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await click(dialog, "Retry");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/library/pdfs/artifact/shares", { credentials: "same-origin" });
    expect(templateText(dialog.renderForTest())).toContain(share.href);
    expect(templateText(dialog.renderForTest())).not.toContain("Shared copies unavailable");
    expect(templateText(dialog.renderForTest())).not.toContain("Retry</button>");
    expect(element(dialog.renderForTest(), "button", "button-primary").binding("?disabled")).toBe(false);
  });

  it("clears the previous PDF links when reopening and loads the new owner target", async () => {
    let respond = (_response: Response): void => undefined;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ shares: [share] }))
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
      )
      .mockResolvedValueOnce(Response.json({ shares: [] }));
    const dialog = new TestDialog();
    await dialog.open({ id: "first", name: "First paper.pdf" });
    const reopening = dialog.open({ id: "next/pdf", name: "Next paper.pdf" });
    await Promise.resolve();
    expect(dialog.modal.showModal).toHaveBeenCalledTimes(1);
    expect(templateText(dialog.renderForTest())).toContain("Next paper.pdf");
    expect(templateText(dialog.renderForTest())).not.toContain(share.href);
    expect(templateText(dialog.renderForTest())).not.toContain("No shared copies yet.");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/library/pdfs/next%2Fpdf/shares", { credentials: "same-origin" });
    respond(Response.json({ shares: [] }));
    await reopening;
    await click(dialog, "Done");
    await dialog.open({ id: "last", name: "Last paper.pdf" });
    expect(dialog.modal.showModal).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/library/pdfs/last/shares", { credentials: "same-origin" });
  });

  it("creates a new first row and revokes only the selected copy through rendered actions", async () => {
    const newShare = { ...share, id: "00000000-0000-4000-8000-000000000002", href: `/share/pdf/${"b".repeat(43)}` };
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ shares: [share] }))
      .mockResolvedValueOnce(Response.json({ share: newShare }, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const dialog = new TestDialog();
    await dialog.open({ id: "artifact", name: "paper.pdf" });
    await click(dialog, "button-primary");
    const rows = templates(dialog.renderForTest()).filter((template) => template.strings.join("").includes("<li "));
    expect(rows).toHaveLength(2);
    expect(element(rows[0], "input", "readonly").binding(".value")).toBe(`https://kirjolab.example${newShare.href}`);
    expect(element(rows[1], "input", "readonly").binding(".value")).toBe(`https://kirjolab.example${share.href}`);
    await click(dialog, "Copy link");
    expect(writeText).toHaveBeenCalledExactlyOnceWith(`https://kirjolab.example${newShare.href}`);
    await click(dialog, "Revoke link");
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/library/pdfs/artifact/shares/${newShare.id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    expect(templateText(dialog.renderForTest())).toContain(share.href);
    expect(templateText(dialog.renderForTest())).not.toContain(newShare.href);
    expect(templateText(dialog.renderForTest())).toContain("Link revoked. Downloaded copies remain with their recipients.");
  });

  it("selects the readonly full link for manual copying on focus", async () => {
    class TestInput {
      readonly select = vi.fn();
    }
    vi.stubGlobal("HTMLInputElement", TestInput);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ shares: [share] }));
    const dialog = new TestDialog();
    await dialog.open({ id: "artifact", name: "paper.pdf" });
    const input = new TestInput();
    const focus = new Event("focus");
    Object.defineProperty(focus, "currentTarget", { value: input });
    dispatch(dialog, "input", "readonly", focus);
    expect(input.select).toHaveBeenCalledOnce();
    expect(() => dispatch(dialog, "input", "readonly", new Event("focus"))).not.toThrow();
  });

  it.each([null, {}, { shares: null }, { shares: [null] }])(
    "rejects malformed list payload %j with an actionable retry",
    async (payload) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(payload));
      const dialog = new TestDialog();
      await dialog.open({ id: "artifact", name: "paper.pdf" });
      expect(templateText(dialog.renderForTest())).toContain("Shared PDF list returned invalid data.");
      expect(element(dialog.renderForTest(), "button", "Retry").binding("@click")).toBeTypeOf("function");
      expect(element(dialog.renderForTest(), "button", "button-primary").binding("?disabled")).toBe(true);
    },
  );
  it("opens existing shares and creates a snapshot only on explicit action", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ shares: [share] }))
      .mockResolvedValueOnce(Response.json({ share: { ...share, id: "00000000-0000-4000-8000-000000000002" } }, { status: 201 }));
    const dialog = new TestDialog();
    await dialog.open({ id: "artifact/1", name: "paper.pdf" });
    expect(dialog.modal.showModal).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/library/pdfs/artifact%2F1/shares", { credentials: "same-origin" });
    await dialog.createForTest();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/library/pdfs/artifact%2F1/shares", { method: "POST", credentials: "same-origin" });
    expect(templateText(dialog.renderForTest())).toContain("Link ready.");
    expect(templateText(dialog.renderForTest())).toContain(`https://kirjolab.example${share.href}`);
  });

  it("copies a full share link and revokes through the owning PDF", async () => {
    vi.stubGlobal("window", { location: { origin: "https://kirjolab.example" } });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ shares: [share] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const dialog = new TestDialog();
    await dialog.open({ id: "artifact/1", name: "paper.pdf" });
    await dialog.copyForTest();
    expect(writeText).toHaveBeenCalledWith(`https://kirjolab.example${share.href}`);
    expect(templateText(dialog.renderForTest())).toContain("Link copied.");
    await dialog.revokeForTest();
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/library/pdfs/artifact%2F1/shares/${share.id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    expect(templateText(dialog.renderForTest())).toContain("No shared copies yet.");
    expect(templateText(dialog.renderForTest())).not.toContain(share.href);
  });

  it("does not create a share before loading or after invalid list data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ shares: [{ href: "https://untrusted.example" }] }));
    const dialog = new TestDialog();
    await dialog.createForTest();
    expect(fetchMock).not.toHaveBeenCalled();
    await dialog.open({ id: "artifact", name: "paper.pdf" });
    await dialog.createForTest();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(templateText(dialog.renderForTest())).toContain("Shared PDF list returned invalid data.");
  });

  it("suppresses duplicate creation and permits retry after a failed request", async () => {
    let resolveRequest = (_response: Response): void => undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ shares: [] }))
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(Response.json({ share }, { status: 201 }));
    const dialog = new TestDialog();
    await dialog.open({ id: "artifact", name: "paper.pdf" });
    const first = dialog.createForTest();
    await dialog.createForTest();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolveRequest(Response.json({ error: "Could not prepare PDF" }, { status: 503 }));
    await first;
    expect(templateText(dialog.renderForTest())).toContain("Could not prepare PDF");
    await dialog.createForTest();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("preserves the link for manual copying when clipboard access fails", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Permission denied")) } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ shares: [share] }));
    const dialog = new TestDialog();
    await dialog.open({ id: "artifact", name: "paper.pdf" });
    await dialog.copyForTest();
    expect(templateText(dialog.renderForTest())).toContain("copy it manually");
    expect(templateText(dialog.renderForTest())).toContain(share.href);
  });

  it("retains a failed revocation for retry and rejects invalid creation data", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ shares: [share] }))
      .mockResolvedValueOnce(Response.json({ error: "Link revoked, but PDF cleanup failed. Retry revocation." }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ share: { ...share, href: "https://untrusted.example" } }));
    const dialog = new TestDialog();
    await dialog.open({ id: "artifact", name: "paper.pdf" });
    await dialog.revokeForTest();
    expect(templateText(dialog.renderForTest())).toContain("Retry revocation.");
    expect(templateText(dialog.renderForTest())).toContain(share.href);
    await dialog.createForTest();
    expect(templateText(dialog.renderForTest())).toContain("Shared PDF returned invalid data.");
    expect(templateText(dialog.renderForTest())).not.toContain("https://untrusted.example");
  });
});
