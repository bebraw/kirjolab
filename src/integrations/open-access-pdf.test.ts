import { describe, expect, it, vi } from "vitest";
import { discoverOpenAccessPdf, downloadOpenAccessPdf, refetchOpenAccessPdfCandidate } from "./open-access-pdf";

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
      { openAlexApiKey: " key ", contactEmail: "researcher@example.test" },
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
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://api.openalex.org/works/doi:10.1000%2Fexample?select=id%2Cbest_oa_location&api_key=key"),
      { headers: { accept: "application/json", "user-agent": "Kirjolab/0.1" } },
    );
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
      discoverOpenAccessPdf("10.1000/example", { openAlexApiKey: "key", contactEmail: " researcher@example.test " }, fetcher),
    ).resolves.toMatchObject({ provider: "unpaywall", license: "", version: "submittedVersion" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith(new URL("https://api.unpaywall.org/v2/10.1000%2Fexample?email=researcher%40example.test"), {
      headers: { accept: "application/json", "user-agent": "Kirjolab/0.1" },
    });
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
    expect(fetcher).toHaveBeenLastCalledWith(new URL("https://cdn.example/file.pdf"), {
      redirect: "manual",
      headers: { accept: "application/pdf", "user-agent": "Kirjolab/0.1" },
    });
  });

  it.each([403, 200])("identifies a browser challenge at the final PDF host (HTTP %s)", async (status) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://dl.acm.org/doi/pdf/10.1145/3604801" } }))
      .mockResolvedValueOnce(
        new Response("<html>Challenge</html>", { status, headers: { "cf-mitigated": "challenge", "content-type": "text/html" } }),
      );

    await expect(downloadOpenAccessPdf("https://repository.example/download", fetcher)).rejects.toThrow(
      `PDF host dl.acm.org requires browser verification (HTTP ${status}).`,
    );
  });

  it.each([401, 403, 404, 429, 503])("reports the PDF host and HTTP %s without exposing its response", async (status) => {
    await expect(
      downloadOpenAccessPdf(
        "https://repository.example/file.pdf?token=private",
        async () => new Response("private upstream details", { status }),
      ),
    ).rejects.toThrow(`PDF host repository.example refused the download (HTTP ${status}).`);
  });

  it("reports a connection failure without exposing the URL or network error", async () => {
    await expect(
      downloadOpenAccessPdf("https://repository.example/file.pdf?token=private", async () => {
        throw new TypeError("private upstream details");
      }),
    ).rejects.toThrow("Could not connect to PDF host repository.example.");
  });

  it.each([
    ["http://repository.example/file.pdf", "Open PDF URL must use HTTPS"],
    ["https://user@repository.example/file.pdf", "Open PDF URL must not contain credentials"],
    ["https://:secret@repository.example/file.pdf", "Open PDF URL must not contain credentials"],
    ...[
      "localhost",
      "printer",
      "service.localhost",
      "service.local",
      "service.internal",
      "service.home.arpa",
      "127.0.0.1",
      "192.168.10.20",
      "[::1]",
    ].map((host) => [`https://${host}/file.pdf`, "Open PDF URL must use a public hostname"]),
    [`https://repository.example/${"a".repeat(1_000)}`, "Open PDF URL is too long"],
  ])("rejects unsafe download target %s before fetching", async (url, message) => {
    const fetcher = vi.fn();
    await expect(downloadOpenAccessPdf(url, fetcher)).rejects.toThrow(message);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts the URL and declared-size limits and assembles streamed PDF chunks", async () => {
    const url = `https://repository.example/${"a".repeat(973)}`;
    expect(url).toHaveLength(1_000);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("%PD"));
        controller.enqueue(new TextEncoder().encode("F-test"));
        controller.close();
      },
    });
    const result = await downloadOpenAccessPdf(
      url,
      async () =>
        new Response(stream, {
          headers: { "content-type": "Application/PDF; charset=binary", "content-length": String(25 * 1024 * 1024) },
        }),
    );
    expect(result.bytes).toEqual(new TextEncoder().encode("%PDF-test"));
    expect(result.finalUrl).toBe(url);
    expect(result.fingerprint).toBe("sha256:3c87d37f1dbea6909f917ce437c390fb8e655a774387d9e69301c0b2283d5b63");
    expect(stream.locked).toBe(false);
  });

  it("revalidates a redirect before contacting an unsafe destination", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://service.local/file.pdf" } }));
    await expect(downloadOpenAccessPdf("https://repository.example/file.pdf", fetcher)).rejects.toThrow(
      "Open PDF URL must use a public hostname",
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("follows at most five relative redirects", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(null, { status: 300, headers: { location: "/next.pdf" } }));
    await expect(downloadOpenAccessPdf("https://repository.example/file.pdf", fetcher)).rejects.toThrow("Open PDF has too many redirects");
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(fetcher.mock.calls[1]?.[0]).toEqual(new URL("https://repository.example/next.pdf"));
  });

  it("downloads a PDF after the fifth redirect", async () => {
    let calls = 0;
    const fetcher = vi.fn(async () =>
      ++calls <= 5
        ? new Response(null, { status: 302, headers: { location: "/next.pdf" } })
        : new Response("%PDF-test", { headers: { "content-type": "application/pdf" } }),
    );
    await expect(downloadOpenAccessPdf("https://repository.example/file.pdf", fetcher)).resolves.toMatchObject({
      finalUrl: "https://repository.example/next.pdf",
    });
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it("rejects redirects with no location and PDFs with no body", async () => {
    await expect(
      downloadOpenAccessPdf("https://repository.example/file.pdf", async () => new Response(null, { status: 302 })),
    ).rejects.toThrow("Open PDF redirect has no location");
    await expect(
      downloadOpenAccessPdf(
        "https://repository.example/file.pdf",
        async () => new Response(null, { headers: { "content-type": "application/pdf" } }),
      ),
    ).rejects.toThrow("Open PDF response has no body");
  });

  it("cancels an undeclared oversized stream and releases its reader", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(25 * 1024 * 1024 + 1));
      },
      cancel,
    });
    await expect(
      downloadOpenAccessPdf(
        "https://repository.example/file.pdf",
        async () => new Response(stream, { headers: { "content-type": "application/pdf" } }),
      ),
    ).rejects.toThrow("Open PDF exceeds the 25 MB limit");
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it("skips unconfigured providers without making requests", async () => {
    const fetcher = vi.fn();
    await expect(discoverOpenAccessPdf("10.1000/example", { openAlexApiKey: " ", contactEmail: " " }, fetcher)).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["openalex", "OpenAlex API key is not configured"],
    ["unpaywall", "Unpaywall contact email is not configured"],
  ] as const)("requires configuration when refreshing %s evidence", async (provider, message) => {
    const fetcher = vi.fn();
    await expect(
      refetchOpenAccessPdfCandidate(provider, "10.1000/example", { openAlexApiKey: " ", contactEmail: " " }, fetcher),
    ).rejects.toThrow(message);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["openalex", "unpaywall"] as const)("distinguishes a missing %s record from a failed lookup", async (provider) => {
    const config = { openAlexApiKey: "key", contactEmail: "researcher@example.test" };
    await expect(
      refetchOpenAccessPdfCandidate(provider, "10.1000/example", config, async () => new Response(null, { status: 404 })),
    ).resolves.toBeNull();
    await expect(
      refetchOpenAccessPdfCandidate(provider, "10.1000/example", config, async () => new Response(null, { status: 503 })),
    ).rejects.toThrow(`${provider === "openalex" ? "OpenAlex" : "Unpaywall"} open-PDF lookup failed`);
    await expect(
      refetchOpenAccessPdfCandidate(provider, "10.1000/example", config, async () => new Response("invalid json")),
    ).rejects.toThrow("Open-PDF provider returned invalid metadata");
    await expect(
      refetchOpenAccessPdfCandidate(
        provider,
        "10.1000/example",
        config,
        async () => new Response("{}", { headers: { "content-length": "1000001" } }),
      ),
    ).rejects.toThrow("Open-PDF metadata response is too large");
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
