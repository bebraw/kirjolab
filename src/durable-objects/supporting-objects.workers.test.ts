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
    expect(catalogLedger).toEqual([{ version: 1, name: "create-workspace-catalog" }]);
    expect(accessLedger).toEqual([
      { version: 1, name: "create-workspace-access" },
      { version: 2, name: "assign-stable-person-identities" },
    ]);

    const acceptedCatalogState = {
      workspaces: await catalog.listWorkspaces(),
      registered: await catalog.getWorkspace(registered.id),
    };
    const acceptedAccessState = {
      ownerRole: await access.getRole(owner.email),
      memberRole: await access.getRole(member.email),
      members: await access.listMembers(owner.email),
    };
    expect(acceptedCatalogState.registered).toEqual(registered);
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
    expect(await runInDurableObject(catalog, (_instance: WorkspaceCatalog, state) => ledgerRows(state))).toEqual(catalogLedger);
    expect(await runInDurableObject(access, (_instance: WorkspaceAccess, state) => ledgerRows(state))).toEqual(accessLedger);
  });
});

function ledgerRows(state: DurableObjectState): MigrationLedgerRow[] {
  return state.storage.sql.exec<MigrationLedgerRow>("SELECT version, name FROM _kirjolab_migrations ORDER BY version ASC").toArray();
}
