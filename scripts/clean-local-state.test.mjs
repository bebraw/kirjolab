import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cleanLocalState, localCleanupTargets } from "./clean-local-state.mjs";

test("cleans only disposable targets while preserving local application state", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "kirjolab-clean-test-"));
  context.after(async () => await import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })));
  for (const target of localCleanupTargets) {
    await mkdir(join(root, target), { recursive: true });
    await writeFile(join(root, target, "artifact"), target);
  }
  await mkdir(join(root, ".wrangler/state"), { recursive: true });
  await writeFile(join(root, ".wrangler/state/database"), "preserve");
  await mkdir(join(root, ".generated"), { recursive: true });
  await writeFile(join(root, ".generated/build-output"), "preserve");

  const removed = await cleanLocalState(root);

  assert.deepEqual(
    removed.map((target) => target.relativePath),
    localCleanupTargets,
  );
  assert.equal(await readFile(join(root, ".wrangler/state/database"), "utf8"), "preserve");
  assert.equal(await readFile(join(root, ".generated/build-output"), "utf8"), "preserve");
});

test("refuses a symbolic-link cleanup root", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "kirjolab-clean-link-test-"));
  context.after(async () => await import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })));
  const external = join(root, "external");
  await mkdir(external);
  await writeFile(join(external, "preserve"), "outside");
  await mkdir(join(root, ".cache"));
  await symlink(external, join(root, ".cache/prettier"));

  await assert.rejects(cleanLocalState(root), /symbolic-link target/u);
  assert.equal(await readFile(join(external, "preserve"), "utf8"), "outside");
});
