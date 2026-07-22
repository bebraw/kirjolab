import { describe, expect, it } from "vitest";
import {
  backupBlobKey,
  isOwnedBinaryKey,
  legacyOwnerBackupSchemaVersion,
  maximumOwnerBackupBytes,
  ownerBackupDigest,
  ownerBackupManifestJson,
  ownerBackupManifestKey,
  ownerBackupSchemaVersion,
  parseOwnerBackupManifest,
  projectAssociatedReviewOwnerBackupSchemaVersion,
  referencedBinaryKeys,
  type BackupBinaryReferences,
  type BackupBinaryObject,
  type LegacyOwnerBackupManifest,
  type OwnerBackupManifest,
  type OwnerBackupState,
} from "./backups";
import { reviewBackupSchemaVersion, type ReviewBackupReference } from "./review-backup";

const emptyState = {
  ownerKey: "a".repeat(64),
  catalog: [],
  library: {
    references: [],
    referenceKeyStates: {},
    artifacts: [],
    webSources: [],
    webSnapshots: [],
    notes: [],
    highlights: [],
    tags: {},
    collections: {},
    reading: [],
  },
  workspaces: [],
  reviews: [],
} satisfies OwnerBackupState;

const reviewId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const linkId = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-07-19T00:00:00.000Z";

function reviewReference(): ReviewBackupReference {
  return {
    schemaVersion: reviewBackupSchemaVersion,
    backupKey: `backups/reviews/${emptyState.ownerKey}/${"d".repeat(64)}.json`,
    byteCount: 1024,
    payloadDigest: "d".repeat(64),
    authorityDigest: "e".repeat(64),
    reviewRevision: 8,
    protocolRevision: 3,
    historyFloorRevision: 1,
  };
}

function ownerManifest(): OwnerBackupManifest {
  const reference = reviewReference();
  return {
    schemaVersion: ownerBackupSchemaVersion,
    createdAt: timestamp,
    digest: "f".repeat(64),
    state: {
      ...emptyState,
      reviews: [
        {
          catalogRecord: {
            id: reviewId,
            title: "Independent evidence review",
            profile: "slr",
            href: `/review/${reviewId}`,
            role: "owner",
            createdAt: timestamp,
            updatedAt: timestamp,
            archivedAt: null,
            locator: { reviewId, storageKey: `review:${reviewId}`, legacyWorkspaceId: null },
          },
          access: {
            reviewId,
            legacySeededAt: null,
            deletedAt: null,
            members: [{ id: ownerId, email: "owner@example.test", role: "owner", addedAt: timestamp }],
            projectLinks: [
              {
                id: linkId,
                reviewId,
                workspaceId: "workspace-1",
                createdBy: "owner@example.test",
                createdAt: timestamp,
                status: "active",
                unlinkedAt: null,
                unlinkedBy: null,
              },
            ],
          },
          reviewPayload: reference,
          reviewRevisionSeed: "review:8:protocol:3",
        },
      ],
    },
    binaries: [],
    recovery: {
      catalog: null,
      library: null,
      workspaces: [],
      reviewCatalog: null,
      reviews: [{ reviewId, access: null, study: null }],
    },
  };
}

function expectInvalidManifest(manifest: unknown): void {
  const serialized = JSON.stringify(manifest);
  expect(() => parseOwnerBackupManifest(serialized), serialized).toThrow("Owner backup manifest is invalid");
}

describe("owner backup projection", () => {
  it("computes a stable digest independent of object property insertion order", async () => {
    const reordered = {
      workspaces: [],
      library: { ...emptyState.library, tags: {}, references: [] },
      catalog: [],
      ownerKey: emptyState.ownerKey,
      reviews: [],
    } satisfies OwnerBackupState;
    const digest = await ownerBackupDigest(emptyState, []);
    expect(digest).toMatchInlineSnapshot(`"70721b61739fb7a05b2ab47fbb66684dbc300eeb312d8192c6faa0ae9f30f283"`);
    expect(digest).toBe(await ownerBackupDigest(reordered, []));
    expect(await ownerBackupDigest({ ...emptyState, ownerKey: "b".repeat(64) }, [])).not.toBe(await ownerBackupDigest(emptyState, []));
    expect(await ownerBackupDigest(emptyState, [], legacyOwnerBackupSchemaVersion)).not.toBe(await ownerBackupDigest(emptyState, []));
    expect(maximumOwnerBackupBytes).toBe(10_485_760);

    const binary: BackupBinaryObject = {
      sourceKey: "workspace/paper.pdf",
      sourceEtag: "etag",
      size: 42,
      uploadedAt: timestamp,
      backupKey: "backups/blobs/object",
    };
    const binaryDigest = await ownerBackupDigest(emptyState, [binary]);
    for (const changed of [
      { ...binary, sourceKey: "workspace/other.pdf" },
      { ...binary, sourceEtag: "other-etag" },
      { ...binary, size: 43 },
      { ...binary, backupKey: "backups/blobs/other" },
    ]) {
      expect(await ownerBackupDigest(emptyState, [changed])).not.toBe(binaryDigest);
    }
    expect(await ownerBackupDigest(emptyState, [{ ...binary, uploadedAt: "2027-01-01T00:00:00.000Z" }])).toBe(binaryDigest);
  });

  it("derives opaque deterministic binary and chronological manifest keys", async () => {
    const first = await backupBlobKey(emptyState.ownerKey, "libraries/owner/paper.pdf", "etag-1", 42);
    expect(first).toMatch(new RegExp(`^backups/blobs/${emptyState.ownerKey}/[a-f0-9]{64}$`, "u"));
    expect(await backupBlobKey(emptyState.ownerKey, "libraries/owner/paper.pdf", "etag-1", 42)).toBe(first);
    expect(await backupBlobKey(emptyState.ownerKey, "libraries/owner/paper.pdf", "etag-2", 42)).not.toBe(first);
    expect(ownerBackupManifestKey(emptyState.ownerKey, "2026-07-13T17:20:30.456Z", "c".repeat(64))).toBe(
      `backups/manifests/${emptyState.ownerKey}/20260713172030456-${"c".repeat(64)}.json`,
    );
    expect(ownerBackupManifestKey(emptyState.ownerKey, "2026-07-13T17:20:30.456Z789", "c".repeat(64))).toBe(
      `backups/manifests/${emptyState.ownerKey}/20260713172030456-${"c".repeat(64)}.json`,
    );
  });

  it("collects each referenced library, web, and workspace object once in sorted order", () => {
    const state = {
      library: {
        artifacts: [{ objectKey: "libraries/owner/z.pdf" }],
        webSnapshots: [
          { rawObjectKey: "libraries/owner/a/raw", readableObjectKey: "libraries/owner/a/readable.txt" },
          { rawObjectKey: "libraries/owner/z.pdf", readableObjectKey: null },
        ],
      },
      workspaces: [
        {
          snapshot: {
            pdfs: [{ objectKey: "workspace/paper.pdf" }],
            assets: [{ objectKey: "workspace/assets/figure" }],
          },
        },
      ],
    } satisfies BackupBinaryReferences;
    expect(referencedBinaryKeys(state)).toEqual([
      "libraries/owner/a/raw",
      "libraries/owner/a/readable.txt",
      "libraries/owner/z.pdf",
      "workspace/assets/figure",
      "workspace/paper.pdf",
    ]);
  });

  it("accepts only authoritative owner and workspace object prefixes", () => {
    const ownerKey = emptyState.ownerKey;
    for (const key of [`libraries/${ownerKey}/paper.pdf`, "workspace-1/paper.pdf", "workspace-1/", `${ownerKey}:demo/paper.pdf`]) {
      expect(isOwnedBinaryKey(ownerKey, ["workspace-1", "demo"], key), key).toBe(true);
    }
    for (const key of ["", "/workspace-1/paper.pdf", "other/paper.pdf", "workspace-1/../secret", "workspace-1\\paper.pdf"]) {
      expect(isOwnedBinaryKey(ownerKey, ["workspace-1", "demo"], key), key).toBe(false);
    }
  });

  it("serializes manifests canonically with one trailing newline", async () => {
    const binary: BackupBinaryObject = {
      sourceKey: "workspace/paper.pdf",
      sourceEtag: "etag",
      size: 42,
      uploadedAt: "2026-07-13T00:00:00.000Z",
      backupKey: await backupBlobKey(emptyState.ownerKey, "workspace/paper.pdf", "etag", 42),
    };
    const manifest: OwnerBackupManifest = {
      schemaVersion: ownerBackupSchemaVersion,
      createdAt: "2026-07-13T00:00:00.000Z",
      digest: await ownerBackupDigest(emptyState, [binary]),
      state: emptyState,
      binaries: [binary],
      recovery: { catalog: null, library: null, workspaces: [] },
    };
    const serialized = ownerBackupManifestJson(manifest);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toEqual(manifest);
    expect(serialized).toContain('"binaries"');
    expect(parseOwnerBackupManifest(serialized)).toEqual(manifest);
    expect(() => parseOwnerBackupManifest("not json")).toThrow("Owner backup manifest is invalid");
    for (const invalidManifest of [
      { ...manifest, schemaVersion: "unknown" },
      { ...manifest, createdAt: 1 },
      { ...manifest, digest: "invalid" },
      { ...manifest, state: null },
      { ...manifest, state: { ...manifest.state, ownerKey: "invalid" } },
      { ...manifest, state: { ...manifest.state, catalog: null } },
      { ...manifest, state: { ...manifest.state, workspaces: null } },
      { ...manifest, state: { ...manifest.state, reviews: null } },
      { ...manifest, state: { ...manifest.state, library: null } },
      { ...manifest, binaries: null },
      { ...manifest, recovery: null },
    ]) {
      expect(() => parseOwnerBackupManifest(JSON.stringify(invalidManifest))).toThrow("Owner backup manifest is invalid");
    }
    for (const invalidBinary of [
      null,
      { ...binary, sourceKey: 1 },
      { ...binary, sourceEtag: 1 },
      { ...binary, size: "42" },
      { ...binary, size: -1 },
      { ...binary, size: 1.5 },
      { ...binary, uploadedAt: 1 },
      { ...binary, backupKey: 1 },
    ]) {
      expect(() => parseOwnerBackupManifest(JSON.stringify({ ...manifest, binaries: [invalidBinary] }))).toThrow(
        "Owner backup manifest is invalid",
      );
    }
    expect(() => parseOwnerBackupManifest(JSON.stringify({ ...manifest, binaries: [binary, { ...binary, sourceKey: 1 }] }))).toThrow(
      "Owner backup manifest is invalid",
    );
    expect(parseOwnerBackupManifest(JSON.stringify({ ...manifest, binaries: [{ ...binary, size: 0 }] })).binaries[0]?.size).toBe(0);
    const emptyPadding = JSON.stringify({ ...manifest, padding: "" });
    const exactLimit = JSON.stringify({
      ...manifest,
      padding: "x".repeat(maximumOwnerBackupBytes - new TextEncoder().encode(emptyPadding).byteLength),
    });
    expect(new TextEncoder().encode(exactLimit)).toHaveLength(maximumOwnerBackupBytes);
    expect(parseOwnerBackupManifest(exactLimit)).toMatchObject({ schemaVersion: ownerBackupSchemaVersion });
    expect(() => parseOwnerBackupManifest(`${exactLimit} `)).toThrow("Owner backup manifest exceeds 10 MiB");
  });

  it("keeps review authority behind an owner-scoped payload reference in v2 manifests", async () => {
    const reference: ReviewBackupReference = {
      schemaVersion: reviewBackupSchemaVersion,
      backupKey: `backups/reviews/${emptyState.ownerKey}/${"d".repeat(64)}.json`,
      byteCount: 12 * 1024 * 1024,
      payloadDigest: "d".repeat(64),
      authorityDigest: "e".repeat(64),
      reviewRevision: 8,
      protocolRevision: 3,
      historyFloorRevision: 1,
    };
    const projectAssociatedState = {
      ownerKey: emptyState.ownerKey,
      catalog: emptyState.catalog,
      library: emptyState.library,
      workspaces: emptyState.workspaces,
    };
    const manifest = {
      schemaVersion: projectAssociatedReviewOwnerBackupSchemaVersion,
      createdAt: "2026-07-19T00:00:00.000Z",
      digest: "f".repeat(64),
      state: {
        ...projectAssociatedState,
        catalog: [{ id: "workspace-1" }],
        workspaces: [
          {
            summary: { id: "workspace-1" },
            members: [],
            snapshot: {},
            revisionSeed: "project:4",
            reviewPayload: reference,
            reviewRevisionSeed: "review:8:protocol:3",
          },
        ],
      },
      binaries: [],
      recovery: { catalog: null, library: null, workspaces: [] },
    };
    const serialized = ownerBackupManifestJson(parseOwnerBackupManifest(JSON.stringify(manifest)));
    expect(serialized).toContain('"reviewPayload"');
    expect(serialized).not.toContain('"review":');
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(10 * 1024 * 1024);

    for (const invalidWorkspace of [
      { ...manifest.state.workspaces[0], review: { revision: 8 } },
      { ...manifest.state.workspaces[0], reviewPayload: null },
      { ...manifest.state.workspaces[0], reviewRevisionSeed: "review:7:protocol:3" },
      { ...manifest.state.workspaces[0], reviewRevisionSeed: "review:8:protocol:2" },
      {
        ...manifest.state.workspaces[0],
        reviewPayload: { ...reference, backupKey: `backups/reviews/${"b".repeat(64)}/${reference.payloadDigest}.json` },
      },
    ]) {
      expect(() =>
        parseOwnerBackupManifest(JSON.stringify({ ...manifest, state: { ...manifest.state, workspaces: [invalidWorkspace] } })),
      ).toThrow("Owner backup manifest is invalid");
    }
  });

  it("stores independently addressed review catalog, access, links, and payload state in v3 manifests", () => {
    const manifest = ownerManifest();
    const review = manifest.state.reviews[0]!;
    const reference = review.reviewPayload!;

    expect(parseOwnerBackupManifest(ownerBackupManifestJson(manifest))).toEqual(manifest);
    expect(ownerBackupManifestJson(manifest)).not.toContain('"review":');
    for (const invalidReview of [
      { ...review, catalogRecord: { ...review.catalogRecord, id: "invalid" } },
      { ...review, catalogRecord: { ...review.catalogRecord, locator: { ...review.catalogRecord.locator, reviewId: linkId } } },
      { ...review, access: { ...review.access, reviewId: linkId } },
      { ...review, access: { ...review.access, members: [] } },
      { ...review, reviewPayload: null, reviewRevisionSeed: "review:8:protocol:3" },
      { ...review, reviewRevisionSeed: "review:7:protocol:3" },
    ]) {
      expect(() =>
        parseOwnerBackupManifest(JSON.stringify({ ...manifest, state: { ...manifest.state, reviews: [invalidReview] } })),
      ).toThrow("Owner backup manifest is invalid");
    }
    expect(() =>
      parseOwnerBackupManifest(
        JSON.stringify({
          ...manifest,
          state: {
            ...manifest.state,
            workspaces: [{ summary: { id: "workspace-1" }, reviewPayload: reference, reviewRevisionSeed: "review:8:protocol:3" }],
          },
        }),
      ),
    ).toThrow("Owner backup manifest is invalid");
  });

  it("validates every independent review catalog field", () => {
    const manifest = ownerManifest();
    const review = manifest.state.reviews[0]!;
    const catalog = review.catalogRecord;
    const invalidCatalogRecords: unknown[] = [
      null,
      { ...catalog, locator: null },
      { ...catalog, id: 42 },
      { ...catalog, id: "invalid" },
      { ...catalog, title: 42 },
      { ...catalog, title: " padded" },
      { ...catalog, title: "" },
      { ...catalog, title: "x".repeat(121) },
      { ...catalog, profile: "unknown" },
      { ...catalog, href: "/review/wrong" },
      { ...catalog, role: "member" },
      { ...catalog, createdAt: 42 },
      { ...catalog, createdAt: "invalid" },
      { ...catalog, updatedAt: 42 },
      { ...catalog, updatedAt: "invalid" },
      { ...catalog, archivedAt: 42 },
      { ...catalog, archivedAt: "invalid" },
      { ...catalog, locator: { ...catalog.locator, reviewId: linkId } },
      { ...catalog, locator: { ...catalog.locator, storageKey: " invalid" } },
      { ...catalog, locator: { ...catalog.locator, legacyWorkspaceId: 42 } },
      { ...catalog, locator: { ...catalog.locator, legacyWorkspaceId: " invalid" } },
    ];
    for (const catalogRecord of invalidCatalogRecords) {
      expectInvalidManifest({ ...manifest, state: { ...manifest.state, reviews: [{ ...review, catalogRecord }] } });
    }

    const validBoundaryCatalog = {
      ...catalog,
      title: "x".repeat(120),
      archivedAt: timestamp,
      locator: { ...catalog.locator, legacyWorkspaceId: "workspace-1" },
    };
    expect(
      parseOwnerBackupManifest(
        JSON.stringify({ ...manifest, state: { ...manifest.state, reviews: [{ ...review, catalogRecord: validBoundaryCatalog }] } }),
      ),
    ).toMatchObject({ state: { reviews: [{ catalogRecord: validBoundaryCatalog }] } });
  });

  it("validates review members, lifecycle state, and uniqueness", () => {
    const manifest = ownerManifest();
    const review = manifest.state.reviews[0]!;
    const access = review.access;
    const member = access.members[0]!;
    const invalidAccessStates: unknown[] = [
      null,
      { ...access, reviewId: linkId },
      { ...access, legacySeededAt: 42 },
      { ...access, legacySeededAt: "invalid" },
      { ...access, deletedAt: 42 },
      { ...access, deletedAt: "invalid" },
      { ...access, members: null },
      { ...access, projectLinks: null },
    ];
    for (const invalidMember of [
      null,
      { ...member, id: 42 },
      { ...member, id: "invalid" },
      { ...member, email: 42 },
      { ...member, email: "Owner@example.test" },
      { ...member, email: " owner@example.test" },
      { ...member, email: `${"x".repeat(310)}@example.test` },
      { ...member, email: "owner.example.test" },
      { ...member, role: "reader" },
      { ...member, addedAt: 42 },
      { ...member, addedAt: "invalid" },
    ]) {
      invalidAccessStates.push({ ...access, members: [invalidMember] });
    }
    const secondMember = {
      ...member,
      id: "44444444-4444-4444-8444-444444444444",
      email: "second@example.test",
      role: "member" as const,
    };
    invalidAccessStates.push(
      { ...access, members: [{ ...member, role: "member" }] },
      { ...access, members: [member, { ...secondMember, id: member.id }] },
      { ...access, members: [member, { ...secondMember, email: member.email }] },
      { ...access, members: [member, { ...secondMember, role: "owner" }] },
      { ...access, deletedAt: timestamp },
    );
    for (const invalidAccess of invalidAccessStates) {
      expectInvalidManifest({ ...manifest, state: { ...manifest.state, reviews: [{ ...review, access: invalidAccess }] } });
    }

    const legacyMember = { ...member, id: "a".repeat(32) };
    const seededAccess = { ...access, legacySeededAt: timestamp, members: [legacyMember] };
    expect(
      parseOwnerBackupManifest(
        JSON.stringify({ ...manifest, state: { ...manifest.state, reviews: [{ ...review, access: seededAccess }] } }),
      ),
    ).toMatchObject({ state: { reviews: [{ access: seededAccess }] } });
  });

  it("validates active and unlinked review project links", () => {
    const manifest = ownerManifest();
    const review = manifest.state.reviews[0]!;
    const access = review.access;
    const link = access.projectLinks[0]!;
    const invalidLinks: unknown[] = [
      null,
      { ...link, id: 42 },
      { ...link, id: "invalid" },
      { ...link, reviewId: ownerId },
      { ...link, workspaceId: 42 },
      { ...link, workspaceId: " invalid" },
      { ...link, createdBy: 42 },
      { ...link, createdBy: "Owner@example.test" },
      { ...link, createdAt: 42 },
      { ...link, createdAt: "invalid" },
      { ...link, unlinkedAt: timestamp },
      { ...link, unlinkedBy: "owner@example.test" },
      { ...link, status: "unknown" },
      { ...link, status: "unlinked", unlinkedAt: null, unlinkedBy: null },
      { ...link, status: "unlinked", unlinkedAt: 42, unlinkedBy: "owner@example.test" },
      { ...link, status: "unlinked", unlinkedAt: "invalid", unlinkedBy: "owner@example.test" },
      { ...link, status: "unlinked", unlinkedAt: timestamp, unlinkedBy: 42 },
      { ...link, status: "unlinked", unlinkedAt: timestamp, unlinkedBy: "Owner@example.test" },
    ];
    for (const invalidLink of invalidLinks) {
      expectInvalidManifest({
        ...manifest,
        state: { ...manifest.state, reviews: [{ ...review, access: { ...access, projectLinks: [invalidLink] } }] },
      });
    }

    const secondLink = {
      ...link,
      id: "55555555-5555-4555-8555-555555555555",
      workspaceId: "workspace-2",
    };
    for (const projectLinks of [
      [link, { ...secondLink, id: link.id }],
      [link, { ...secondLink, workspaceId: link.workspaceId }],
    ]) {
      expectInvalidManifest({
        ...manifest,
        state: { ...manifest.state, reviews: [{ ...review, access: { ...access, projectLinks } }] },
      });
    }

    const unlinked = { ...link, status: "unlinked", unlinkedAt: timestamp, unlinkedBy: "owner@example.test" };
    const accessWithUnlinkedHistory = { ...access, projectLinks: [unlinked] };
    expect(
      parseOwnerBackupManifest(
        JSON.stringify({ ...manifest, state: { ...manifest.state, reviews: [{ ...review, access: accessWithUnlinkedHistory }] } }),
      ),
    ).toMatchObject({ state: { reviews: [{ access: accessWithUnlinkedHistory }] } });
  });

  it("requires unique owner review identities and matching payload revisions", () => {
    const manifest = ownerManifest();
    const review = manifest.state.reviews[0]!;
    const firstReview = {
      ...review,
      catalogRecord: {
        ...review.catalogRecord,
        locator: { ...review.catalogRecord.locator, legacyWorkspaceId: "workspace-1" },
      },
    };
    const secondId = "66666666-6666-4666-8666-666666666666";
    const secondReview = {
      ...review,
      catalogRecord: {
        ...review.catalogRecord,
        id: secondId,
        href: `/review/${secondId}`,
        locator: { reviewId: secondId, storageKey: `review:${secondId}`, legacyWorkspaceId: "workspace-2" },
      },
      access: {
        ...review.access,
        reviewId: secondId,
        members: [
          {
            ...review.access.members[0]!,
            id: "77777777-7777-4777-8777-777777777777",
            email: "second-owner@example.test",
          },
        ],
        projectLinks: [],
      },
    };
    expect(
      parseOwnerBackupManifest(JSON.stringify({ ...manifest, state: { ...manifest.state, reviews: [firstReview, secondReview] } })),
    ).toMatchObject({ state: { reviews: [{ catalogRecord: { id: reviewId } }, { catalogRecord: { id: secondId } }] } });

    for (const duplicate of [
      {
        ...secondReview,
        catalogRecord: {
          ...secondReview.catalogRecord,
          id: firstReview.catalogRecord.id,
          href: firstReview.catalogRecord.href,
          locator: { ...secondReview.catalogRecord.locator, reviewId: firstReview.catalogRecord.id },
        },
        access: { ...secondReview.access, reviewId: firstReview.catalogRecord.id },
      },
      {
        ...secondReview,
        catalogRecord: {
          ...secondReview.catalogRecord,
          locator: { ...secondReview.catalogRecord.locator, storageKey: firstReview.catalogRecord.locator.storageKey },
        },
      },
      {
        ...secondReview,
        catalogRecord: {
          ...secondReview.catalogRecord,
          locator: { ...secondReview.catalogRecord.locator, legacyWorkspaceId: "workspace-1" },
        },
      },
    ]) {
      expectInvalidManifest({ ...manifest, state: { ...manifest.state, reviews: [firstReview, duplicate] } });
    }

    for (const invalidReview of [
      { ...review, catalogRecord: { ...review.catalogRecord, role: "member" } },
      { ...review, access: { ...review.access, deletedAt: timestamp } },
      { ...review, reviewRevisionSeed: 42 },
      { ...review, reviewPayload: null, reviewRevisionSeed: "review:8:protocol:3" },
      { ...review, reviewPayload: reviewReference(), reviewRevisionSeed: null },
      { ...review, reviewRevisionSeed: "review:8:protocol:3:extra" },
      { ...review, reviewRevisionSeed: "prefix:review:8:protocol:3" },
      { ...review, reviewRevisionSeed: "review:0:protocol:3" },
      { ...review, reviewRevisionSeed: "review:8:protocol:0" },
    ]) {
      expectInvalidManifest({ ...manifest, state: { ...manifest.state, reviews: [invalidReview] } });
    }
    expect(
      parseOwnerBackupManifest(
        JSON.stringify({
          ...manifest,
          state: { ...manifest.state, reviews: [{ ...review, reviewPayload: null, reviewRevisionSeed: null }] },
        }),
      ),
    ).toMatchObject({ state: { reviews: [{ reviewPayload: null, reviewRevisionSeed: null }] } });
  });

  it("parses immutable v1 manifests and verifies them with their original digest schema", async () => {
    const legacyState = {
      ownerKey: emptyState.ownerKey,
      catalog: emptyState.catalog,
      library: emptyState.library,
      workspaces: [],
    };
    const legacyManifest: LegacyOwnerBackupManifest = {
      schemaVersion: legacyOwnerBackupSchemaVersion,
      createdAt: "2026-07-17T00:00:00.000Z",
      digest: await ownerBackupDigest(legacyState, [], legacyOwnerBackupSchemaVersion),
      state: legacyState,
      binaries: [],
      recovery: { catalog: null, library: null, workspaces: [] },
    };
    expect(parseOwnerBackupManifest(ownerBackupManifestJson(legacyManifest))).toEqual(legacyManifest);
    expect(await ownerBackupDigest(legacyManifest.state, legacyManifest.binaries, legacyManifest.schemaVersion)).toBe(
      legacyManifest.digest,
    );
    expect(await ownerBackupDigest(legacyManifest.state, legacyManifest.binaries)).not.toBe(legacyManifest.digest);

    const legacyWithEmbeddedReview = {
      ...legacyManifest,
      state: {
        ...legacyManifest.state,
        catalog: [{ id: "workspace-1" }],
        workspaces: [
          {
            summary: { id: "workspace-1" },
            members: [],
            snapshot: {},
            revisionSeed: "project:4",
            review: { revision: 8, protocol: { revision: 8 } },
            reviewRevisionSeed: "review:8:protocol:3",
          },
        ],
      },
    };
    expect(parseOwnerBackupManifest(JSON.stringify(legacyWithEmbeddedReview))).toMatchObject({
      schemaVersion: legacyOwnerBackupSchemaVersion,
      state: { workspaces: [{ review: { revision: 8 } }] },
    });
  });
});
