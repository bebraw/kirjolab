import type * as Markdown from "../domain/markdown";

export type MarkdownRuntime = Pick<typeof Markdown, "renderWorkspaceMarkdown">;

declare const __MARKDOWN_RUNTIME_URL__: string;

const markdownRuntimeUrl = typeof __MARKDOWN_RUNTIME_URL__ === "undefined" ? "/markdown-module-development.js" : __MARKDOWN_RUNTIME_URL__;
let runtimePromise: Promise<MarkdownRuntime> | null = null;

export async function loadMarkdownRuntime(): Promise<MarkdownRuntime> {
  const pending = runtimePromise ?? importMarkdownRuntime();
  runtimePromise = pending;
  try {
    return await pending;
  } catch (error) {
    if (runtimePromise === pending) runtimePromise = null;
    throw error;
  }
}

async function importMarkdownRuntime(): Promise<MarkdownRuntime> {
  return await import(markdownRuntimeUrl);
}
