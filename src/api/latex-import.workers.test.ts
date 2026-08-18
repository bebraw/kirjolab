import { env } from "cloudflare:workers";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { latexArchiveMaximumCompressedBytes } from "../domain/manuscript/latex-import";
import type { AuthIdentity } from "../security/auth";
import { handleLatexImportApi } from "./latex-import";

const identity = {
  subject: "local:latex-import",
  email: "local@kirjolab.invalid",
  ownerKey: "latex-import-test",
  mode: "local",
} satisfies AuthIdentity;

describe("LaTeX import API in the Workers runtime", () => {
  it("previews without mutation and creates only the reviewed archive", async () => {
    const catalog = env.WORKSPACE_CATALOGS.getByName(identity.ownerKey);
    const workspacesBeforePreview = await catalog.listWorkspaces();
    const archive = zipSync({
      "main.tex": strToU8(
        String.raw`\documentclass{article}\graphicspath{{./images/}}\begin{document}\input{section}\bibliography{refs}\end{document}`,
      ),
      "section.tex": strToU8(String.raw`\section{Result}\label{sec:result}Evidence \cite{source}.\includegraphics{result}`),
      "refs.bib": strToU8("@article{source, title={Source}}"),
      "images/result.png": new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    const previewResponse = await handleLatexImportApi(zipRequest("http://example.com/api/latex-import-previews", archive), env, identity);

    expect(previewResponse.status).toBe(200);
    const preview = await responseRecord(previewResponse);
    expect(preview.archiveSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(preview.previewDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(preview).not.toHaveProperty("digest");
    expect(preview.conversion).toMatchObject({
      seed: { entryPath: "main.md", files: [{ path: "main.md" }, { path: "section.md" }] },
      assets: [{ path: "figures/result.png", mediaType: "image/png", bytes: 8 }],
      report: { rootPath: "main.tex", bibliographyPath: "refs.bib" },
    });
    expect(await catalog.listWorkspaces()).toEqual(workspacesBeforePreview);

    const query = new URLSearchParams({
      title: "Imported paper",
      archiveSha256: String(preview.archiveSha256),
      previewDigest: String(preview.previewDigest),
      root: "main.tex",
      bibliography: "refs.bib",
    });
    const confirmation = await handleLatexImportApi(
      zipRequest(`http://example.com/api/latex-imports?${query.toString()}`, archive),
      env,
      identity,
    );

    expect(confirmation.status).toBe(201);
    const imported = await responseRecord(confirmation);
    const workspace = imported.workspace as { id: string };
    const snapshot = await env.DOCUMENT_ROOMS.getByName(workspace.id).getSnapshot(workspace.id);
    expect(snapshot.title).toBe("Imported paper");
    expect(snapshot.files.map((file) => file.path)).toEqual(["main.md", "section.md"]);
    expect(snapshot.files[1]?.content).toContain(":cite[source]");
    expect(snapshot.files[1]?.content).toContain("![Imported figure](figures/result.png)");
    expect(snapshot.bibliography).toContain("@article{source");
    expect(snapshot.assets).toEqual([expect.objectContaining({ path: "figures/result.png", mediaType: "image/png", size: 8 })]);
    expect(await env.PAPERS.get(snapshot.assets[0]!.objectKey)).not.toBeNull();
  });

  it("requires an explicit root for ambiguous archives", async () => {
    const archive = zipSync({
      "a.tex": strToU8(String.raw`\documentclass{article}\begin{document}A\end{document}`),
      "b.tex": strToU8(String.raw`\documentclass{article}\begin{document}B\end{document}`),
    });
    const previewResponse = await handleLatexImportApi(zipRequest("http://example.com/api/latex-import-previews", archive), env, identity);
    const preview = await responseRecord(previewResponse);

    expect(preview.conversion).toBeNull();
    expect(preview.archiveSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(preview.previewDigest).toBeNull();
    expect(preview.archive).toMatchObject({ rootCandidates: ["a.tex", "b.tex"], selectedRoot: null });
    const selected = await handleLatexImportApi(
      zipRequest("http://example.com/api/latex-import-previews?root=b.tex", archive),
      env,
      identity,
    );
    await expect(selected.json()).resolves.toMatchObject({ conversion: { report: { rootPath: "b.tex" } } });
  });

  it("rejects confirmation with a different valid root without persistent writes", async () => {
    const archive = zipSync({
      "a.tex": strToU8(String.raw`\documentclass{article}\begin{document}A\end{document}`),
      "b.tex": strToU8(String.raw`\documentclass{article}\begin{document}B\end{document}`),
    });
    const previewResponse = await handleLatexImportApi(
      zipRequest("http://example.com/api/latex-import-previews?root=a.tex", archive),
      env,
      identity,
    );
    const preview = await responseRecord(previewResponse);
    const before = await persistentImportState();
    const query = new URLSearchParams({
      title: "Changed root",
      archiveSha256: String(preview.archiveSha256),
      previewDigest: String(preview.previewDigest),
      root: "b.tex",
    });

    const response = await handleLatexImportApi(
      zipRequest(`http://example.com/api/latex-imports?${query.toString()}`, archive),
      persistenceRejectingEnv(),
      identity,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "preview-changed" });
    await expect(persistentImportState()).resolves.toEqual(before);
  });

  it("rejects confirmation with a different valid bibliography without persistent writes", async () => {
    const archive = zipSync({
      "main.tex": strToU8(String.raw`\documentclass{article}\begin{document}Paper\bibliography{first,second}\end{document}`),
      "first.bib": strToU8("@article{first, title={First}}"),
      "second.bib": strToU8("@article{second, title={Second}}"),
    });
    const previewResponse = await handleLatexImportApi(
      zipRequest("http://example.com/api/latex-import-previews?bibliography=first.bib", archive),
      env,
      identity,
    );
    const preview = await responseRecord(previewResponse);
    const before = await persistentImportState();
    const query = new URLSearchParams({
      title: "Changed bibliography",
      archiveSha256: String(preview.archiveSha256),
      previewDigest: String(preview.previewDigest),
      bibliography: "second.bib",
    });

    const response = await handleLatexImportApi(
      zipRequest(`http://example.com/api/latex-imports?${query.toString()}`, archive),
      persistenceRejectingEnv(),
      identity,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "preview-changed" });
    await expect(persistentImportState()).resolves.toEqual(before);
  });

  it("rejects invalid media without persistent writes", async () => {
    const archive = zipSync({
      "main.tex": strToU8(String.raw`\documentclass{article}\begin{document}Paper\end{document}`),
    });
    const before = await persistentImportState();
    const invalidMedia = await handleLatexImportApi(
      new Request("http://example.com/api/latex-import-previews", {
        method: "POST",
        body: archive,
        headers: { "content-type": "text/plain" },
      }),
      env,
      identity,
    );
    expect(invalidMedia.status).toBe(415);
    await expect(persistentImportState()).resolves.toEqual(before);
  });

  it("stops reading a chunked archive as soon as the compressed-size limit is exceeded", async () => {
    let pulls = 0;
    let canceled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          if (pulls === 1) controller.enqueue(new Uint8Array(latexArchiveMaximumCompressedBytes));
          else if (pulls === 2) controller.enqueue(new Uint8Array([0]));
          else throw new Error("LaTeX import read beyond its compressed-size limit");
        },
        cancel() {
          canceled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const before = await persistentImportState();

    const response = await handleLatexImportApi(
      new Request("http://example.com/api/latex-import-previews", {
        method: "POST",
        body,
        headers: { "content-type": "application/zip" },
      }),
      persistenceRejectingEnv(),
      identity,
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "archive-size" });
    expect(pulls).toBeGreaterThanOrEqual(2);
    expect(canceled).toBe(true);
    await expect(persistentImportState()).resolves.toEqual(before);
  });

  it.each(["archiveSha256", "previewDigest"] as const)("requires the confirmation %s without persistent writes", async (missing) => {
    const archive = zipSync({
      "main.tex": strToU8(String.raw`\documentclass{article}\begin{document}Paper\end{document}`),
    });
    const previewResponse = await handleLatexImportApi(zipRequest("http://example.com/api/latex-import-previews", archive), env, identity);
    const preview = await responseRecord(previewResponse);
    const parameters = {
      title: "Paper",
      archiveSha256: String(preview.archiveSha256),
      previewDigest: String(preview.previewDigest),
    };
    const query = new URLSearchParams(Object.fromEntries(Object.entries(parameters).filter(([key]) => key !== missing)));
    const before = await persistentImportState();

    const response = await handleLatexImportApi(
      zipRequest(`http://example.com/api/latex-imports?${query.toString()}`, archive),
      persistenceRejectingEnv(),
      identity,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid-confirmation" });
    await expect(persistentImportState()).resolves.toEqual(before);
  });

  it("rejects modified archive bytes without persistent writes", async () => {
    const archive = zipSync({
      "main.tex": strToU8(String.raw`\documentclass{article}\begin{document}Paper\end{document}`),
    });
    const changedArchive = zipSync({
      "main.tex": strToU8(String.raw`\documentclass{article}\begin{document}Revised paper\end{document}`),
    });
    const previewResponse = await handleLatexImportApi(zipRequest("http://example.com/api/latex-import-previews", archive), env, identity);
    const preview = await responseRecord(previewResponse);
    const before = await persistentImportState();
    const query = new URLSearchParams({
      title: "Paper",
      archiveSha256: String(preview.archiveSha256),
      previewDigest: String(preview.previewDigest),
    });

    const changed = await handleLatexImportApi(
      zipRequest(`http://example.com/api/latex-imports?${query.toString()}`, changedArchive),
      persistenceRejectingEnv(),
      identity,
    );
    expect(changed.status).toBe(409);
    await expect(changed.json()).resolves.toMatchObject({ code: "archive-changed" });
    await expect(persistentImportState()).resolves.toEqual(before);
  });
});

function zipRequest(url: string, archive: Uint8Array): Request {
  return new Request(url, { method: "POST", body: archive, headers: { "content-type": "application/zip" } });
}

async function responseRecord(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function persistenceRejectingEnv(): Env {
  return new Proxy(env, {
    get(_target, property) {
      throw new Error(`Confirmation accessed persistence binding ${String(property)} before preview identity validation`);
    },
  });
}

async function persistentImportState(): Promise<{
  readonly workspaces: Awaited<ReturnType<ReturnType<typeof env.WORKSPACE_CATALOGS.getByName>["listWorkspaces"]>>;
  readonly objects: readonly { readonly key: string; readonly etag: string; readonly size: number }[];
}> {
  const [workspaces, papers] = await Promise.all([env.WORKSPACE_CATALOGS.getByName(identity.ownerKey).listWorkspaces(), env.PAPERS.list()]);
  return {
    workspaces,
    objects: papers.objects.map(({ key, etag, size }) => ({ key, etag, size })),
  };
}
