import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const projectRoot = new URL("..", import.meta.url);
const artifacts = [
  ["Browser application", ".generated/app.txt"],
  ["Lazy Markdown runtime", "markdown-module"],
  ["Lazy PDF.js runtime", "pdfjs-module"],
  ["Styles", ".generated/styles.css"],
];

export function productionDependencyMetrics(packageJson, packageLock) {
  const packages = new Set();
  for (const [path, metadata] of Object.entries(packageLock.packages ?? {})) {
    if (!path || metadata.dev || !metadata.version || !path.includes("node_modules/")) continue;
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    packages.add(`${name}@${metadata.version}`);
  }
  return {
    direct: Object.keys(packageJson.dependencies ?? {}).length,
    packageVersions: packages.size,
  };
}

export function bufferCost(contents) {
  return { rawBytes: contents.byteLength, gzipBytes: gzipSync(contents, { level: 9 }).byteLength };
}

export function runtimeAsset(names, stem) {
  const matches = names.filter((name) => new RegExp(`^${stem}-[a-f0-9]+\\.js$`, "u").test(name));
  if (matches.length !== 1) throw new Error(`Expected one built ${stem} asset; run npm run build first`);
  return `.generated/assets/${matches[0]}`;
}

export function dependencyCostMarkdown(report) {
  const rows = report.artifacts
    .map(({ name, rawBytes, gzipBytes }) => `| ${name} | ${rawBytes.toLocaleString("en-US")} B | ${gzipBytes.toLocaleString("en-US")} B |`)
    .join("\n");
  return [
    "# Dependency Cost Report",
    "",
    `- Direct production dependencies: ${report.dependencies.direct}`,
    `- Unique production package/version nodes: ${report.dependencies.packageVersions}`,
    "",
    "| Artifact | Raw | Gzip |",
    "| --- | ---: | ---: |",
    rows,
  ].join("\n");
}

export async function dependencyCostReport(root = projectRoot) {
  const rootPath = root instanceof URL ? root : pathToFileURL(`${root}/`);
  const [packageJson, packageLock, assetNames] = await Promise.all([
    readJson(new URL("package.json", rootPath)),
    readJson(new URL("package-lock.json", rootPath)),
    readdir(new URL(".generated/assets/", rootPath)),
  ]);
  const measured = [];
  for (const [name, configuredPath] of artifacts) {
    const path = configuredPath.includes(".generated/") ? configuredPath : runtimeAsset(assetNames, configuredPath);
    measured.push({ name, ...bufferCost(await readFile(new URL(path, rootPath))) });
  }
  return { dependencies: productionDependencyMetrics(packageJson, packageLock), artifacts: measured };
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const report = await dependencyCostReport();
  console.log(process.argv.includes("--json") ? JSON.stringify(report, null, 2) : dependencyCostMarkdown(report));
}
