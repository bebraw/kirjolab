import { rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { getRepoRoot, run } from "./affected-file-utils.mjs";

const repoRoot = getRepoRoot();
rmSync(join(repoRoot, "reports", "stryker-incremental.json"), { force: true });
run(repoRoot, process.execPath, [
  join(repoRoot, "scripts", "run-mutation.mjs"),
  "--incremental",
  "--ignoreStatic",
  ...process.argv.slice(2),
]);
