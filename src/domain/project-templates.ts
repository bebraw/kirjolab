import { normalizeProjectPath, projectEntryPath } from "./project-files";
import {
  defaultBibliography,
  defaultGuidePath,
  defaultGuideSource,
  defaultProjectPublicationProfile,
  defaultSource,
  defaultTransclusionPath,
  defaultTransclusionSource,
  isProjectPublicationProfile,
  type ProjectPublicationProfile,
  type WorkspaceSnapshot,
} from "./workspace";

export type ProjectTemplateSource = "built-in" | "personal";

export interface ProjectTemplateFileSeed {
  readonly path: string;
  readonly content: string;
}

export interface ProjectTemplateSeed {
  readonly schemaVersion: 1;
  readonly files: readonly ProjectTemplateFileSeed[];
  readonly folders: readonly string[];
  readonly bibliography: string;
  readonly publicationProfile: ProjectPublicationProfile;
}

export interface ProjectTemplateSummary {
  readonly id: string;
  readonly source: ProjectTemplateSource;
  readonly name: string;
  readonly description: string;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface ProjectTemplateRecord extends ProjectTemplateSummary {
  readonly seed: ProjectTemplateSeed;
}

export interface SaveProjectTemplateInput {
  readonly name: string;
  readonly description?: string;
  readonly templateId?: string;
}

const maximumSeedBytes = 2 * 1024 * 1024;
const maximumSeedFiles = 512;
const personalTemplateId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const guidedSeed: ProjectTemplateSeed = {
  schemaVersion: 1,
  files: [
    { path: projectEntryPath, content: defaultSource },
    { path: defaultGuidePath, content: defaultGuideSource },
    { path: defaultTransclusionPath, content: defaultTransclusionSource },
  ],
  folders: ["figures", "sections"],
  bibliography: defaultBibliography,
  publicationProfile: defaultProjectPublicationProfile,
};

const blankSeed: ProjectTemplateSeed = {
  schemaVersion: 1,
  files: [{ path: projectEntryPath, content: "" }],
  folders: ["figures"],
  bibliography: "",
  publicationProfile: defaultProjectPublicationProfile,
};

const researchArticleSeed: ProjectTemplateSeed = {
  schemaVersion: 1,
  files: [
    {
      path: projectEntryPath,
      content: `## Abstract {#abstract}

Summarize the question, approach, result, and significance.

::include[sections/introduction.md]

::include[sections/methods.md]

::include[sections/results.md]

::include[sections/discussion.md]

## References {#references}

::bibliography[]
`,
    },
    {
      path: "sections/introduction.md",
      content: `## Introduction {#introduction}

Establish the problem, prior work, and research question.
`,
    },
    {
      path: "sections/methods.md",
      content: `## Methods {#methods}

Describe materials, data, procedures, and analysis.
`,
    },
    {
      path: "sections/results.md",
      content: `## Results {#results}

Report the findings without interpreting them prematurely.
`,
    },
    {
      path: "sections/discussion.md",
      content: `## Discussion {#discussion}

Interpret the findings, limitations, and implications.
`,
    },
  ],
  folders: ["figures", "sections"],
  bibliography: "",
  publicationProfile: defaultProjectPublicationProfile,
};

const literatureReviewSeed: ProjectTemplateSeed = {
  schemaVersion: 1,
  files: [
    {
      path: projectEntryPath,
      content: `## Review question {#review-question}

State the scope and the question this review answers.

::include[sections/search-strategy.md]

::include[sections/synthesis.md]

::include[sections/gaps.md]

## References {#references}

::bibliography[]
`,
    },
    {
      path: "sections/search-strategy.md",
      content: `## Search strategy {#search-strategy}

Record databases, terms, dates, and inclusion or exclusion criteria.
`,
    },
    {
      path: "sections/synthesis.md",
      content: `## Thematic synthesis {#thematic-synthesis}

Organize findings by argument or theme rather than one source at a time.
`,
    },
    {
      path: "sections/gaps.md",
      content: `## Gaps and implications {#gaps}

Identify disagreements, missing evidence, and useful next questions.
`,
    },
  ],
  folders: ["figures", "sections"],
  bibliography: "",
  publicationProfile: defaultProjectPublicationProfile,
};

const builtInTemplates: readonly ProjectTemplateRecord[] = [
  builtIn("builtin-guided", "Guided starter", "Learn Kirjolab through a small composed paper and in-project syntax guide.", guidedSeed),
  builtIn("builtin-blank", "Blank project", "Start with an empty main.md and figures folder.", blankSeed),
  builtIn(
    "builtin-research-article",
    "Research article",
    "A sectioned IMRaD-style article with abstract and references.",
    researchArticleSeed,
  ),
  builtIn(
    "builtin-literature-review",
    "Literature review",
    "A review question, search strategy, thematic synthesis, and research gaps.",
    literatureReviewSeed,
  ),
];

export function listBuiltInProjectTemplates(): readonly ProjectTemplateSummary[] {
  return builtInTemplates.map(({ seed: _seed, ...summary }) => summary);
}

export function builtInProjectTemplate(id: string): ProjectTemplateRecord | null {
  return builtInTemplates.find((template) => template.id === id) ?? null;
}

export function projectTemplateSeed(
  snapshot: Pick<WorkspaceSnapshot, "files" | "folders" | "bibliography" | "publicationProfile">,
): ProjectTemplateSeed {
  const seed: ProjectTemplateSeed = {
    schemaVersion: 1,
    files: snapshot.files.map((file) => ({ path: file.path, content: file.content })),
    folders: snapshot.folders.map((folder) => folder.path),
    bibliography: snapshot.bibliography,
    publicationProfile: snapshot.publicationProfile,
  };
  if (!isProjectTemplateSeed(seed)) throw new Error("Project cannot be represented as a bounded template");
  return seed;
}

export function isProjectTemplateSeed(value: unknown): value is ProjectTemplateSeed {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.files) || !Array.isArray(value.folders)) return false;
  if (value.files.length === 0 || value.files.length > maximumSeedFiles || value.folders.length > maximumSeedFiles) return false;
  if (typeof value.bibliography !== "string" || !isProjectPublicationProfile(value.publicationProfile)) return false;
  const paths = new Set<string>();
  let entryFiles = 0;
  let bytes = new TextEncoder().encode(value.bibliography).byteLength;
  for (const file of value.files) {
    if (!isRecord(file) || typeof file.path !== "string" || typeof file.content !== "string") return false;
    const path = normalizeProjectPath(file.path);
    if (!path || path !== file.path || !path.toLocaleLowerCase().endsWith(".md")) return false;
    const key = path.toLocaleLowerCase();
    if (paths.has(key)) return false;
    paths.add(key);
    if (path === projectEntryPath) entryFiles += 1;
    bytes += new TextEncoder().encode(file.content).byteLength;
  }
  if (entryFiles !== 1 || bytes > maximumSeedBytes) return false;
  const folders = new Set<string>();
  for (const folder of value.folders) {
    if (typeof folder !== "string") return false;
    const path = normalizeProjectPath(folder);
    if (!path || path !== folder || path.toLocaleLowerCase().endsWith(".md")) return false;
    const key = path.toLocaleLowerCase();
    if (folders.has(key)) return false;
    folders.add(key);
  }
  return true;
}

export function isSaveProjectTemplateInput(value: unknown): value is SaveProjectTemplateInput {
  return (
    isRecord(value) &&
    isBoundedText(value.name, 120, true) &&
    (value.description === undefined || isBoundedText(value.description, 500, false)) &&
    (value.templateId === undefined || (typeof value.templateId === "string" && personalTemplateId.test(value.templateId)))
  );
}

export function isPersonalProjectTemplateId(value: string): boolean {
  return personalTemplateId.test(value);
}

function builtIn(id: string, name: string, description: string, seed: ProjectTemplateSeed): ProjectTemplateRecord {
  if (!isProjectTemplateSeed(seed)) throw new Error(`Built-in project template is invalid: ${id}`);
  return { id, source: "built-in", name, description, createdAt: null, updatedAt: null, seed };
}

function isBoundedText(value: unknown, maximum: number, required: boolean): value is string {
  return typeof value === "string" && value.length <= maximum && (!required || value.trim().length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
