import type * as Markdown from "../domain/markdown";

export type MarkdownRuntime = Pick<typeof Markdown, "renderWorkspaceMarkdown">;

const markdownRuntimeUrl = "/markdown-module-1.js";
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
