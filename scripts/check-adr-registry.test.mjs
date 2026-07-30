import assert from "node:assert/strict";
import test from "node:test";

import { validateAdrRegistry } from "./check-adr-registry.mjs";

function record(id, title, options = {}) {
  const name = `ADR-${id}-${title.toLowerCase().replaceAll(" ", "-")}.md`;
  const status = options.status ?? "Implemented";
  const date = id === "000" ? "" : "\n\n**Date:** 2026-07-30";
  return {
    content: `# ADR-${id}: ${title}\n\n**Status:** ${status}${date}\n`,
    directory: options.directory ?? "implemented",
    name,
  };
}

test("accepts unique, indexed ADRs with matching lifecycle metadata", () => {
  const records = [record("000", "Template", { directory: "proposed", status: "Proposed" }), record("001", "Use SQLite")];
  const index = records
    .map(({ directory, name }) => `| [${name.slice(0, 7)}](./${directory}/${name}) | Implemented | Summary |`)
    .join("\n");

  assert.deepEqual(validateAdrRegistry(records, index), []);
});

test("reports duplicate identifiers and records missing from the index", () => {
  const records = [record("001", "Use SQLite"), record("001", "Use Durable Objects")];

  assert.deepEqual(validateAdrRegistry(records, ""), [
    "implemented/ADR-001-use-sqlite.md: ADR index must reference the record exactly once (found 0)",
    "ADR-001: duplicate identifiers in implemented/ADR-001-use-sqlite.md and implemented/ADR-001-use-durable-objects.md",
    "implemented/ADR-001-use-durable-objects.md: ADR index must reference the record exactly once (found 0)",
  ]);
});

test("reports mismatched headings, lifecycle metadata, dates, and broken ADR links", () => {
  const invalid = {
    content: "# ADR-009: Wrong\n\n**Status:** Proposed\n\nSee [missing](./ADR-999-missing.md).\n",
    directory: "implemented",
    name: "ADR-010-right.md",
  };

  assert.deepEqual(validateAdrRegistry([invalid], "| [ADR-010](./implemented/ADR-010-right.md) | Implemented | Summary |"), [
    "implemented/ADR-010-right.md: heading must use ADR-010",
    "implemented/ADR-010-right.md: implemented ADR cannot have Proposed status",
    "implemented/ADR-010-right.md: missing YYYY-MM-DD decision date",
    "implemented/ADR-010-right.md: broken ADR link to ADR-999-missing.md",
  ]);
});
