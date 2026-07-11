import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { type PublicationEnrichment, type WorkspaceSnapshot } from "../domain/workspace";
import { DocumentRoom } from "./document-room";

interface WorkspaceStateRow extends Record<string, SqlStorageValue> {
  y_state: ArrayBuffer;
}

interface MigrationLedgerRow extends Record<string, SqlStorageValue> {
  name: string;
  version: number;
}

interface TableColumnRow extends Record<string, SqlStorageValue> {
  name: string;
}

const acceptedMetadata = {
  title: "Accepted metadata title",
  authors: ["Lovelace, Ada", "Hopper, Grace"],
  year: "2025",
  venue: "Journal of Durable Knowledge",
  doi: "10.5555/KIRJOLAB.1",
  url: "https://example.test/accepted",
  abstract: "Metadata accepted from the explicit enrichment flow.",
} satisfies PublicationEnrichment;

describe("DocumentRoom in the Workers runtime", () => {
  it("upgrades legacy offset links once and marks mismatches stale", async () => {
    const workspaceId = "legacy-anchor-migration";
    const stub = roomStub(workspaceId);
    const initial = await stub.getSnapshot(workspaceId);
    const matchingExcerpt = "Kirjolab keeps the path from an annotation to a claim";
    const matchingStart = initial.source.indexOf(matchingExcerpt);
    expect(matchingStart).toBeGreaterThanOrEqual(0);

    await runInDurableObject(stub, (_instance: DocumentRoom, state) => {
      state.storage.transactionSync(() => {
        state.storage.sql.exec(
          `INSERT INTO pdfs (id, name, content_type, size, object_key, fingerprint, created_at)
           VALUES ('legacy-pdf', 'legacy.pdf', 'application/pdf', 42, 'legacy/object', 'legacy-fingerprint',
                   '2025-01-01T00:00:00.000Z')`,
        );
        state.storage.sql.exec(
          `INSERT INTO annotations
           (id, pdf_id, page, quote, prefix, suffix, comment, rects_json, created_at)
           VALUES ('legacy-annotation', 'legacy-pdf', 1, 'legacy quote', '', '', '', '[]',
                   '2025-01-01T00:00:00.000Z')`,
        );
        state.storage.sql.exec(
          `INSERT INTO claims (id, text, note, created_at, updated_at)
           VALUES ('legacy-claim', 'Legacy claim', '', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z')`,
        );

        state.storage.sql.exec("DROP TABLE passage_links");
        state.storage.sql.exec("DROP TABLE claim_passage_links");
        state.storage.sql.exec(`
          CREATE TABLE passage_links (
            id TEXT PRIMARY KEY,
            annotation_id TEXT NOT NULL REFERENCES annotations(id),
            start_offset INTEGER NOT NULL,
            end_offset INTEGER NOT NULL,
            excerpt TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE TABLE claim_passage_links (
            id TEXT PRIMARY KEY,
            claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
            start_offset INTEGER NOT NULL,
            end_offset INTEGER NOT NULL,
            excerpt TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
        `);
        state.storage.sql.exec(
          `INSERT INTO passage_links
           (id, annotation_id, start_offset, end_offset, excerpt, created_at)
           VALUES ('matching-link', 'legacy-annotation', ?, ?, ?, '2025-01-01T00:00:00.000Z')`,
          matchingStart,
          matchingStart + matchingExcerpt.length,
          matchingExcerpt,
        );
        state.storage.sql.exec(
          `INSERT INTO claim_passage_links
           (id, claim_id, start_offset, end_offset, excerpt, created_at)
           VALUES ('mismatching-link', 'legacy-claim', 0, 8, 'not here', '2025-01-01T00:00:00.000Z')`,
        );
        state.storage.sql.exec("DELETE FROM _kirjolab_migrations WHERE version >= 4");
      });
    });

    await evictDurableObject(stub);
    const migrated = await stub.getSnapshot(workspaceId);
    expect(migrated.links).toHaveLength(1);
    expect(migrated.links[0]).toMatchObject({
      id: "matching-link",
      anchor: {
        version: 1,
        exact: matchingExcerpt,
        originalRange: { start: matchingStart, end: matchingStart + matchingExcerpt.length },
        anchoredRevision: initial.revision,
      },
      resolution: {
        status: "resolved",
        start: matchingStart,
        end: matchingStart + matchingExcerpt.length,
        text: matchingExcerpt,
        exactMatch: true,
      },
    });
    expect(migrated.links[0]?.anchor.relativeStart).not.toBeNull();
    expect(migrated.links[0]?.anchor.relativeEnd).not.toBeNull();

    expect(migrated.claimLinks).toHaveLength(1);
    expect(migrated.claimLinks[0]).toMatchObject({
      id: "mismatching-link",
      anchor: {
        version: 1,
        relativeStart: null,
        relativeEnd: null,
        exact: "not here",
        originalRange: { start: 0, end: 8 },
        anchoredRevision: initial.revision,
      },
      resolution: { status: "stale" },
    });

    const firstMigrationState = await inspectAnchorMigrationState(stub);
    expect(firstMigrationState.versions).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(firstMigrationState.passageColumns).toEqual(expect.arrayContaining(anchorColumnNames));
    expect(firstMigrationState.claimColumns).toEqual(expect.arrayContaining(anchorColumnNames));

    await evictDurableObject(stub);
    const reloaded = await stub.getSnapshot(workspaceId);
    expect(reloaded.links).toEqual(migrated.links);
    expect(reloaded.claimLinks).toEqual(migrated.claimLinks);
    expect(await inspectAnchorMigrationState(stub)).toEqual(firstMigrationState);
  });

  it("projects the default canonical bibliography on first activation", async () => {
    const snapshot = await roomStub("default-bibliography").getSnapshot("default-bibliography");

    expect(snapshot.publications).toEqual([
      expect.objectContaining({
        citationKey: "merton1942",
        type: "article",
        title: "The Normative Structure of Science",
        authors: ["Merton, Robert K."],
        year: "1942",
        venue: "The Sociology of Science",
        doi: "",
        metadataSource: "bibtex",
      }),
    ]);
  });

  it("adds the publication-PDF link table when migration v7 is pending", async () => {
    const workspaceId = "publication-pdf-link-migration";
    const stub = roomStub(workspaceId);
    await stub.getSnapshot(workspaceId);

    await runInDurableObject(stub, (_instance: DocumentRoom, state) => {
      state.storage.transactionSync(() => {
        state.storage.sql.exec("DROP TABLE publication_pdf_links");
        state.storage.sql.exec("DELETE FROM _kirjolab_migrations WHERE version = 7");
      });
    });

    await evictDurableObject(stub);
    expect((await stub.getSnapshot(workspaceId)).publicationPdfLinks).toEqual([]);
    expect(await migrationVersion(stub, 7)).toEqual({ version: 7, name: "add-publication-pdf-links" });
    expect(await runInDurableObject(stub, (_instance: DocumentRoom, state) => tableColumns(state, "publication_pdf_links"))).toEqual([
      "id",
      "publication_id",
      "pdf_id",
      "created_at",
    ]);
  });

  it("persists explicit many-to-many publication-PDF links and unlinks only the association", async () => {
    const workspaceId = "publication-pdf-links";
    const stub = roomStub(workspaceId);
    const imported = await stub.importBibliography(
      workspaceId,
      `@article{second2026,
        title = {A second publication},
        author = {Hopper, Grace},
        year = {2026}
      }`,
    );
    const firstPublication = publicationByKey(imported, "merton1942");
    const secondPublication = publicationByKey(imported, "second2026");
    const firstPdf = pdfResource("first-paper.pdf");
    const secondPdf = pdfResource("supplement.pdf");
    await stub.registerPdf(firstPdf);
    await stub.registerPdf(secondPdf);

    await runInDurableObject(stub, (instance: DocumentRoom) => {
      expect(() => instance.createPublicationPdfLink({ publicationId: crypto.randomUUID(), pdfId: firstPdf.id })).toThrow(
        "Publication not found",
      );
      expect(() => instance.createPublicationPdfLink({ publicationId: firstPublication.id, pdfId: crypto.randomUUID() })).toThrow(
        "PDF not found",
      );
    });

    const primaryLink = await stub.createPublicationPdfLink({ publicationId: firstPublication.id, pdfId: firstPdf.id });
    const supplementLink = await stub.createPublicationPdfLink({ publicationId: firstPublication.id, pdfId: secondPdf.id });
    const sharedArtifactLink = await stub.createPublicationPdfLink({ publicationId: secondPublication.id, pdfId: firstPdf.id });
    await runInDurableObject(stub, (instance: DocumentRoom) => {
      expect(() => instance.createPublicationPdfLink({ publicationId: firstPublication.id, pdfId: firstPdf.id })).toThrow(
        "Publication/PDF link already exists",
      );
    });

    const annotation = await stub.createAnnotation({
      pdfId: firstPdf.id,
      page: 1,
      quote: "Durable evidence",
      prefix: "",
      suffix: "",
      comment: "Preserve this annotation",
      rects: [],
    });
    await evictDurableObject(stub);
    const persisted = await stub.getSnapshot(workspaceId);
    expect(persisted.publicationPdfLinks).toEqual(expect.arrayContaining([primaryLink, supplementLink, sharedArtifactLink]));

    await stub.deletePublicationPdfLink(primaryLink.id);
    const unlinked = await stub.getSnapshot(workspaceId);
    expect(unlinked.publicationPdfLinks).toEqual(expect.arrayContaining([supplementLink, sharedArtifactLink]));
    expect(unlinked.publicationPdfLinks).not.toContainEqual(primaryLink);
    expect(unlinked.publications).toEqual(expect.arrayContaining([firstPublication, secondPublication]));
    expect(unlinked.pdfs).toEqual(expect.arrayContaining([firstPdf, secondPdf]));
    expect(unlinked.annotations).toContainEqual(annotation);
    await runInDurableObject(stub, (instance: DocumentRoom) => {
      expect(() => instance.deletePublicationPdfLink(primaryLink.id)).toThrow("Publication/PDF link not found");
    });
  });

  it("projects a persisted canonical bibliography when migration v6 is pending", async () => {
    const workspaceId = "persisted-bibliography-migration";
    const stub = roomStub(workspaceId);
    const customBibliography = `@article{durable2026,
      title = {Durable canonical bibliography},
      author = {Hopper, Grace},
      year = {2026},
      journal = {Persistent Knowledge},
      doi = {https://doi.org/10.5555/DURABLE.2026}
    }
`;
    await stub.getSnapshot(workspaceId);

    await runInDurableObject(stub, (_instance: DocumentRoom, state) => {
      const row = state.storage.sql.exec<WorkspaceStateRow>("SELECT y_state FROM workspace WHERE id = 1").one();
      const document = new Y.Doc();
      Y.applyUpdate(document, new Uint8Array(row.y_state), "test-bootstrap");
      const bibliography = document.getText("bibliography");
      document.transact(() => {
        if (bibliography.length > 0) bibliography.delete(0, bibliography.length);
        bibliography.insert(0, customBibliography);
      }, "pre-v6-state");
      const persistedState = copyArrayBuffer(Y.encodeStateAsUpdate(document));

      state.storage.transactionSync(() => {
        state.storage.sql.exec("UPDATE workspace SET y_state = ?, bibliography = ? WHERE id = 1", persistedState, customBibliography);
        state.storage.sql.exec("DELETE FROM publications");
        state.storage.sql.exec("DELETE FROM _kirjolab_migrations WHERE version >= 6");
      });
      document.destroy();
    });

    await evictDurableObject(stub);
    const migrated = await stub.getSnapshot(workspaceId);
    expect(migrated.bibliography).toBe(customBibliography);
    expect(migrated.publications).toEqual([
      expect.objectContaining({
        citationKey: "durable2026",
        type: "article",
        title: "Durable canonical bibliography",
        authors: ["Hopper, Grace"],
        year: "2026",
        venue: "Persistent Knowledge",
        doi: "10.5555/durable.2026",
        metadataSource: "bibtex",
      }),
    ]);
    const firstLedger = await migrationVersion(stub, 6);
    expect(firstLedger).toEqual({ version: 6, name: "project-canonical-bibliography" });

    await evictDurableObject(stub);
    expect(await stub.getSnapshot(workspaceId)).toEqual(migrated);
    expect(await migrationVersion(stub, 6)).toEqual(firstLedger);
  });

  it("rolls the document and projection back atomically when publication storage fails", async () => {
    const workspaceId = "projection-rollback";
    const stub = roomStub(workspaceId);
    const accepted = await stub.getSnapshot(workspaceId);

    await runInDurableObject(stub, (_instance: DocumentRoom, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER reject_blocked_publication
        BEFORE INSERT ON publications
        WHEN NEW.citation_key = 'blocked2026'
        BEGIN
          SELECT RAISE(ABORT, 'blocked publication projection');
        END;
      `);
    });

    await applyAuthoredBibliography(
      stub,
      `${accepted.bibliography}
      @article{blocked2026,
        title = {This projection must roll back},
        author = {Rollback, Atomic},
        year = {2026}
      }`,
    );

    expect(await stub.getSnapshot(workspaceId)).toEqual(accepted);
    await evictDurableObject(stub);
    expect(await stub.getSnapshot(workspaceId)).toEqual(accepted);
  });

  it("keeps publication identity and preserves an exact Crossref no-op until an authored edit", async () => {
    const workspaceId = "publication-provenance";
    const stub = roomStub(workspaceId);
    const imported = await stub.importBibliography(
      workspaceId,
      `@article{lovelace2025,
        title = {Initial authored title},
        author = {Lovelace, Ada},
        year = {2024},
        journal = {Notes},
        doi = {10.5555/kirjolab.1}
      }`,
    );
    const original = publicationByKey(imported, "lovelace2025");

    const enriched = publicationByKey(await stub.enrichPublication(workspaceId, original.id, acceptedMetadata), "lovelace2025");
    expect(enriched.id).toBe(original.id);
    expect(enriched.metadataSource).toBe("crossref");
    expect(Date.parse(enriched.updatedAt)).toBeGreaterThan(Date.parse(original.updatedAt));

    const exactNoOp = publicationByKey(await stub.enrichPublication(workspaceId, original.id, acceptedMetadata), "lovelace2025");
    expect(exactNoOp).toEqual(enriched);

    await applyAuthoredBibliography(
      stub,
      `@article{lovelace2025,
        title = {Author corrected title},
        author = {Lovelace, Ada and Hopper, Grace},
        year = {2025},
        journal = {Journal of Durable Knowledge},
        doi = {10.5555/kirjolab.1},
        url = {https://example.test/accepted},
        abstract = {Metadata accepted from the explicit enrichment flow.}
      }`,
    );
    const authored = publicationByKey(await stub.getSnapshot(workspaceId), "lovelace2025");
    expect(authored.id).toBe(original.id);
    expect(authored.title).toBe("Author corrected title");
    expect(authored.metadataSource).toBe("bibtex");
    expect(Date.parse(authored.updatedAt)).toBeGreaterThan(Date.parse(exactNoOp.updatedAt));
  });

  it("does not retain Crossref provenance when a later duplicate DOI projection overwrites it", async () => {
    const workspaceId = "duplicate-doi-provenance";
    const stub = roomStub(workspaceId);
    await stub.getSnapshot(workspaceId);
    await applyAuthoredBibliography(
      stub,
      `@article{accepted2025,
        title = {First authored value},
        author = {Lovelace, Ada},
        year = {2024},
        journal = {Notes},
        doi = {10.5555/kirjolab.1}
      }

      @article{Accepted2025,
        title = {Later authored duplicate},
        author = {Turing, Alan},
        year = {2026},
        journal = {Authored Proceedings},
        doi = {10.5555/kirjolab.1}
      }`,
    );

    const beforeEnrichment = publicationByKey(await stub.getSnapshot(workspaceId), "Accepted2025");
    expect(beforeEnrichment.metadataSource).toBe("bibtex");

    const snapshot = await stub.enrichPublication(workspaceId, beforeEnrichment.id, acceptedMetadata);
    const duplicateDoiPublications = snapshot.publications.filter((publication) => publication.doi === "10.5555/kirjolab.1");
    expect(duplicateDoiPublications).toEqual([
      expect.objectContaining({
        id: beforeEnrichment.id,
        citationKey: "Accepted2025",
        title: "Later authored duplicate",
        metadataSource: "bibtex",
      }),
    ]);
    expect(snapshot.bibliography).toContain("@article{accepted2025,");
    expect(snapshot.bibliography).toContain("title = {Accepted metadata title}");
    expect(snapshot.bibliography).toContain("@article{Accepted2025,");
    expect(Date.parse(duplicateDoiPublications[0]?.updatedAt ?? "")).toBeGreaterThan(Date.parse(beforeEnrichment.updatedAt));
  });
});

const anchorColumnNames = ["anchor_version", "relative_start", "relative_end", "quote_prefix", "quote_suffix", "anchored_revision"];

function roomStub(name: string): DurableObjectStub<DocumentRoom> {
  return env.DOCUMENT_ROOMS.getByName(`${name}-${crypto.randomUUID()}`);
}

function migrationRows(state: DurableObjectState): MigrationLedgerRow[] {
  return state.storage.sql.exec<MigrationLedgerRow>("SELECT version, name FROM _kirjolab_migrations ORDER BY version ASC").toArray();
}

async function migrationVersion(stub: DurableObjectStub<DocumentRoom>, version: number): Promise<MigrationLedgerRow | undefined> {
  return await runInDurableObject(stub, (_instance: DocumentRoom, state) => migrationRows(state).find((row) => row.version === version));
}

async function inspectAnchorMigrationState(stub: DurableObjectStub<DocumentRoom>): Promise<{
  versions: number[];
  passageColumns: string[];
  claimColumns: string[];
}> {
  return await runInDurableObject(stub, (_instance: DocumentRoom, state) => ({
    versions: migrationRows(state)
      .filter((row) => row.version <= 7)
      .map((row) => row.version),
    passageColumns: tableColumns(state, "passage_links"),
    claimColumns: tableColumns(state, "claim_passage_links"),
  }));
}

function tableColumns(state: DurableObjectState, table: "passage_links" | "claim_passage_links" | "publication_pdf_links"): string[] {
  return state.storage.sql
    .exec<TableColumnRow>(`PRAGMA table_info(${table})`)
    .toArray()
    .map((row) => row.name);
}

function pdfResource(name: string): WorkspaceSnapshot["pdfs"][number] {
  const id = crypto.randomUUID();
  return {
    id,
    name,
    contentType: "application/pdf",
    size: 42,
    objectKey: `publication-pdf-links/${id}.pdf`,
    fingerprint: `test:${id}`,
    createdAt: new Date().toISOString(),
  };
}

function publicationByKey(snapshot: WorkspaceSnapshot, citationKey: string): WorkspaceSnapshot["publications"][number] {
  const publication = snapshot.publications.find((candidate) => candidate.citationKey === citationKey);
  if (!publication) throw new Error(`Expected publication ${citationKey}`);
  return publication;
}

async function applyAuthoredBibliography(stub: DurableObjectStub<DocumentRoom>, nextBibliography: string): Promise<void> {
  await runInDurableObject(stub, (instance: DocumentRoom, state) => {
    const row = state.storage.sql.exec<WorkspaceStateRow>("SELECT y_state FROM workspace WHERE id = 1").one();
    const document = new Y.Doc();
    Y.applyUpdate(document, new Uint8Array(row.y_state), "test-bootstrap");
    const stateVector = Y.encodeStateVector(document);
    const bibliography = document.getText("bibliography");
    document.transact(() => {
      if (bibliography.length > 0) bibliography.delete(0, bibliography.length);
      bibliography.insert(0, nextBibliography);
    }, "authored-test-edit");
    const update = copyArrayBuffer(Y.encodeStateAsUpdate(document, stateVector));

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    state.acceptWebSocket(server);
    client.accept();
    instance.webSocketMessage(server, update);
    if (server.readyState === WebSocket.OPEN) server.close(1000, "test edit complete");
    if (client.readyState === WebSocket.OPEN) client.close(1000, "test edit complete");
    document.destroy();
  });
}

function copyArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}
