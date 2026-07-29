import type Cytoscape from "cytoscape";

export type CytoscapeRuntime = typeof Cytoscape;

declare const __CYTOSCAPE_RUNTIME_URL__: string;

const cytoscapeRuntimeUrl =
  typeof __CYTOSCAPE_RUNTIME_URL__ === "undefined" ? "/cytoscape-module-development.js" : __CYTOSCAPE_RUNTIME_URL__;
let runtimePromise: Promise<CytoscapeRuntime> | null = null;

export async function loadCytoscapeRuntime(): Promise<CytoscapeRuntime> {
  const pending = runtimePromise ?? importCytoscapeRuntime();
  runtimePromise = pending;
  try {
    return await pending;
  } catch (error) {
    if (runtimePromise === pending) runtimePromise = null;
    throw error;
  }
}

async function importCytoscapeRuntime(): Promise<CytoscapeRuntime> {
  const module = await import(cytoscapeRuntimeUrl);
  return module.default as CytoscapeRuntime;
}
