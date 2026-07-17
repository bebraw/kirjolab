import { env } from "cloudflare:workers";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
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
    expect(preview.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(preview.conversion).toMatchObject({
      seed: { entryPath: "main.md", files: [{ path: "main.md" }, { path: "section.md" }] },
      assets: [{ path: "figures/result.png", mediaType: "image/png", bytes: 8 }],
      report: { rootPath: "main.tex", bibliographyPath: "refs.bib" },
    });
    expect(await catalog.listWorkspaces()).toEqual(workspacesBeforePreview);

    const query = new URLSearchParams({ title: "Imported paper", previewDigest: String(preview.digest) });
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
    expect(preview.archive).toMatchObject({ rootCandidates: ["a.tex", "b.tex"], selectedRoot: null });
    const selected = await handleLatexImportApi(
      zipRequest("http://example.com/api/latex-import-previews?root=b.tex", archive),
      env,
      identity,
    );
    await expect(selected.json()).resolves.toMatchObject({ conversion: { report: { rootPath: "b.tex" } } });
  });

  it("rejects changed archives, invalid media, and malformed input without catalog writes", async () => {
    const archive = zipSync({
      "main.tex": strToU8(String.raw`\documentclass{article}\begin{document}Paper\end{document}`),
    });
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

    const changed = await handleLatexImportApi(
      zipRequest(`http://example.com/api/latex-imports?title=Paper&previewDigest=${"0".repeat(64)}`, archive),
      env,
      identity,
    );
    expect(changed.status).toBe(409);
    await expect(changed.json()).resolves.toMatchObject({ code: "archive-changed" });
  });
});

function zipRequest(url: string, archive: Uint8Array): Request {
  return new Request(url, { method: "POST", body: archive, headers: { "content-type": "application/zip" } });
}

async function responseRecord(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}
