import { rmSync } from "node:fs";
import { join } from "node:path";
import { getRepoRoot, run } from "./affected-file-utils.mjs";

const repoRoot = getRepoRoot();
rmSync(join(repoRoot, "reports", "stryker-incremental.json"), { force: true });
run(repoRoot, join(repoRoot, "node_modules", ".bin", "stryker"), ["run", "--incremental", "--ignoreStatic"]);
