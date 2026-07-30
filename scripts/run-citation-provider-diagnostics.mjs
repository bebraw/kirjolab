import { build } from "esbuild";

const result = await build({
  entryPoints: ["scripts/citation-provider-diagnostics-entry.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  write: false,
});
const output = result.outputFiles[0];
if (!output) throw new Error("Citation provider diagnostics did not produce an executable bundle");
await import(`data:text/javascript;base64,${Buffer.from(output.contents).toString("base64")}`);
