import { afterEach, describe, expect, it, vi } from "vitest";
import { shareLinkDescription, WorkspaceSharingPanel, workspaceSharingNoticeEvent } from "./workspace-sharing-panel";

const member = { addedAt: "2026-07-25T00:00:00.000Z", email: "owner@example.org", id: "owner", role: "owner" as const };

class TestWorkspaceSharingPanel extends WorkspaceSharingPanel {
  override performUpdate(): void {}

  renderForTest() {
    return this.render();
  }

  async refreshForTest(): Promise<void> {
    await this.refresh();
  }

  async mutateForTest(kind: "read-only" | "edit", action: "create" | "revoke"): Promise<void> {
    await this.mutateShare(kind, action);
  }

  async inviteForTest(email: string): Promise<void> {
    const event = new Event("input");
    Object.defineProperty(event, "currentTarget", { value: { value: email } });
    this.updateInviteEmail(event as InputEvent);
    await this.invite();
  }
}

class FakeDialog extends EventTarget {
  closeCount = 0;
  modalCount = 0;

  close(): void {
    this.closeCount += 1;
  }

  showModal(): void {
    this.modalCount += 1;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("workspace sharing presentation", () => {
  it("describes retrievable links by their capability", () => {
    const status = { active: true, createdAt: "2026-07-25T00:00:00.000Z", href: "/share/example.secret" };

    expect(shareLinkDescription("read-only", status)).toContain("inspect");
    expect(shareLinkDescription("edit", status)).toContain("change authored project files");
  });

  it("distinguishes legacy active links from links that can be created", () => {
    expect(shareLinkDescription("read-only", { active: true, createdAt: null, href: null })).toContain("secret cannot be recovered");
    expect(shareLinkDescription("read-only", { active: false, createdAt: null, href: null })).toContain("not edit");
    expect(shareLinkDescription("edit", { active: false, createdAt: null, href: null })).toContain("may edit");
  });

  it("owns its initial sharing presentation", () => {
    const panel = new TestWorkspaceSharingPanel();
    expect(panel.renderForTest()).toBeDefined();
  });

  it("loads members and both capability-link states", async () => {
    const panel = new TestWorkspaceSharingPanel();
    panel.configure("/api/workspaces/workspace-1");
    vi.stubGlobal("location", { origin: "https://example.test" });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/members")) return Response.json([member]);
      if (url.endsWith("/edit-link")) return Response.json({ error: "Forbidden" }, { status: 403 });
      return Response.json({ active: true, createdAt: "2026-07-25T00:00:00.000Z", href: "/share/token" });
    });
    vi.stubGlobal("fetch", fetchMock);

    await panel.refreshForTest();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("creates and revokes capability links locally", async () => {
    const panel = new TestWorkspaceSharingPanel();
    const notices: string[] = [];
    panel.configure("/api/workspaces/workspace-1");
    panel.addEventListener(workspaceSharingNoticeEvent, (event) => notices.push((event as CustomEvent<string>).detail));
    vi.stubGlobal("location", { origin: "https://example.test" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ href: "/share/token" }))
      .mockResolvedValueOnce(Response.json({ active: true, createdAt: "2026-07-25", href: "/share/token" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ active: false, createdAt: null, href: null }));
    vi.stubGlobal("fetch", fetchMock);

    await panel.mutateForTest("read-only", "create");
    await panel.mutateForTest("read-only", "revoke");

    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", undefined, "DELETE", undefined]);
    expect(notices).toEqual(["Read-only link created. You can return here to copy it again.", "Read-only link revoked."]);
  });

  it("invites collaborators and contains malformed mutations", async () => {
    const panel = new TestWorkspaceSharingPanel();
    const notices: string[] = [];
    panel.configure("/api/workspaces/workspace-1");
    panel.addEventListener(workspaceSharingNoticeEvent, (event) => notices.push((event as CustomEvent<string>).detail));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json([member]))
      .mockResolvedValueOnce(Response.json({ href: 42 }));
    vi.stubGlobal("fetch", fetchMock);

    await panel.inviteForTest("collaborator@example.org");
    await panel.mutateForTest("edit", "create");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/workspaces/workspace-1/members",
      expect.objectContaining({ body: JSON.stringify({ email: "collaborator@example.org" }), method: "POST" }),
    );
    expect(notices).toEqual(["Collaborator invited to this project.", "Edit link returned invalid data"]);
  });

  it("owns its native dialog lifecycle", () => {
    const panel = new WorkspaceSharingPanel();
    const dialog = new FakeDialog();
    vi.stubGlobal("HTMLDialogElement", FakeDialog);
    Object.defineProperty(panel, "closest", { value: () => dialog });

    panel.open();
    panel.close();

    expect(dialog.modalCount).toBe(1);
    expect(dialog.closeCount).toBe(1);
  });

  it("owns its trigger and notice forwarding", async () => {
    const panel = new TestWorkspaceSharingPanel();
    const dialog = new FakeDialog();
    const trigger = new EventTarget();
    const presentNotice = vi.fn();
    vi.stubGlobal("HTMLDialogElement", FakeDialog);
    Object.defineProperty(panel, "closest", { value: () => dialog });
    panel.configure("/api/workspaces/workspace-1", {
      shareWorkspace: trigger,
      toast: { show: presentNotice },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Sharing unavailable")));

    trigger.dispatchEvent(new Event("click"));
    expect(dialog.modalCount).toBe(1);
    await panel.mutateForTest("edit", "create");
    expect(presentNotice).toHaveBeenCalledWith("Sharing unavailable");
  });
});
