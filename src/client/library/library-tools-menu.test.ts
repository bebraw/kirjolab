import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LibraryToolsMenu,
  libraryToolsActionEvent,
  libraryToolsArchiveRefreshEvent,
  type LibraryToolsAction,
  type LibraryToolsArchiveRefresh,
} from "./library-tools-menu";

class TestLibraryToolsMenu extends LibraryToolsMenu {
  renderForTest() {
    return this.render();
  }

  openForTest(): void {
    this.openCitationNetwork();
  }

  reconcileForTest(): void {
    this.openReconciliation();
  }

  toggleForTest(): void {
    this.toggleArchived();
  }

  backfillForTest(): Promise<void> {
    return this.backfillPdfReferences();
  }
}

describe("library tools menu", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("owns archived-reference presentation", () => {
    const menu = new TestLibraryToolsMenu();
    menu.setShowArchived(true);
    expect(menu.includesArchivedReferences).toBe(true);
    expect(menu.renderForTest()).toBeDefined();
  });

  it("emits citation-network and archived-reference intents", () => {
    const menu = new TestLibraryToolsMenu();
    const actions: LibraryToolsAction[] = [];
    menu.addEventListener(libraryToolsActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryToolsAction>).detail);
    });

    menu.openForTest();
    menu.reconcileForTest();
    menu.toggleForTest();
    menu.setShowArchived(true);
    menu.toggleForTest();

    expect(actions).toEqual(["open-citation-network", "open-reconciliation", "archive-visibility-change", "archive-visibility-change"]);
  });

  it("owns archive restore transport and refresh acknowledgment", async () => {
    const menu = new TestLibraryToolsMenu();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const refreshes: LibraryToolsArchiveRefresh[] = [];
    menu.addEventListener(libraryToolsArchiveRefreshEvent, (event) => {
      refreshes.push((event as CustomEvent<LibraryToolsArchiveRefresh>).detail);
    });
    const archive = zip();

    await menu.restore(archive);
    await menu.restore(zip());

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/library/import/archive", {
      body: archive,
      credentials: "same-origin",
      headers: { "content-type": "application/zip" },
      method: "POST",
    });
    expect(refreshes).toEqual([{ message: "Portable library metadata restored.", requestId: 1 }]);
    menu.completeArchiveRestore(0);
    await menu.restore(zip());
    expect(fetchMock).toHaveBeenCalledOnce();
    menu.completeArchiveRestore(1);
  });

  it("keeps archive restore failures local", async () => {
    const menu = new TestLibraryToolsMenu();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Archive unavailable" }), { status: 503 })));

    await menu.restore(zip());

    expect(menu.renderForTest()).toBeDefined();
  });

  it("queues existing PDF analysis and presents progress", async () => {
    const menu = new TestLibraryToolsMenu();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ total: 3, missing: 0, queued: 0, running: 0, ready: 3, failed: 0, queuedNow: 2, truncated: false }));
    vi.stubGlobal("fetch", fetchMock);

    await menu.backfillForTest();

    expect(fetchMock).toHaveBeenCalledWith("/api/library/analyses/pdf-references/backfill", {
      credentials: "same-origin",
      method: "POST",
    });
    expect(menu.renderForTest()).toBeDefined();
  });

  it("keeps malformed backfill progress retryable", async () => {
    const menu = new TestLibraryToolsMenu();
    const fetchMock = vi.fn().mockResolvedValue(json({ invalid: true }));
    vi.stubGlobal("fetch", fetchMock);

    await menu.backfillForTest();
    await menu.backfillForTest();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(menu.renderForTest()).toBeDefined();
  });
});

function zip(): File {
  return new File(["PK"], "library.zip", { type: "application/zip" });
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}
