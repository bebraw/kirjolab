import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCodexProcessOptions, createCodexSdkRunner, validateCodexCompanionHome, type CodexSdkClient } from "./codex-model-backend";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("Codex model backend", () => {
  it("gives the Codex child a synthetic home and an allowlisted environment", () => {
    expect(
      createCodexProcessOptions("/private/tmp/kirjolab-codex-home", {
        CODEX_HOME: "/Users/researcher/.codex",
        HOME: "/Users/researcher",
        KIRJOLAB_MODEL_UPSTREAM: "http://127.0.0.1:1234/v1/chat/completions",
        LANG: "en_US.UTF-8",
        OPENAI_API_KEY: "must-not-leak",
        PATH: "/usr/bin:/bin",
        XDG_CONFIG_HOME: "/Users/researcher/.config",
      }),
    ).toEqual({
      config: expect.objectContaining({
        cli_auth_credentials_store: "file",
        features: expect.objectContaining({
          browser_use: false,
          hooks: false,
          multi_agent: false,
          plugins: false,
          shell_tool: false,
          unified_exec: false,
        }),
        history: { persistence: "none" },
        project_root_markers: [".kirjolab-codex-root"],
      }),
      env: {
        CODEX_HOME: "/private/tmp/kirjolab-codex-home",
        HOME: "/private/tmp/kirjolab-codex-home",
        LANG: "en_US.UTF-8",
        PATH: "/usr/bin:/bin",
        USERPROFILE: "/private/tmp/kirjolab-codex-home",
      },
    });
  });

  it("requires a dedicated regular file-backed home without caller customization", async () => {
    const home = await temporaryDirectory("home");
    await expect(validateCodexCompanionHome(home)).rejects.toThrow("auth.json");

    await writeFile(join(home, "auth.json"), "{}", { mode: 0o600 });
    await expect(validateCodexCompanionHome(home)).resolves.toBeUndefined();

    await writeFile(join(home, "config.toml"), "model = 'unexpected'");
    await expect(validateCodexCompanionHome(home)).rejects.toThrow("config.toml");
    await rm(join(home, "config.toml"));

    await mkdir(join(home, "skills", "custom"), { recursive: true });
    await expect(validateCodexCompanionHome(home)).rejects.toThrow("skills/custom");
  });

  it("maps a structured Kirjolab request to one isolated Codex thread and removes its request directory", async () => {
    let workingDirectory = "";
    const run = vi.fn(async (_prompt: string, _options?: { outputSchema?: unknown; signal?: AbortSignal }) => ({
      finalResponse: '{"replacement":"Reviewed prose."}',
    }));
    const client: CodexSdkClient = {
      startThread(options) {
        workingDirectory = options.workingDirectory;
        expect(options).toMatchObject({
          approvalPolicy: "never",
          model: "gpt-5.6-terra",
          modelReasoningEffort: "minimal",
          networkAccessEnabled: false,
          sandboxMode: "read-only",
          skipGitRepoCheck: true,
          webSearchEnabled: false,
          webSearchMode: "disabled",
        });
        return { run };
      },
    };
    const runner = createCodexSdkRunner(client);
    const controller = new AbortController();
    const outputSchema = { type: "object", required: ["replacement"] };

    await expect(
      runner.run({
        messages: [
          { role: "system", content: "Return one replacement." },
          { role: "user", content: "Revise the selected passage." },
        ],
        model: "gpt-5.6-terra",
        outputSchema,
        reasoningEffort: "none",
        signal: controller.signal,
      }),
    ).resolves.toEqual({ finalResponse: '{"replacement":"Reviewed prose."}' });

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]?.[0]).toContain('"role":"system"');
    expect(run.mock.calls[0]?.[0]).toContain('"content":"Revise the selected passage."');
    expect(run.mock.calls[0]?.[1]).toEqual({ outputSchema, signal: controller.signal });
    await expect(access(workingDirectory)).rejects.toThrow();
  });

  it.each([
    ["provider-default", "medium"],
    ["low", "low"],
    ["medium", "medium"],
    ["high", "high"],
  ] as const)("maps %s reasoning to %s", async (reasoningEffort, expected) => {
    const startThread = vi.fn(() => ({ run: vi.fn(async () => ({ finalResponse: "{}" })) }));
    const runner = createCodexSdkRunner({ startThread });

    await runner.run({
      messages: [{ role: "user", content: "Return the schema." }],
      model: "gpt-5.6-terra",
      outputSchema: { type: "object" },
      reasoningEffort,
      signal: new AbortController().signal,
    });

    expect(startThread).toHaveBeenCalledWith(expect.objectContaining({ modelReasoningEffort: expected }));
  });

  it("cleans the isolated request directory when Codex fails", async () => {
    let workingDirectory = "";
    const failure = new Error("upstream failure");
    const runner = createCodexSdkRunner({
      startThread(options) {
        workingDirectory = options.workingDirectory;
        return { run: vi.fn(async () => Promise.reject(failure)) };
      },
    });

    await expect(
      runner.run({
        messages: [{ role: "user", content: "Return the schema." }],
        model: "gpt-5.6-terra",
        outputSchema: { type: "object" },
        reasoningEffort: "medium",
        signal: new AbortController().signal,
      }),
    ).rejects.toBe(failure);
    await expect(access(workingDirectory)).rejects.toThrow();
  });
});

async function temporaryDirectory(label: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `kirjolab-codex-${label}-`));
  temporaryDirectories.push(directory);
  return directory;
}
