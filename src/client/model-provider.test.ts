import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverOpenAICompatibleModels,
  OpenAICompatibleBrowserProvider,
  type DraftClaimRequest,
  type ClarityDrillRequest,
  type IdeationRequest,
  type TableSyntaxRequest,
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

const claimOperation = {
  instruction: "State the supported proposition.",
  relation: "supports",
  evidence: [{ kind: "annotation", id: "annotation-1", label: "Page 4", content: "Quoted source evidence." }],
} as const satisfies DraftClaimRequest;

const clarityOperation = {
  selectedPassage: "This approach is better for everyone.",
  instruction: "Make the claim concrete.",
  evidence: [],
} as const satisfies ClarityDrillRequest;
const ideationOperation = clarityOperation satisfies IdeationRequest;
const tableOperation = {
  instruction: "Make labels concise.",
  caption: "Results",
  columns: ["Method", "Score"],
  rows: [["Baseline", "0.6"]],
  manuscriptContext: "The proposed method improves the score.",
} as const satisfies TableSyntaxRequest;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OpenAICompatibleBrowserProvider", () => {
  it("formulates a search query without inventing reference records", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        completionResponse('{"query":"visible evidence scholarly review time","rationale":"Names the mechanism and outcome."}'),
      );
    const result = await createProvider({ fetcher }).formulateReferenceQuery(clarityOperation);
    expect(result).toMatchObject({
      query: "visible evidence scholarly review time",
      rationale: "Names the mechanism and outcome.",
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      response_format: { json_schema: { name: string } };
      messages: Array<{ content: string }>;
    };
    expect(body.response_format.json_schema.name).toBe("kirjolab_reference_query");
    expect(body.messages[0]?.content).toContain("Do not invent titles, authors, DOIs, or citations");
  });

  it("returns a bounded structured table instead of model-authored Markdown", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(completionResponse('{"caption":"Results","columns":["Method","Score"],"rows":[["Base","0.6"]]}'));
    const result = await createProvider({ fetcher }).buildTable(tableOperation);
    expect(result).toMatchObject({ caption: "Results", columns: ["Method", "Score"], rows: [["Base", "0.6"]] });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      response_format: { json_schema: { name: string } };
      messages: Array<{ content: string }>;
    };
    expect(body.response_format.json_schema.name).toBe("kirjolab_table");
    expect(body.messages[0]?.content).toContain("do not emit Markdown");
  });

  it("returns three typed ideation drafts", async () => {
    const content = JSON.stringify({
      ideas: [
        { title: "Measure time", direction: "Name the affected group and outcome.", draft: "Editors review drafts faster." },
        { title: "Compare steps", direction: "Contrast the old and new workflow.", draft: "The workflow removes one review pass." },
        { title: "Expose mechanism", direction: "Explain why review accelerates.", draft: "Inline evidence reduces lookup time." },
      ],
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completionResponse(content));
    const result = await createProvider({ fetcher }).ideate(ideationOperation);
    expect(result.ideas).toHaveLength(3);
    expect(result.ideas[0]).toEqual({
      title: "Measure time",
      direction: "Name the affected group and outcome.",
      draft: "Editors review drafts faster.",
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      response_format: { json_schema: { name: string } };
    };
    expect(body.response_format.json_schema.name).toBe("kirjolab_ideas");
  });

  it("asks one clarity question and returns bounded rewrite choices", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(completionResponse('{"issue":"Better is undefined.","question":"Which outcome improves, for whom?"}'))
      .mockResolvedValueOnce(
        completionResponse(
          '{"rewrites":[{"text":"The approach reduces review time for editors.","rationale":"Names the outcome and group."},{"text":"Editors review drafts faster with this approach.","rationale":"Uses a direct comparison."}]}',
        ),
      );
    const provider = createProvider({ fetcher });

    const question = await provider.startClarityDrill(clarityOperation);
    expect(question).toMatchObject({ issue: "Better is undefined.", question: "Which outcome improves, for whom?" });
    await expect(
      provider.continueClarityDrill({ ...clarityOperation, ...question, answer: "It reduces review time for editors." }),
    ).resolves.toMatchObject({
      rewrites: [
        { text: "The approach reduces review time for editors.", rationale: "Names the outcome and group." },
        { text: "Editors review drafts faster with this approach.", rationale: "Uses a direct comparison." },
      ],
    });

    const firstBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      response_format: { json_schema: { name: string } };
      messages: Array<{ content: string }>;
    };
    const secondBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)) as {
      response_format: { json_schema: { name: string } };
      messages: Array<{ content: string }>;
    };
    expect(firstBody.response_format.json_schema.name).toBe("kirjolab_clarity_question");
    expect(secondBody.response_format.json_schema.name).toBe("kirjolab_clarity_rewrites");
    expect(JSON.parse(secondBody.messages[1]?.content ?? "")).toMatchObject({
      researcherAnswer: "It reduces review time for editors.",
    });
  });

  it("rejects malformed contextual-operation requests and structured outputs", async () => {
    const idle = vi.fn<typeof fetch>();
    const provider = createProvider({ fetcher: idle });
    for (const request of [
      null,
      { ...clarityOperation, selectedPassage: "" },
      { ...clarityOperation, selectedPassage: "x".repeat(20_001) },
      { ...clarityOperation, instruction: "" },
      { ...clarityOperation, evidence: Array.from({ length: 13 }, (_, index) => evidence("annotation", String(index))) },
    ]) {
      await expect(provider.startClarityDrill(request as ClarityDrillRequest)).rejects.toThrow();
    }
    for (const request of [
      { ...clarityOperation, issue: "", question: "Question?", answer: "Answer" },
      { ...clarityOperation, issue: "Issue", question: "", answer: "Answer" },
      { ...clarityOperation, issue: "Issue", question: "Question?", answer: "" },
      { ...clarityOperation, issue: "x".repeat(2_001), question: "Question?", answer: "Answer" },
      { ...clarityOperation, issue: "Issue", question: "x".repeat(2_001), answer: "Answer" },
      { ...clarityOperation, issue: "Issue", question: "Question?", answer: "x".repeat(4_001) },
    ]) {
      await expect(provider.continueClarityDrill(request)).rejects.toThrow();
    }
    for (const request of [
      { ...tableOperation, caption: "x".repeat(501) },
      { ...tableOperation, columns: ["Only"] },
      { ...tableOperation, columns: Array.from({ length: 9 }, (_, index) => `C${index}`), rows: [["x"]] },
      { ...tableOperation, rows: [] },
      { ...tableOperation, rows: Array.from({ length: 101 }, () => ["x", "y"]) },
      { ...tableOperation, rows: [["one"]] },
      { ...tableOperation, columns: ["", "Score"] },
      { ...tableOperation, rows: [["", "0.6"]] },
      { ...tableOperation, manuscriptContext: "x".repeat(20_001) },
    ]) {
      await expect(provider.buildTable(request)).rejects.toThrow();
    }
    expect(idle).not.toHaveBeenCalled();

    const invalidQuestions = ["not json", "{}", '{"issue":"","question":"Why?"}', '{"issue":"Issue","question":"","extra":true}'];
    for (const content of invalidQuestions) {
      await expect(
        createProvider({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(completionResponse(content)) }).startClarityDrill(
          clarityOperation,
        ),
      ).rejects.toThrow();
    }
    const invalidRewrites = [
      '{"rewrites":[]}',
      '{"rewrites":[{"text":"One","rationale":"Why"}]}',
      `{"rewrites":${JSON.stringify(Array.from({ length: 5 }, (_, index) => ({ text: String(index), rationale: "Why" })))}}`,
      '{"rewrites":[null,null]}',
      '{"rewrites":[{"text":"","rationale":"Why"},{"text":"Two","rationale":"Why"}]}',
      '{"rewrites":[{"text":"One","rationale":""},{"text":"Two","rationale":"Why"}]}',
      '{"rewrites":[{"text":"One","rationale":"Why","extra":true},{"text":"Two","rationale":"Why"}]}',
    ];
    for (const content of invalidRewrites) {
      await expect(
        createProvider({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(completionResponse(content)) }).continueClarityDrill({
          ...clarityOperation,
          issue: "Issue",
          question: "Why?",
          answer: "Because.",
        }),
      ).rejects.toThrow();
    }

    const validIdeas = Array.from({ length: 3 }, (_, index) => ({ title: `Idea ${index}`, direction: "Direction", draft: "Draft" }));
    for (const content of [
      "not json",
      '{"ideas":[]}',
      JSON.stringify({ ideas: validIdeas.slice(0, 2) }),
      JSON.stringify({ ideas: [...validIdeas, ...validIdeas] }),
      JSON.stringify({ ideas: [null, ...validIdeas.slice(1)] }),
      JSON.stringify({ ideas: [{ ...validIdeas[0], title: "" }, ...validIdeas.slice(1)] }),
      JSON.stringify({ ideas: [{ ...validIdeas[0], direction: "" }, ...validIdeas.slice(1)] }),
      JSON.stringify({ ideas: [{ ...validIdeas[0], draft: "", extra: true }, ...validIdeas.slice(1)] }),
    ]) {
      await expect(
        createProvider({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(completionResponse(content)) }).ideate(ideationOperation),
      ).rejects.toThrow();
    }

    for (const content of [
      "not json",
      "{}",
      '{"caption":"","columns":["Only"],"rows":[["x"]]}',
      '{"caption":"","columns":["A","B"],"rows":[]}',
      '{"caption":"","columns":["A","B"],"rows":[["x"]]}',
      '{"caption":"","columns":["A","B"],"rows":[["x","y"]],"extra":true}',
    ]) {
      await expect(
        createProvider({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(completionResponse(content)) }).buildTable(tableOperation),
      ).rejects.toThrow();
    }

    for (const content of [
      "not json",
      "{}",
      '{"query":"","rationale":"Why"}',
      '{"query":"terms","rationale":""}',
      '{"query":"terms","rationale":"Why","title":"Invented"}',
      JSON.stringify({ query: "x".repeat(4_001), rationale: "Why" }),
      JSON.stringify({ query: "terms", rationale: "x".repeat(2_001) }),
    ]) {
      await expect(
        createProvider({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(completionResponse(content)) }).formulateReferenceQuery(
          clarityOperation,
        ),
      ).rejects.toThrow();
    }
  });

  it("drafts one structured claim from annotation-only evidence", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completionResponse('{"text":"A grounded proposition.","note":"Working note"}'));
    const draft = await createProvider({ fetcher }).draftClaim(claimOperation);

    expect(draft).toEqual({
      text: "A grounded proposition.",
      note: "Working note",
      adapter: "openai-compatible",
      providerLabel: "Local test model",
      model: "test-model",
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
      response_format: { json_schema: { name: string; schema: { required: string[] } } };
    };
    expect(body.messages[0]?.content).toContain("exactly two string fields");
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "kirjolab_claim_draft",
        strict: true,
        schema: {
          type: "object",
          properties: { text: { type: "string" }, note: { type: "string" } },
          required: ["text", "note"],
          additionalProperties: false,
        },
      },
    });
    expect(JSON.parse(body.messages[1]?.content ?? "")).toEqual({
      instruction: claimOperation.instruction,
      evidenceRelation: "supports",
      orderedAnnotations: [{ order: 1, id: "annotation-1", label: "Page 4", content: "Quoted source evidence." }],
    });
  });

  it("rejects invalid claim requests and malformed structured drafts", async () => {
    const idle = vi.fn<typeof fetch>();
    const provider = createProvider({ fetcher: idle });
    await expect(Reflect.apply(provider.draftClaim, provider, [{ ...claimOperation, relation: "related" }])).rejects.toThrow(
      "relation is invalid",
    );
    await expect(
      createProvider({ fetcher: idle }).draftClaim({ ...claimOperation, evidence: [evidence("claim", "claim-1")] }),
    ).rejects.toThrow("require annotation evidence");
    expect(idle).not.toHaveBeenCalled();

    for (const content of [
      "not json",
      '{"text":"","note":""}',
      '{"text":"Claim","note":1}',
      '{"text":"Claim","note":"","extra":true}',
      JSON.stringify({ text: "x".repeat(2_001), note: "" }),
      JSON.stringify({ text: "Claim", note: "x".repeat(8_001) }),
    ]) {
      await expect(
        createProvider({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(completionResponse(content)) }).draftClaim(claimOperation),
      ).rejects.toThrow();
    }
    await expect(
      createProvider({
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(completionResponse('```json\n{"text":" Claim ","note":" Note "}\n```')),
      }).draftClaim(claimOperation),
    ).resolves.toMatchObject({ text: "Claim", note: "Note" });
  });

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
      response_format: { json_schema: { name: string; schema: { required: string[] } } };
    };
    expect(body).toMatchObject({ model: "test-model", temperature: 0.2, stream: false });
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body.messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(body.messages[0]?.content).toContain("return the replacement passage in the required response schema");
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "kirjolab_revision",
        strict: true,
        schema: {
          type: "object",
          properties: { replacement: { type: "string" } },
          required: ["replacement"],
          additionalProperties: false,
        },
      },
    });
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

  it("passes an explicit reasoning effort to compatible local models", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completionResponse("replacement"));
    await createProvider({ fetcher, reasoningEffort: "none" }).reviseSelection(operation);

    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({ reasoning_effort: "none" });
    expect(() =>
      Reflect.construct(OpenAICompatibleBrowserProvider, [
        {
          endpoint: "http://127.0.0.1:1234/v1/chat/completions",
          providerLabel: "Local test model",
          model: "test-model",
          reasoningEffort: "extreme",
        },
      ]),
    ).toThrow("reasoning effort is invalid");
  });

  it.each(["low", "medium", "high"] as const)("passes the %s reasoning effort unchanged", async (reasoningEffort) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completionResponse("replacement"));
    await createProvider({ fetcher, reasoningEffort }).reviseSelection(operation);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toHaveProperty("reasoning_effort", reasoningEffort);
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
      [completionResponse('{"ok":true,"message":"wrapped replacement"}'), "invalid structured revision"],
      [completionResponse('{"replacement":"valid","extra":true}'), "invalid structured revision"],
      [completionResponse('{"replacement":1}'), "invalid structured revision"],
      [completionResponse("{}"), "invalid structured revision"],
      [completionResponse('{"replacement":'), "malformed structured revision"],
      [completionResponse("x".repeat(50_001)), "exceeds 50000 characters"],
    ] as const) {
      const provider = createProvider({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(response) });
      await expect(provider.reviseSelection(operation)).rejects.toThrow(message);
    }
  });

  it("explains reasoning-only responses instead of treating them as blank prose", async () => {
    const exhausted = jsonResponse({
      choices: [{ finish_reason: "length", message: { content: "", reasoning_content: "unfinished analysis" } }],
    });
    await expect(
      createProvider({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(exhausted) }).reviseSelection(operation),
    ).rejects.toThrow("exhausted its output budget in reasoning");

    const missingFinal = jsonResponse({
      choices: [{ finish_reason: "stop", message: { content: "", reasoning_content: "analysis only" } }],
    });
    await expect(
      createProvider({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(missingFinal) }).reviseSelection(operation),
    ).rejects.toThrow("reasoning without a final answer");
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
    ['{"replacement":"Structured replacement"}', "Structured replacement"],
    ['```json\n{"replacement":"Fenced structured replacement"}\n```', "Fenced structured replacement"],
    ["  preserve plain whitespace  ", "  preserve plain whitespace  "],
    ["prefix ```md\nnot an outer fence\n```", "prefix ```md\nnot an outer fence\n```"],
    ["```json\nnot a Markdown fence\n```", "```json\nnot a Markdown fence\n```"],
  ])("normalizes provider output %j without changing inline replacement semantics", async (content, replacement) => {
    const provider = createProvider({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(completionResponse(content)) });

    await expect(provider.reviseSelection(operation)).resolves.toMatchObject({ replacement });
  });
});

describe("OpenAI-compatible model discovery", () => {
  it("derives the bounded model-list endpoint and returns unique model ids", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [{ id: "qwen/qwen3.5-9b" }, { id: "gemma/local" }, { id: "qwen/qwen3.5-9b" }],
      }),
    );

    await expect(discoverOpenAICompatibleModels("http://127.0.0.1:1234/v1/chat/completions", { fetcher })).resolves.toEqual([
      "qwen/qwen3.5-9b",
      "gemma/local",
    ]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("http://127.0.0.1:1234/v1/models");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      credentials: "omit",
      redirect: "error",
      headers: { accept: "application/json" },
    });
  });

  it("normalizes bounded identifiers and strips completion endpoint query data", async () => {
    const exactId = "x".repeat(256);
    const listing = { data: [{ id: `  qwen/local  ` }, { id: exactId }] };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(listing));
    await expect(
      discoverOpenAICompatibleModels("http://localhost:1234/v1/chat/completions?ignored=true#fragment", { fetcher }),
    ).resolves.toEqual(["qwen/local", exactId]);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("http://localhost:1234/v1/models");

    await expect(
      discoverOpenAICompatibleModels("http://localhost:1234/v1/chat/completions", {
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(jsonResponse({ data: Array.from({ length: 256 }, (_, index) => ({ id: `model-${index}` })) })),
      }),
    ).resolves.toHaveLength(256);
  });

  it("reports provider failures and honors caller cancellation", async () => {
    await expect(
      discoverOpenAICompatibleModels("http://localhost:1234/v1/chat/completions", {
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })),
      }),
    ).rejects.toThrow("discovery failed (503)");

    const alreadyAborted = new AbortController();
    alreadyAborted.abort(new Error("discovery cancelled"));
    await expect(
      discoverOpenAICompatibleModels("http://localhost:1234/v1/chat/completions", { signal: alreadyAborted.signal }),
    ).rejects.toThrow("discovery cancelled");

    const caller = new AbortController();
    const pending = discoverOpenAICompatibleModels("http://localhost:1234/v1/chat/completions", {
      signal: caller.signal,
      fetcher: abortableFetch(),
    });
    caller.abort(new Error("stop discovery"));
    await expect(pending).rejects.toThrow("stop discovery");
  });

  it("times out model discovery after ten seconds", async () => {
    vi.useFakeTimers();
    const pending = discoverOpenAICompatibleModels("http://localhost:1234/v1/chat/completions", { fetcher: abortableFetch() });
    const expectation = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(10_000);
    await expectation;
  });

  it("fails closed on unsupported routes and malformed or excessive listings", async () => {
    await expect(discoverOpenAICompatibleModels("http://127.0.0.1:1234/custom")).rejects.toThrow("must end with");
    for (const value of [
      {},
      { data: [{ name: "missing-id" }] },
      { data: [{ id: "" }] },
      { data: [{ id: "x".repeat(257) }] },
      { data: Array.from({ length: 257 }, (_, index) => ({ id: String(index) })) },
    ]) {
      await expect(
        discoverOpenAICompatibleModels("http://127.0.0.1:1234/v1/chat/completions", {
          fetcher: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(value)),
        }),
      ).rejects.toThrow();
    }
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
