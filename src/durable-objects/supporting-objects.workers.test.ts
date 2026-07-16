import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { WorkspaceAccess } from "./workspace-access";
import { WorkspaceCatalog } from "./workspace-catalog";

interface MigrationLedgerRow extends Record<string, SqlStorageValue> {
  name: string;
  version: number;
}

describe("supporting Durable Objects in the Workers runtime", () => {
  it("reconstructs catalog and access state with immutable migration ledgers", async () => {
    const suffix = crypto.randomUUID();
    const catalog = env.WORKSPACE_CATALOGS.getByName(`catalog-${suffix}`);
    const access = env.WORKSPACE_ACCESS.getByName(`access-${suffix}`);

    await catalog.listWorkspaces();
    const registered = await catalog.registerWorkspace("persisted-workspace", "Persisted workspace");
    const owner = await access.initializeOwner(" Owner@Example.TEST ");
    const member = await access.addMember(owner.email, " Member@Example.TEST ");

    const catalogLedger = await runInDurableObject(catalog, (_instance: WorkspaceCatalog, state) => ledgerRows(state));
    const accessLedger = await runInDurableObject(access, (_instance: WorkspaceAccess, state) => ledgerRows(state));
    expect(catalogLedger).toEqual([
      { version: 1, name: "create-workspace-catalog" },
      { version: 2, name: "archive-workspaces" },
      { version: 3, name: "add-public-share-locators" },
      { version: 4, name: "retain-github-import-previews" },
    ]);
    expect(accessLedger).toEqual([
      { version: 1, name: "create-workspace-access" },
      { version: 2, name: "assign-stable-person-identities" },
      { version: 3, name: "create-read-only-share" },
      { version: 4, name: "map-read-only-share-targets" },
      { version: 5, name: "create-edit-share" },
      { version: 6, name: "retain-active-share-tokens" },
    ]);

    const demoLocator = await catalog.getOrCreateShareLocator("demo");
    expect(demoLocator).toMatch(/^[0-9a-f-]{36}$/u);
    expect(await catalog.getOrCreateShareLocator("demo")).toBe(demoLocator);
    expect(await catalog.getOrCreateShareLocator(registered.id)).toBe(registered.id);

    const importPreview = await catalog.createGitHubImportPreview(
      { installationId: 7, owner: "bebraw", repository: "scalability_book", branch: "main", rootPath: "book" },
      {
        repositoryId: 99,
        owner: "bebraw",
        repository: "scalability_book",
        branch: "main",
        rootPath: "book",
        commitSha: "a".repeat(40),
        commitMessage: "Import source",
        files: [{ path: "main.md", blobSha: "b".repeat(40), content: "# Main\n" }],
        skipped: [],
      },
      "main.md",
    );
    expect(await catalog.getGitHubImportPreview(importPreview.id)).toEqual(importPreview);
    await catalog.deleteGitHubImportPreview(importPreview.id);
    expect(await catalog.getGitHubImportPreview(importPreview.id)).toBeNull();

    expect(await access.getReadOnlyShareStatus(owner.email)).toEqual({ active: false, createdAt: null, token: null });
    const share = await access.createReadOnlyShare(owner.email);
    expect(share.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(await access.validateReadOnlyShare(share.token)).toBe(true);
    const changedToken = `${share.token.slice(0, -1)}${share.token.endsWith("x") ? "y" : "x"}`;
    expect(await access.validateReadOnlyShare(changedToken)).toBe(false);
    expect(await access.getReadOnlyShareStatus(owner.email)).toEqual({ active: true, createdAt: share.createdAt, token: share.token });
    expect(await access.resolveReadOnlyShare(share.token)).toEqual({ valid: true, target: null });

    const mapped = await access.createMappedReadOnlyShare("owner-key:demo", "demo");
    expect(await access.resolveReadOnlyShare(mapped.token)).toEqual({
      valid: true,
      target: { storageKey: "owner-key:demo", workspaceId: "demo" },
    });
    expect(await access.getMappedReadOnlyShareStatus()).toEqual({ active: true, createdAt: mapped.createdAt, token: mapped.token });
    await runInDurableObject(access, (_instance: WorkspaceAccess, state) => {
      state.storage.sql.exec("UPDATE read_only_share SET token = NULL WHERE singleton = 1");
    });
    expect(await access.getMappedReadOnlyShareStatus()).toEqual({ active: true, createdAt: mapped.createdAt, token: null });
    expect(await access.resolveReadOnlyShare(mapped.token)).toEqual({
      valid: true,
      target: { storageKey: "owner-key:demo", workspaceId: "demo" },
    });

    expect(await access.getMappedEditShareStatus()).toEqual({ active: false, createdAt: null, token: null });
    const editShare = await access.createMappedEditShare("owner-key:demo", "demo");
    expect(editShare.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(await access.resolveEditShare(editShare.token)).toEqual({
      valid: true,
      target: { storageKey: "owner-key:demo", workspaceId: "demo" },
    });
    expect(await access.getMappedEditShareStatus()).toEqual({ active: true, createdAt: editShare.createdAt, token: editShare.token });

    expect((await catalog.updateWorkspace(registered.id, "Renamed workspace", true)).archivedAt).not.toBeNull();
    expect((await catalog.updateWorkspace(registered.id, registered.title, false)).archivedAt).toBeNull();
    const acceptedCatalogState = {
      workspaces: await catalog.listWorkspaces(),
      registered: await catalog.getWorkspace(registered.id),
    };
    const acceptedAccessState = {
      ownerRole: await access.getRole(owner.email),
      memberRole: await access.getRole(member.email),
      members: await access.listMembers(owner.email),
    };
    expect(acceptedCatalogState.registered).toMatchObject({ id: registered.id, title: registered.title, archivedAt: null });
    expect(acceptedAccessState).toEqual({ ownerRole: "owner", memberRole: "member", members: [owner, member] });
    expect(owner.id).toMatch(/^[0-9a-f-]{32,36}$/u);
    expect(member.id).toMatch(/^[0-9a-f-]{32,36}$/u);

    await evictDurableObject(catalog);
    await evictDurableObject(access);

    expect({
      workspaces: await catalog.listWorkspaces(),
      registered: await catalog.getWorkspace(registered.id),
    }).toEqual(acceptedCatalogState);
    expect({
      ownerRole: await access.getRole(owner.email),
      memberRole: await access.getRole(member.email),
      members: await access.listMembers(owner.email),
    }).toEqual(acceptedAccessState);
    expect(await access.resolveReadOnlyShare(mapped.token)).toEqual({
      valid: true,
      target: { storageKey: "owner-key:demo", workspaceId: "demo" },
    });
    expect(await access.resolveEditShare(editShare.token)).toEqual({
      valid: true,
      target: { storageKey: "owner-key:demo", workspaceId: "demo" },
    });
    expect(await runInDurableObject(catalog, (_instance: WorkspaceCatalog, state) => ledgerRows(state))).toEqual(catalogLedger);
    expect(await runInDurableObject(access, (_instance: WorkspaceAccess, state) => ledgerRows(state))).toEqual(accessLedger);

    await access.revokeMappedReadOnlyShare();
    expect(await access.resolveReadOnlyShare(mapped.token)).toEqual({ valid: false, target: null });
    await access.revokeMappedEditShare();
    expect(await access.resolveEditShare(editShare.token)).toEqual({ valid: false, target: null });
    await access.deleteWorkspaceAccess(owner.email);
    expect(await access.getRole(owner.email)).toBeNull();
    expect(await access.getMappedReadOnlyShareStatus()).toEqual({ active: false, createdAt: null, token: null });
    expect(await access.getMappedEditShareStatus()).toEqual({ active: false, createdAt: null, token: null });
  });
});

function ledgerRows(state: DurableObjectState): MigrationLedgerRow[] {
  return state.storage.sql.exec<MigrationLedgerRow>("SELECT version, name FROM _kirjolab_migrations ORDER BY version ASC").toArray();
}
