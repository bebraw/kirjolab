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
    const id = adrId(record.name);
    if (!id) {
      errors.push(`${record.directory}/${record.name}: filename must match ADR-NNN-kebab-title.md`);
      continue;
    }
    const previous = ids.get(id);
    if (previous) errors.push(`ADR-${id}: duplicate identifiers in ${previous} and ${record.directory}/${record.name}`);
    else ids.set(id, `${record.directory}/${record.name}`);
    errors.push(...recordErrors(record, id, names, indexedTargets));
  }

  return errors;
}

function adrId(name) {
  return /^ADR-(\d{3})-[a-z0-9-]+\.md$/u.exec(name)?.[1];
}

function recordErrors(record, id, names, indexedTargets) {
  return [
    ...headingErrors(record, id),
    ...statusErrors(record),
    ...dateErrors(record, id),
    ...indexErrors(record, indexedTargets),
    ...linkErrors(record, names),
  ];
}

function headingErrors(record, id) {
  const heading = /^# ADR-(\d{3}): .+$/mu.exec(record.content);
  return heading?.[1] === id ? [] : [`${record.directory}/${record.name}: heading must use ADR-${id}`];
}

function statusErrors(record) {
  const status = /^\*\*Status:\*\* (.+)$/mu.exec(record.content)?.[1];
  const path = `${record.directory}/${record.name}`;
  if (!status) return [`${path}: missing single-line ADR status`];
  if (record.directory === "proposed" && status !== "Proposed") return [`${path}: proposed ADR must have Proposed status`];
  if (record.directory === "accepted" && status !== "Accepted") return [`${path}: accepted ADR must have Accepted status`];
  if (record.directory === "implemented" && status === "Proposed") return [`${path}: implemented ADR cannot have Proposed status`];
  return [];
}

function dateErrors(record, id) {
  return id === "000" || /^\*\*Date:\*\* \d{4}-\d{2}-\d{2}$/mu.test(record.content)
    ? []
    : [`${record.directory}/${record.name}: missing YYYY-MM-DD decision date`];
}

function indexErrors(record, indexedTargets) {
  const path = `${record.directory}/${record.name}`;
  const target = `./${path}`;
  const count = indexedTargets.filter((candidate) => candidate === target).length;
  return count === 1 ? [] : [`${path}: ADR index must reference the record exactly once (found ${count})`];
}

function linkErrors(record, names) {
  const path = `${record.directory}/${record.name}`;
  return [...record.content.matchAll(/\]\(\.\/(ADR-\d{3}-[a-z0-9-]+\.md)(?:#[^)]+)?\)/gu)]
    .map((match) => match[1])
    .filter((name) => !names.has(name))
    .map((name) => `${path}: broken ADR link to ${name}`);
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
