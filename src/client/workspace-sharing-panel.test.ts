import { describe, expect, it } from "vitest";
import { shareLinkDescription, WorkspaceSharingPanel } from "./workspace-sharing-panel";

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

  it("accepts coordinator-owned members and capability outcomes", () => {
    const panel = new WorkspaceSharingPanel();
    const inactive = { active: false, createdAt: null, href: null };

    panel.setMembers([{ addedAt: "2026-07-25T00:00:00.000Z", email: "owner@example.org", id: "owner", role: "owner" }]);
    panel.setShareStatus("read-only", inactive);
    panel.setShareStatus("edit", inactive);
    panel.setShareForbidden("read-only");
    panel.setShareForbidden("edit");
    panel.clearInvite();

    expect(panel).toBeInstanceOf(WorkspaceSharingPanel);
  });
});
