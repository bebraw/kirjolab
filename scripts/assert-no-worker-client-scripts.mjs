import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const runtimeRoots = ["src/worker.ts", "src/views"];
const ignoredFilePatterns = [/\.test\.ts$/, /\.e2e\.ts$/, /\.d\.ts$/];

const disallowedPatterns = [
  {
    name: "inline <script> tag",
    pattern: /<script(?:\s|>|\/)/giu,
  },
  {
    name: "inline event handler attribute",
    pattern: /\son[a-z]+\s*=/giu,
  },
  {
    name: "javascript: URL",
    pattern: /javascript\s*:/giu,
  },
];

const files =
  process.argv.slice(2).length > 0 ? collectRequestedRuntimeFiles(process.argv.slice(2)) : await collectRuntimeFiles(runtimeRoots);
const violations = [];

for (const file of files) {
  const source = await readFile(file, "utf8");

  for (const { name, pattern } of disallowedPatterns) {
    for (const match of source.matchAll(pattern)) {
      violations.push(formatViolation(file, source, match.index ?? 0, name));
    }
  }
}

if (violations.length > 0) {
  console.error("Worker-rendered HTML must not contain untyped inline browser code.");
  console.error("Move browser behavior into typed TypeScript modules before serving it to clients.");
  console.error("");
  console.error(violations.join("\n"));
  process.exitCode = 1;
}

async function collectRuntimeFiles(paths) {
  const files = [];

  for (const path of paths) {
    const absolutePath = join(repoRoot, path);

    if (path.endsWith(".ts")) {
      files.push(absolutePath);
      continue;
    }

    files.push(...(await collectTypeScriptFiles(absolutePath)));
  }

  return files.filter((file) => ignoredFilePatterns.every((pattern) => !pattern.test(file))).sort();
}

function collectRequestedRuntimeFiles(paths) {
  return paths
    .filter((file) => (file === "src/worker.ts" || file.startsWith("src/views/")) && file.endsWith(".ts"))
    .filter((file) => ignoredFilePatterns.every((pattern) => !pattern.test(file)))
    .map((file) => join(repoRoot, file))
    .sort();
}

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(absolutePath);
    }
  }

  return files;
}

function formatViolation(file, source, index, name) {
  const location = getLocation(source, index);
  const line = source.split("\n")[location.line - 1]?.trim() ?? "";
  return `${relative(repoRoot, file)}:${location.line}:${location.column} - ${name}\n  ${line}`;
}

function getLocation(source, index) {
  const prefix = source.slice(0, index);
  const lines = prefix.split("\n");
  const currentLine = lines.at(-1) ?? "";

  return {
    line: lines.length,
    column: currentLine.length + 1,
  };
}
