import { build } from "esbuild";

const result = await build({
  entryPoints: ["scripts/pdf-reference-quality-entry.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  write: false,
});
const output = result.outputFiles[0];
if (!output) throw new Error("PDF reference quality report did not produce an executable bundle");
await import(`data:text/javascript;base64,${Buffer.from(output.contents).toString("base64")}`);
