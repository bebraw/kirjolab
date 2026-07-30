import { describe, expect, it, vi } from "vitest";
import { discoverOpenAccessPdf, downloadOpenAccessPdf } from "./open-access-pdf";

describe("open-access PDF integration", () => {
  it("returns a fingerprinted OpenAlex OA location without downloading the PDF", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        id: "https://openalex.org/W123",
        best_oa_location: {
          is_oa: true,
          landing_page_url: "https://repository.example/paper",
          pdf_url: "https://repository.example/paper.pdf",
          license: "cc-by",
          version: "acceptedVersion",
        },
      }),
    );

    const candidate = await discoverOpenAccessPdf(
      "10.1000/example",
      { openAlexApiKey: "key", contactEmail: "researcher@example.test" },
      fetcher,
    );

    expect(candidate).toMatchObject({
      provider: "openalex",
      providerRecordId: "https://openalex.org/W123",
      pdfUrl: "https://repository.example/paper.pdf",
      license: "cc-by",
      version: "acceptedVersion",
    });
    expect(candidate?.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("falls back to Unpaywall when OpenAlex has no direct open PDF", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "https://openalex.org/W123", best_oa_location: null }))
      .mockResolvedValueOnce(
        Response.json({
          doi: "10.1000/example",
          is_oa: true,
          best_oa_location: {
            url: "https://repository.example/paper",
            url_for_pdf: "https://repository.example/paper.pdf",
            license: null,
            version: "submittedVersion",
          },
        }),
      );

    await expect(
      discoverOpenAccessPdf("10.1000/example", { openAlexApiKey: "key", contactEmail: "researcher@example.test" }, fetcher),
    ).resolves.toMatchObject({ provider: "unpaywall", license: "", version: "submittedVersion" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("revalidates redirects and reads only PDF responses", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://cdn.example/file.pdf" } }))
      .mockResolvedValueOnce(new Response(new TextEncoder().encode("%PDF-test"), { headers: { "content-type": "application/pdf" } }));

    const result = await downloadOpenAccessPdf("https://repository.example/download", fetcher);

    expect(result.finalUrl).toBe("https://cdn.example/file.pdf");
    expect(result.bytes).toEqual(new TextEncoder().encode("%PDF-test"));
    expect(result.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(fetcher).toHaveBeenLastCalledWith(new URL("https://cdn.example/file.pdf"), expect.objectContaining({ redirect: "manual" }));
  });

  it.each([
    "http://repository.example/file.pdf",
    "https://user:secret@repository.example/file.pdf",
    "https://127.0.0.1/file.pdf",
    "https://service.internal/file.pdf",
  ])("rejects unsafe download target %s", async (url) => {
    await expect(downloadOpenAccessPdf(url, vi.fn())).rejects.toThrow();
  });

  it("rejects a declared oversized response before reading it", async () => {
    await expect(
      downloadOpenAccessPdf(
        "https://repository.example/file.pdf",
        async () =>
          new Response(new Uint8Array(), {
            headers: { "content-length": String(25 * 1024 * 1024 + 1), "content-type": "application/pdf" },
          }),
      ),
    ).rejects.toThrow("25 MB");
  });

  it.each([
    ["text/html", "<html>", "application/pdf"],
    ["application/pdf", "not a PDF", "PDF signature"],
  ])("rejects invalid PDF response %s", async (contentType, body, expected) => {
    await expect(
      downloadOpenAccessPdf(
        "https://repository.example/file.pdf",
        async () => new Response(body, { headers: { "content-type": contentType } }),
      ),
    ).rejects.toThrow(expected);
  });
});
