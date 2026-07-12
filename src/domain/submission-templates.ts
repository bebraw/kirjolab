import type { ProjectPublicationProfile, SubmissionTemplate } from "./workspace";

export interface ResolvedSubmissionTemplate {
  readonly id: SubmissionTemplate;
  readonly label: string;
  readonly marginPoints: number;
  readonly lineSpacing: 1 | 1.5 | 2;
  readonly columns: 1 | 2;
  readonly titlePage: boolean;
  readonly anonymize: boolean;
}

const templates: Readonly<Record<SubmissionTemplate, ResolvedSubmissionTemplate>> = {
  article: { id: "article", label: "Standard article", marginPoints: 72, lineSpacing: 1, columns: 1, titlePage: false, anonymize: false },
  preprint: { id: "preprint", label: "Preprint", marginPoints: 72, lineSpacing: 1.5, columns: 1, titlePage: true, anonymize: false },
  "anonymous-review": {
    id: "anonymous-review",
    label: "Anonymous review",
    marginPoints: 90,
    lineSpacing: 2,
    columns: 1,
    titlePage: true,
    anonymize: true,
  },
  "journal-two-column": {
    id: "journal-two-column",
    label: "Journal two-column",
    marginPoints: 54,
    lineSpacing: 1,
    columns: 2,
    titlePage: false,
    anonymize: false,
  },
};

export function resolveSubmissionTemplate(profile: ProjectPublicationProfile): ResolvedSubmissionTemplate {
  return templates[profile.submissionTemplate];
}

export function submissionPageSize(profile: ProjectPublicationProfile): readonly [number, number] {
  return profile.paperSize === "letter" ? [612, 792] : [595.28, 841.89];
}
