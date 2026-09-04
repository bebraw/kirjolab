import type { CodexOptions } from "@openai/codex-sdk";
import { lstat, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

const projectRootMarker = ".kirjolab-codex-root";

export type CodexChatRole = "assistant" | "system" | "user";

export interface CodexChatMessage {
  readonly role: CodexChatRole;
  readonly content: string;
}

export type KirjolabReasoningEffort = "provider-default" | "none" | "low" | "medium" | "high";
export type CodexReasoningEffort = "minimal" | "low" | "medium" | "high";

export interface CodexGenerationRequest {
  readonly messages: readonly CodexChatMessage[];
  readonly model: string;
  readonly outputSchema: Record<string, unknown>;
  readonly reasoningEffort: KirjolabReasoningEffort;
  readonly signal: AbortSignal;
}

export interface CodexGenerationResult {
  readonly finalResponse: string;
}

export interface CodexGenerationRunner {
  run(request: CodexGenerationRequest): Promise<CodexGenerationResult>;
}

export interface CodexSdkThreadOptions {
  readonly approvalPolicy: "never";
  readonly model: string;
  readonly modelReasoningEffort: CodexReasoningEffort;
  readonly networkAccessEnabled: false;
  readonly sandboxMode: "read-only";
  readonly skipGitRepoCheck: true;
  readonly webSearchEnabled: false;
  readonly webSearchMode: "disabled";
  readonly workingDirectory: string;
}

export interface CodexSdkClient {
  startThread(options: CodexSdkThreadOptions): {
    run(prompt: string, options?: { readonly outputSchema?: unknown; readonly signal?: AbortSignal }): Promise<CodexGenerationResult>;
  };
}

export interface CodexProcessOptions {
  readonly config: NonNullable<CodexOptions["config"]>;
  readonly env: Record<string, string>;
}

export const codexChildEnvironmentAllowlist = [
  "ALL_PROXY",
  "APPDATA",
  "CODEX_CA_CERTIFICATE",
  "COMSPEC",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LOCALAPPDATA",
  "LOGNAME",
  "NODE_EXTRA_CA_CERTS",
  "NO_PROXY",
  "PATH",
  "PATHEXT",
  "PROGRAMDATA",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "SYSTEMROOT",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "TZ",
  "USER",
  "all_proxy",
  "http_proxy",
  "https_proxy",
  "no_proxy",
] as const;

const forbiddenCodexHomeEntries = [
  ".agents",
  "AGENTS.override.md",
  "AGENTS.md",
  "config.toml",
  "hooks",
  "plugins",
  "requirements.toml",
  "rules",
] as const;

export function createCodexProcessOptions(
  codexHome: string,
  sourceEnvironment: Readonly<Record<string, string | undefined>> = process.env,
): CodexProcessOptions {
  if (!isAbsolute(codexHome)) throw new TypeError("The Codex companion home must be an absolute path");
  const env: Record<string, string> = {};
  for (const name of codexChildEnvironmentAllowlist) {
    const value = sourceEnvironment[name];
    if (value !== undefined) env[name] = value;
  }
  env.CODEX_HOME = codexHome;
  env.HOME = codexHome;
  env.USERPROFILE = codexHome;

  return {
    config: {
      cli_auth_credentials_store: "file",
      features: {
        apps: false,
        auth_elicitation: false,
        browser_use: false,
        browser_use_external: false,
        browser_use_full_cdp_access: false,
        code_mode: false,
        code_mode_host: false,
        computer_use: false,
        goals: false,
        hooks: false,
        image_generation: false,
        in_app_browser: false,
        multi_agent: false,
        plugins: false,
        remote_plugin: false,
        shell_snapshot: false,
        shell_tool: false,
        skill_mcp_dependency_install: false,
        skill_search: false,
        tool_call_mcp_elicitation: false,
        tool_suggest: false,
        unified_exec: false,
        view_image: false,
        workspace_dependencies: false,
      },
      history: { persistence: "none" },
      project_root_markers: [projectRootMarker],
      tools: { web_search: false },
    },
    env,
  };
}

export async function validateCodexCompanionHome(codexHome: string): Promise<void> {
  if (!isAbsolute(codexHome)) throw new TypeError("The Codex companion home must be an absolute path");
  const home = await requiredStats(codexHome, "Dedicated Codex companion home does not exist");
  if (!home.isDirectory()) throw new TypeError("The dedicated Codex companion home must be a directory");

  const auth = await requiredStats(join(codexHome, "auth.json"), "Dedicated Codex companion home does not contain auth.json");
  if (!auth.isFile()) throw new TypeError("Dedicated Codex authentication must be a regular auth.json file");

  const forbiddenEntries: string[] = [];
  for (const entry of forbiddenCodexHomeEntries) {
    if (await pathExists(join(codexHome, entry))) forbiddenEntries.push(entry);
  }

  const skillsPath = join(codexHome, "skills");
  if (await pathExists(skillsPath)) {
    const skills = await lstat(skillsPath);
    if (!skills.isDirectory()) {
      forbiddenEntries.push("skills");
    } else {
      const entries = await readdir(skillsPath);
      for (const entry of entries) {
        if (entry !== ".system") forbiddenEntries.push(`skills/${entry}`);
      }
      if (entries.includes(".system") && !(await lstat(join(skillsPath, ".system"))).isDirectory()) {
        forbiddenEntries.push("skills/.system");
      }
    }
  }

  if (forbiddenEntries.length) {
    throw new TypeError(`Dedicated Codex companion home contains disallowed agent configuration: ${forbiddenEntries.join(", ")}`);
  }
}

export function createCodexSdkRunner(client: CodexSdkClient): CodexGenerationRunner {
  return {
    async run(request) {
      const requestDirectory = await mkdtemp(join(tmpdir(), "kirjolab-codex-request-"));
      try {
        await writeFile(join(requestDirectory, projectRootMarker), "");
        const thread = client.startThread({
          approvalPolicy: "never",
          model: request.model,
          modelReasoningEffort: mapReasoningEffort(request.reasoningEffort),
          networkAccessEnabled: false,
          sandboxMode: "read-only",
          skipGitRepoCheck: true,
          webSearchEnabled: false,
          webSearchMode: "disabled",
          workingDirectory: requestDirectory,
        });
        return await thread.run(buildCodexPrompt(request.messages), {
          outputSchema: request.outputSchema,
          signal: request.signal,
        });
      } finally {
        await rm(requestDirectory, { force: true, recursive: true }).catch(() => undefined);
      }
    },
  };
}

function buildCodexPrompt(messages: readonly CodexChatMessage[]): string {
  return [
    "Complete the structured Kirjolab chat request represented by the ordered JSON messages below.",
    "Honor system instructions before user instructions.",
    "Return only the JSON value required by the separately supplied output schema.",
    JSON.stringify(messages),
  ].join("\n\n");
}

function mapReasoningEffort(effort: KirjolabReasoningEffort): CodexReasoningEffort {
  if (effort === "none") return "minimal";
  if (effort === "provider-default") return "medium";
  return effort;
}

async function requiredStats(path: string, missingMessage: string): Promise<Awaited<ReturnType<typeof lstat>>> {
  try {
    return await lstat(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) throw new TypeError(missingMessage);
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return false;
    throw error;
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
