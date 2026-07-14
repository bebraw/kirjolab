import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OpenAICompatibleBrowserProvider,
  type OpenAICompatibleBrowserProviderOptions,
  type ReviseSelectionRequest,
} from "./model-provider";

const operation = {
  selectedPassage: "The selected passage remains local to this operation.",
  instruction: "Make the claim more precise.",
  evidence: [
    { kind: "annotation", id: "annotation-1", label: "Page 4", content: "First evidence item." },
    { kind: "claim", id: "claim-1", label: "Working claim", content: "Second evidence item." },
  ],
} as const satisfies ReviseSelectionRequest;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OpenAICompatibleBrowserProvider", () => {
  it("sends a bounded replacement-only operation without a complete document", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completionResponse("A more precise inline replacement."));
    const provider = createProvider({ fetcher });

    await expect(provider.reviseSelection(operation)).resolves.toEqual({
      replacement: "A more precise inline replacement.",
      adapter: "openai-compatible",
      providerLabel: "Local test model",
      model: "test-model",
    });

    expect(fetcher).toHaveBeenCalledOnce();
    const [endpoint, init] = fetcher.mock.calls[0] ?? [];
    expect(endpoint).toBeInstanceOf(URL);
    expect(String(endpoint)).toBe("http://127.0.0.1:1234/v1/chat/completions");
    expect(init).toMatchObject({ method: "POST", credentials: "omit", redirect: "error" });
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      temperature: number;
      stream: boolean;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body).toMatchObject({ model: "test-model", temperature: 0.2, stream: false });
    expect(body.messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(body.messages[0]?.content).toContain("return only the replacement passage");
    expect(body.messages[1]?.content).not.toContain("complete document");
    expect(body.messages[1]?.content).not.toContain("unrelated manuscript tail");
    const prompt = JSON.parse(body.messages[1]?.content ?? "") as {
      selectedPassage: string;
      instruction: string;
      orderedEvidence: Array<{ order: number; id: string }>;
    };
    expect(prompt).toEqual({
      selectedPassage: operation.selectedPassage,
      instruction: operation.instruction,
      orderedEvidence: [
        { order: 1, kind: "annotation", id: "annotation-1", label: "Page 4", content: "First evidence item." },
        { order: 2, kind: "claim", id: "claim-1", label: "Working claim", content: "Second evidence item." },
      ],
    });
  });

  it("invokes the browser fetch function without binding the provider as its receiver", async () => {
    const browserFetch = vi.fn(function (this: unknown) {
      if (this !== undefined) throw new TypeError("Illegal invocation");
      return Promise.resolve(completionResponse("replacement"));
    }) as typeof fetch;
    vi.stubGlobal("fetch", browserFetch);
    const provider = new OpenAICompatibleBrowserProvider({
      endpoint: "http://127.0.0.1:1234/v1/chat/completions",
      providerLabel: "Local test model",
      model: "test-model",
    });

    await expect(provider.reviseSelection(operation)).resolves.toMatchObject({ replacement: "replacement" });
    expect(browserFetch).toHaveBeenCalledOnce();
  });

  it("requires browser fetch to reject redirects outside the validated endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>((_input, init) => {
      if (init?.redirect !== "error") return Promise.resolve(completionResponse("redirect followed"));
      return Promise.reject(new TypeError("fetch redirected"));
    });

    await expect(createProvider({ fetcher }).reviseSelection(operation)).rejects.toThrow("fetch redirected");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    "http://localhost:1234/v1/chat/completions",
    "https://localhost/v1/chat/completions",
    "http://127.0.0.1:1234/v1/chat/completions",
    "http://127.1:1234/v1/chat/completions",
    "http://[::1]:1234/v1/chat/completions",
  ])("accepts the credential-free loopback endpoint %s", async (endpoint) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completionResponse("replacement"));
    const provider = createProvider({ endpoint, fetcher });

    await expect(provider.reviseSelection(operation)).resolves.toMatchObject({ replacement: "replacement" });
  });

  it.each([
    "not a URL",
    "file:///tmp/model",
    "ws://127.0.0.1:1234/model",
    "http://example.com/v1/chat/completions",
    "http://127.0.0.2:1234/v1/chat/completions",
    "http://127.255.255.254/v1/chat/completions",
    "http://127.0.0.1.example.com/v1/chat/completions",
    "http://user:secret@127.0.0.1:1234/v1/chat/completions",
  ])("rejects the unsafe endpoint %s", (endpoint) => {
    expect(() => createProvider({ endpoint })).toThrow(/valid URL|HTTP or HTTPS|loopback|credentials/u);
  });

  it("validates operation and provider bounds before network access", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = createProvider({ fetcher });
    expect(() => createProvider({ providerLabel: " " })).toThrow("Provider label is required");
    expect(() => createProvider({ providerLabel: "x".repeat(257) })).toThrow("Provider label exceeds 256 characters");
    expect(() => createProvider({ model: "x".repeat(257) })).toThrow("Model exceeds 256 characters");
    expect(() => createProvider({ endpoint: `http://localhost/${"x".repeat(2_100)}` })).toThrow("Model endpoint exceeds");

    for (const request of [
      null,
      { ...operation, selectedPassage: "" },
      { ...operation, selectedPassage: "x".repeat(20_001) },
      { ...operation, instruction: "" },
      { ...operation, instruction: "x".repeat(4_001) },
      { ...operation, evidence: [] },
      { ...operation, evidence: Array.from({ length: 13 }, (_, index) => evidence("annotation", String(index))) },
      { ...operation, evidence: [{ kind: "note", id: "n", label: "Note", content: "Text" }] },
      { ...operation, evidence: [{ kind: "annotation", id: "", label: "Note", content: "Text" }] },
      { ...operation, evidence: [{ kind: "annotation", id: "x".repeat(129), label: "Note", content: "Text" }] },
      { ...operation, evidence: [{ kind: "annotation", id: "a", label: "", content: "Text" }] },
      { ...operation, evidence: [{ kind: "annotation", id: "a", label: "x".repeat(513), content: "Text" }] },
      { ...operation, evidence: [{ kind: "annotation", id: "a", label: "Note", content: "" }] },
      { ...operation, evidence: [{ kind: "annotation", id: "a", label: "Note", content: "x".repeat(20_001) }] },
      { ...operation, evidence: [evidence("annotation", "same"), evidence("annotation", "same")] },
      {
        ...operation,
        evidence: Array.from({ length: 4 }, (_, index) => ({
          ...evidence("annotation", String(index)),
          content: "x".repeat(20_000),
        })),
      },
    ]) {
      await expect(provider.reviseSelection(request as ReviseSelectionRequest)).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts exact individual bounds and distinguishes equal ids across evidence kinds", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(completionResponse("replacement")));
    const bounded = createProvider({ providerLabel: "p".repeat(256), fetcher });

    await expect(
      bounded.reviseSelection({
        ...operation,
        evidence: [{ kind: "annotation", id: "i".repeat(128), label: "l".repeat(512), content: "c".repeat(20_000) }],
      }),
    ).resolves.toMatchObject({ replacement: "replacement" });
    await expect(
      bounded.reviseSelection({
        ...operation,
        evidence: [
          { kind: "annotation", id: "shared", label: "Annotation", content: "Quoted evidence" },
          { kind: "claim", id: "shared", label: "Claim", content: "Synthesized evidence" },
        ],
      }),
    ).resolves.toMatchObject({ replacement: "replacement" });
  });

  it("rejects non-successful and malformed provider responses", async () => {
    for (const [response, message] of [
      [new Response("unavailable", { status: 503 }), "Local model request failed (503)"],
      [new Response("not json"), "malformed JSON"],
      [new Response(null), "empty response"],
      [jsonResponse({ choices: [] }), "no replacement text"],
      [jsonResponse({ choices: [null] }), "no replacement text"],
      [jsonResponse({ choices: [{ message: null }] }), "no replacement text"],
      [jsonResponse({ choices: [{ message: { content: 1 } }] }), "no replacement text"],
      [completionResponse("   "), "blank replacement"],
      [completionResponse("x".repeat(50_001)), "exceeds 50000 characters"],
    ] as const) {
      const provider = createProvider({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(response) });
      await expect(provider.reviseSelection(operation)).rejects.toThrow(message);
    }
  });

  it("rejects declared and streamed responses above 256 KiB", async () => {
    const declared = completionResponse("replacement", { "content-length": String(256 * 1_024 + 1) });
    await expect(createProvider({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(declared) }).reviseSelection(operation)).rejects.toThrow(
      "exceeds 262144 bytes",
    );

    const oversizedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(200_000));
        controller.enqueue(new Uint8Array(70_000));
        controller.close();
      },
    });
    const streamed = new Response(oversizedStream, { status: 200 });
    await expect(createProvider({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(streamed) }).reviseSelection(operation)).rejects.toThrow(
      "exceeds 262144 bytes",
    );
  });

  it("combines streamed response chunks before parsing", async () => {
    const encoded = new TextEncoder().encode(JSON.stringify({ choices: [{ message: { content: "chunked replacement" } }] }));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, 7));
        controller.enqueue(encoded.slice(7));
        controller.close();
      },
    });
    const provider = createProvider({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(stream)) });

    await expect(provider.reviseSelection(operation)).resolves.toMatchObject({ replacement: "chunked replacement" });
  });

  it("propagates caller abort and times out after 120 seconds", async () => {
    const caller = new AbortController();
    const abortedProvider = createProvider({ fetcher: abortableFetch() });
    const aborted = abortedProvider.reviseSelection(operation, { signal: caller.signal });
    caller.abort();
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });

    vi.useFakeTimers();
    const timedProvider = createProvider({ fetcher: abortableFetch() });
    const timed = timedProvider.reviseSelection(operation);
    const expectation = expect(timed).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(120_000);
    await expectation;

    const alreadyAborted = new AbortController();
    alreadyAborted.abort(new Error("caller stopped before request"));
    await expect(createProvider().reviseSelection(operation, { signal: alreadyAborted.signal })).rejects.toThrow(
      "caller stopped before request",
    );
  });

  it.each([
    ["```markdown\nReplacement without a forced newline.\n```", "Replacement without a forced newline."],
    ["```md\r\nInline replacement\r\n```", "Inline replacement"],
    ["```\nUnlabelled Markdown\n```", "Unlabelled Markdown"],
    ["plain inline replacement", "plain inline replacement"],
    ["  preserve plain whitespace  ", "  preserve plain whitespace  "],
    ["prefix ```md\nnot an outer fence\n```", "prefix ```md\nnot an outer fence\n```"],
    ["```json\nnot a Markdown fence\n```", "```json\nnot a Markdown fence\n```"],
  ])("normalizes provider output %j without changing inline replacement semantics", async (content, replacement) => {
    const provider = createProvider({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(completionResponse(content)) });

    await expect(provider.reviseSelection(operation)).resolves.toMatchObject({ replacement });
  });
});

function createProvider(overrides: Partial<OpenAICompatibleBrowserProviderOptions> = {}): OpenAICompatibleBrowserProvider {
  return new OpenAICompatibleBrowserProvider({
    endpoint: "http://127.0.0.1:1234/v1/chat/completions",
    providerLabel: "Local test model",
    model: "test-model",
    fetcher: vi.fn<typeof fetch>().mockResolvedValue(completionResponse("replacement")),
    ...overrides,
  });
}

function completionResponse(content: string, headers?: HeadersInit): Response {
  return jsonResponse({ choices: [{ message: { content } }] }, headers);
}

function jsonResponse(value: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), { status: 200, ...(headers === undefined ? {} : { headers }) });
}

function evidence(kind: "annotation" | "claim", id: string) {
  return { kind, id, label: `Evidence ${id}`, content: `Content ${id}` } as const;
}

function abortableFetch(): typeof fetch {
  return vi.fn<typeof fetch>((_input, init) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  });
}
