import assert from "node:assert/strict";
import test from "node:test";

import { bufferCost, dependencyCostMarkdown, productionDependencyMetrics, runtimeAsset } from "./report-dependency-costs.mjs";

test("counts direct and unique production package versions from the lockfile", () => {
  assert.deepEqual(
    productionDependencyMetrics(
      { dependencies: { alpha: "1.0.0", beta: "2.0.0" } },
      {
        packages: {
          "": { version: "1.0.0" },
          "node_modules/alpha": { version: "1.0.0" },
          "node_modules/beta": { version: "2.0.0" },
          "node_modules/beta/node_modules/alpha": { version: "1.0.0" },
          "node_modules/test-only": { version: "3.0.0", dev: true },
        },
      },
    ),
    { direct: 2, packageVersions: 2 },
  );
});

test("selects exactly one fingerprinted runtime asset", () => {
  assert.equal(runtimeAsset(["markdown-module-abc123.js"], "markdown-module"), ".generated/assets/markdown-module-abc123.js");
  assert.throws(() => runtimeAsset([], "markdown-module"), /run npm run build/u);
  assert.throws(() => runtimeAsset(["markdown-module-a.js", "markdown-module-b.js"], "markdown-module"), /Expected one built/u);
});

test("reports raw and deterministic gzip sizes as Markdown", () => {
  const cost = bufferCost(Buffer.from("repeat ".repeat(100)));
  assert.equal(cost.rawBytes, 700);
  assert.ok(cost.gzipBytes < cost.rawBytes);
  assert.match(
    dependencyCostMarkdown({
      dependencies: { direct: 2, packageVersions: 3 },
      artifacts: [{ name: "Browser application", ...cost }],
    }),
    /Direct production dependencies: 2[\s\S]*Browser application \| 700 B/u,
  );
});
