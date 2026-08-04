import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { AuthIdentity } from "../security/auth";
import { handleRequest } from "../worker";
import { handleWorkspaceApi } from "./workspace";

describe("workspace GitHub deployment capability", () => {
  it.each(["/api/github/connection", "/api/github/import-previews"])(
    "gates the top-level GitHub API %s before constructing an integration client",
    async (path) => {
      const response = await handleRequest(new Request(`http://127.0.0.1${path}`), unconfiguredGitHubEnv());

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "GitHub integration is unavailable" });
    },
  );

  it("returns an explicit unavailable response without changing the project", async () => {
    const workspaceId = `github-disabled-${crypto.randomUUID()}`;
    const identity: AuthIdentity = {
      subject: `test:${crypto.randomUUID()}`,
      email: `github-disabled-${crypto.randomUUID()}@example.test`,
      ownerKey: `github-disabled-${crypto.randomUUID()}`,
      mode: "access",
    };
    const catalog = env.WORKSPACE_CATALOGS.getByName(identity.ownerKey);
    await catalog.registerWorkspace(workspaceId, "GitHub-disabled project");
    const access = env.WORKSPACE_ACCESS.getByName(workspaceId);
    await access.initializeOwner(identity.email);
    const room = env.DOCUMENT_ROOMS.getByName(workspaceId);
    await room.initializeWorkspace("GitHub-disabled project");
    const before = await room.getSnapshot(workspaceId);
    const response = await handleWorkspaceApi(
      new Request(`http://example.com/api/workspaces/${workspaceId}/github-sync`),
      unconfiguredGitHubEnv(),
      identity,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "GitHub integration is unavailable" });
    await expect(room.getSnapshot(workspaceId)).resolves.toEqual(before);
  });
});

function unconfiguredGitHubEnv(): Env {
  return new Proxy(env, {
    get(target, property) {
      if (typeof property === "string" && property.startsWith("GITHUB_")) return "";
      return Reflect.get(target, property);
    },
  });
}
