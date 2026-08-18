import { readdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("paper-import production boundary", () => {
  it("does not depend on product domain, API, client, or project modules", async () => {
    const directory = dirname(fileURLToPath(import.meta.url));
    const files = (await readdir(directory)).filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"));
    const forbiddenRelative = /^(?:\.\.\/)+(?:domain|api|client|project|pdf-analysis)(?:\/|$)/u;
    const allowedBareImports = new Set(["fflate"]);
    const violations: string[] = [];

    for (const path of files) {
      const source = await readFile(`${directory}/${path}`, "utf8");
      const targets = [...source.matchAll(/(?:\bfrom\s+|\bimport\s*\()\s*["']([^"']+)["']/gu)].map((match) => match[1] ?? "");
      for (const target of targets) {
        const bareImport = !target.startsWith(".") && !target.startsWith("/");
        if (forbiddenRelative.test(target) || (bareImport && !allowedBareImports.has(target))) {
          violations.push(`${path}: ${target}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
