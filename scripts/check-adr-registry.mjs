import { readFile, readdir } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

const projectRoot = new URL("..", import.meta.url);
const adrDirectories = ["proposed", "accepted", "implemented"];

export async function adrRegistryErrors(root = projectRoot) {
  const rootUrl = root instanceof URL ? root : pathToFileURL(`${root}/`);
  const adrRoot = new URL("docs/adrs/", rootUrl);
  const index = await readFile(new URL("README.md", adrRoot), "utf8");
  const records = [];

  for (const directory of adrDirectories) {
    const directoryUrl = new URL(`${directory}/`, adrRoot);
    for (const name of (await readdir(directoryUrl)).filter((entry) => entry.endsWith(".md")).sort()) {
      records.push({
        content: await readFile(new URL(name, directoryUrl), "utf8"),
        directory,
        name,
      });
    }
  }

  return validateAdrRegistry(records, index);
}

export function validateAdrRegistry(records, index) {
  const errors = [];
  const ids = new Map();
  const names = new Set(records.map(({ name }) => name));
  const indexedTargets = [...index.matchAll(/^\| \[ADR-\d{3}\]\((\.\/[^)]+)\)/gmu)].map((match) => match[1]);

  for (const record of records) {
    const filenameMatch = /^ADR-(\d{3})-[a-z0-9-]+\.md$/u.exec(record.name);
    if (!filenameMatch) {
      errors.push(`${record.directory}/${record.name}: filename must match ADR-NNN-kebab-title.md`);
      continue;
    }

    const id = filenameMatch[1];
    const previous = ids.get(id);
    if (previous) errors.push(`ADR-${id}: duplicate identifiers in ${previous} and ${record.directory}/${record.name}`);
    else ids.set(id, `${record.directory}/${record.name}`);

    const heading = /^# ADR-(\d{3}): .+$/mu.exec(record.content);
    if (!heading || heading[1] !== id) errors.push(`${record.directory}/${record.name}: heading must use ADR-${id}`);

    const status = /^\*\*Status:\*\* (.+)$/mu.exec(record.content)?.[1];
    if (!status) errors.push(`${record.directory}/${record.name}: missing single-line ADR status`);
    if (record.directory === "proposed" && status !== "Proposed") {
      errors.push(`${record.directory}/${record.name}: proposed ADR must have Proposed status`);
    }
    if (record.directory === "accepted" && status !== "Accepted") {
      errors.push(`${record.directory}/${record.name}: accepted ADR must have Accepted status`);
    }
    if (record.directory === "implemented" && status === "Proposed") {
      errors.push(`${record.directory}/${record.name}: implemented ADR cannot have Proposed status`);
    }

    if (id !== "000" && !/^\*\*Date:\*\* \d{4}-\d{2}-\d{2}$/mu.test(record.content)) {
      errors.push(`${record.directory}/${record.name}: missing YYYY-MM-DD decision date`);
    }

    const indexTarget = `./${record.directory}/${record.name}`;
    const indexOccurrences = indexedTargets.filter((target) => target === indexTarget).length;
    if (indexOccurrences !== 1) {
      errors.push(`${record.directory}/${record.name}: ADR index must reference the record exactly once (found ${indexOccurrences})`);
    }

    for (const match of record.content.matchAll(/\]\(\.\/(ADR-\d{3}-[a-z0-9-]+\.md)(?:#[^)]+)?\)/gu)) {
      if (!names.has(match[1])) errors.push(`${record.directory}/${record.name}: broken ADR link to ${match[1]}`);
    }
  }

  return errors;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const errors = await adrRegistryErrors();
  if (errors.length > 0) {
    console.error(["ADR registry validation failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
    process.exitCode = 1;
  } else {
    console.log("ADR registry is consistent.");
  }
}
