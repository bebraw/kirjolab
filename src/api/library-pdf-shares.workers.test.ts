import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName } from "pdf-lib";
import { handleLibraryPdfSharesApi, handlePublicPdfShareRequest } from "./library-pdf-shares";
import type { AuthIdentity } from "../security/auth";
import type { LibraryPdfShare } from "../domain/library-pdf-share";
import { handleRequest } from "../worker";

describe("annotated PDF links in the Workers runtime", () => {
  it("keeps the public bearer route outside Access authentication and management behind authentication and origin checks", async () => {
    const fixture = await createFixture();
    const created = await handleLibraryPdfSharesApi(fixture.request("POST"), env, fixture.identity);
    const { share } = await created.json<{ share: LibraryPdfShare }>();
    const accessEnv = new Proxy(env, {
      get(target, property) {
        if (property === "AUTH_MODE") return "access";
        if (property === "ACCESS_TEAM_DOMAIN") return "https://kirjolab-test.cloudflareaccess.com";
        if (property === "ACCESS_AUD") return "pdf-sharing-test-audience";
        return Reflect.get(target, property);
      },
    });

    const publicPage = await handleRequest(new Request(`https://example.test${share.href}`), accessEnv);
    expect(publicPage.status).toBe(200);
    expect(await publicPage.text()).toContain("paper-annotated.pdf");
    const publicPdf = await handleRequest(new Request(`https://example.test${share.href}/document.pdf`), accessEnv);
    expect(publicPdf.status).toBe(200);
    expect(publicPdf.headers.get("content-type")).toBe("application/pdf");

    for (const method of ["GET", "POST", "DELETE"]) {
      const management = await handleRequest(fixture.request(method, method === "DELETE" ? `/${share.id}` : ""), accessEnv);
      expect(management.status).toBe(401);
      expect(await management.json()).toEqual({ error: "Cloudflare Access token is required" });
    }
    const deniedMutation = await handleRequest(
      new Request(`http://127.0.0.1/api/library/pdfs/${fixture.artifactId}/shares`, {
        method: "POST",
        headers: { origin: "https://other.example" },
      }),
      env,
    );
    expect(deniedMutation.status).toBe(403);
    expect(await deniedMutation.json()).toEqual({ error: "Cross-origin mutation denied" });

    for (const method of ["POST", "DELETE", "PUT"]) {
      const mutation = await handleRequest(new Request(`https://example.test${share.href}/document.pdf`, { method }), accessEnv);
      expect(mutation.status).toBe(405);
    }
  });

  it("pins private annotations, recovers the link only for its owner, and revokes public access", async () => {
    const fixture = await createFixture();
    await fixture.library.createPdfNote(fixture.referenceId, fixture.artifactId, 1, 0.2, 0.3, "Review this claim.");
    const created = await handleLibraryPdfSharesApi(fixture.request("POST"), env, fixture.identity);
    expect(created.status).toBe(201);
    const { share } = await created.json<{ share: LibraryPdfShare }>();
    expect(share.href).toMatch(/^\/share\/pdf\/[A-Za-z0-9_-]{43}$/u);
    expect(await (await handleLibraryPdfSharesApi(fixture.request("GET"), env, fixture.identity)).json()).toEqual({ shares: [share] });
    const otherOwner = { ...fixture.identity, ownerKey: `other-${crypto.randomUUID()}` };
    expect((await handleLibraryPdfSharesApi(fixture.request("GET"), env, otherOwner)).status).toBe(404);
    expect((await handleLibraryPdfSharesApi(fixture.request("DELETE", `/${share.id}`), env, otherOwner)).status).toBe(404);

    const publicRequest = new Request(`https://example.test${share.href}/document.pdf`);
    const first = await handlePublicPdfShareRequest(publicRequest, env);
    expect(first?.status).toBe(200);
    const firstBytes = await first!.arrayBuffer();
    const parsed = await PDFDocument.load(firstBytes);
    const annotations = parsed.getPages()[0]!.node.lookup(PDFName.of("Annots"), PDFArray);
    const note = annotations.lookup(0, PDFDict);
    expect(note.lookup(PDFName.of("Contents"), PDFHexString).decodeText()).toBe("Review this claim.");
    await fixture.library.createPdfNote(fixture.referenceId, fixture.artifactId, 1, 0.4, 0.5, "Later private note.");
    expect(await (await handlePublicPdfShareRequest(publicRequest, env))!.arrayBuffer()).toEqual(firstBytes);
    const html = await handlePublicPdfShareRequest(new Request(`https://example.test${share.href}`), env);
    expect(html?.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(await html?.text()).not.toContain(fixture.identity.ownerKey);
    const download = await handlePublicPdfShareRequest(new Request(`${publicRequest.url}?download=1`), env);
    expect(download?.headers.get("content-disposition")).toBe('attachment; filename="paper-annotated.pdf"');
    expect(download?.headers.get("cache-control")).toBe("private, no-store");
    const head = await handlePublicPdfShareRequest(new Request(publicRequest.url, { method: "HEAD" }), env);
    expect(head?.status).toBe(200);
    expect(await head?.text()).toBe("");
    const range = await handlePublicPdfShareRequest(new Request(publicRequest.url, { headers: { range: "bytes=0-4" } }), env);
    expect(range?.status).toBe(206);
    expect(new TextDecoder().decode(await range!.arrayBuffer())).toBe("%PDF-");

    const serialized = JSON.stringify(await fixture.library.getSnapshot(true));
    expect(serialized).not.toContain(share.href.slice("/share/pdf/".length));
    expect(serialized).not.toContain("pdf-shares/");
    expect((await handleLibraryPdfSharesApi(fixture.request("DELETE", `/${share.id}`), env, fixture.identity)).status).toBe(204);
    expect((await handlePublicPdfShareRequest(publicRequest, env))?.status).toBe(404);
    expect(await (await handleLibraryPdfSharesApi(fixture.request("GET"), env, fixture.identity)).json()).toEqual({ shares: [] });
  });

  it("keeps older annotations on this PDF when other PDFs exceed the Library snapshot limit", async () => {
    const fixture = await createFixture();
    const oldNote = await fixture.library.createPdfNote(fixture.referenceId, fixture.artifactId, 1, 0.2, 0.3, "Keep this older note.");
    const original = await fixture.library.getPdfArtifact(fixture.artifactId);
    const secondArtifactId = crypto.randomUUID();
    await fixture.library.registerPdf({
      ...original!.artifact,
      id: secondArtifactId,
      referenceId: null,
      objectKey: `other/${secondArtifactId}.pdf`,
    });
    await fixture.library.identifyPdf(secondArtifactId, fixture.referenceId);
    await runInDurableObject(fixture.library, (_instance, state) => {
      state.storage.sql.exec(
        `WITH RECURSIVE numbers(value) AS (VALUES(1) UNION ALL SELECT value + 1 FROM numbers WHERE value < 10001)
        INSERT INTO pdf_markups (id, reference_id, artifact_id, page, kind, x, y, body, color, width, points_json, created_at, updated_at)
        SELECT printf('other-note-%d', value), ?, ?, 1, 'note', 0.2, 0.3, 'Another PDF note', '', NULL, '[]', '2099-01-01', '2099-01-01' FROM numbers`,
        fixture.referenceId,
        secondArtifactId,
      );
    });
    const source = await fixture.library.getPdfShareSource(fixture.artifactId);
    expect(source).toMatchObject({ status: "ok", markups: [oldNote], highlights: [] });
    const tooMany = await fixture.library.getPdfShareSource(secondArtifactId);
    expect(tooMany).toEqual({ status: "limit" });
  });

  it("invalidates a share when its owner permanently deletes the reference", async () => {
    const fixture = await createFixture();
    const created = await handleLibraryPdfSharesApi(fixture.request("POST"), env, fixture.identity);
    const { share } = await created.json<{ share: LibraryPdfShare }>();
    await fixture.library.permanentlyDeleteReference(fixture.referenceId, []);
    const response = await handlePublicPdfShareRequest(new Request(`https://example.test${share.href}/document.pdf`), env);
    expect(response?.status).toBe(404);
    expect(await fixture.library.getPdfShareSource(fixture.artifactId)).toEqual({ status: "missing" });
  });

  it("enforces the active-link limit at the authoritative registration boundary", async () => {
    const fixture = await createFixture();
    for (let index = 0; index < 20; index += 1) {
      const result = await fixture.library.registerPdfShare({
        id: crypto.randomUUID(),
        artifactId: fixture.artifactId,
        token: `${"a".repeat(41)}${String(index).padStart(2, "0")}`,
        digest: index.toString(16).padStart(64, "0"),
        name: "paper.pdf",
        createdAt: new Date().toISOString(),
      });
      expect(result.status).toBe("created");
    }
    expect((await handleLibraryPdfSharesApi(fixture.request("POST"), env, fixture.identity)).status).toBe(409);
    expect(
      await fixture.library.registerPdfShare({
        id: crypto.randomUUID(),
        artifactId: fixture.artifactId,
        token: "b".repeat(43),
        digest: "f".repeat(64),
        name: "paper.pdf",
        createdAt: new Date().toISOString(),
      }),
    ).toEqual({ status: "limit" });
  });
});

async function createFixture() {
  const ownerKey = `pdf-share-test-${crypto.randomUUID()}`;
  const identity: AuthIdentity = { subject: "owner", email: "owner@example.test", ownerKey, mode: "local" };
  const library = env.REFERENCE_LIBRARIES.getByName(ownerKey);
  const source = await PDFDocument.create();
  source.addPage([600, 800]);
  const bytes = await source.save({ useObjectStreams: false });
  const artifactId = crypto.randomUUID();
  const objectKey = `libraries/${ownerKey}/${artifactId}.pdf`;
  await env.PAPERS.put(objectKey, bytes, { httpMetadata: { contentType: "application/pdf" } });
  const draft = await library.createPdfDraft(
    {
      id: artifactId,
      referenceId: null,
      name: "paper.pdf",
      contentType: "application/pdf",
      size: bytes.byteLength,
      objectKey,
      fingerprint: `sha256:${crypto.randomUUID()}`,
      rights: "private",
      createdAt: new Date().toISOString(),
    },
    identity.email,
  );
  return {
    library,
    identity,
    artifactId,
    referenceId: draft.reference.id,
    request: (method: string, suffix = "") =>
      new Request(`https://example.test/api/library/pdfs/${artifactId}/shares${suffix}`, { method }),
  };
}
