import * as v from "valibot";
import { isRecord } from "../unknown-value";
import type { LibraryPdfArtifact } from "./artifacts";
import { isBibliographicRecord, type BibliographicRecord } from "./metadata";
import { isLibraryHighlight, isLibraryPdfMarkup, type LibraryHighlight, type LibraryPdfMarkup } from "./pdf-annotations";
import type { LibraryNote, ReadingState } from "./research";
import { isWebSnapshot, isWebSource, type WebSnapshot, type WebSource } from "./web-sources";

const stringArrayRecordSchema = v.record(v.string(), v.array(v.string()));

export type ReferenceKeyState = "provisional" | "final";

export interface ReferenceLibrarySnapshot {
  readonly references: readonly BibliographicRecord[];
  readonly referenceKeyStates: Readonly<Record<string, ReferenceKeyState>>;
  readonly artifacts: readonly LibraryPdfArtifact[];
  readonly webSources: readonly WebSource[];
  readonly webSnapshots: readonly WebSnapshot[];
  readonly notes: readonly LibraryNote[];
  readonly highlights: readonly LibraryHighlight[];
  readonly pdfMarkups?: readonly LibraryPdfMarkup[];
  readonly tags: Readonly<Record<string, readonly string[]>>;
  readonly collections: Readonly<Record<string, readonly string[]>>;
  readonly reading: readonly ReadingState[];
}

export function isReferenceLibrarySnapshot(value: unknown): value is ReferenceLibrarySnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.references) &&
    value.references.every(isBibliographicRecord) &&
    isRecord(value.referenceKeyStates) &&
    Object.values(value.referenceKeyStates).every((state) => state === "provisional" || state === "final") &&
    Array.isArray(value.artifacts) &&
    Array.isArray(value.webSources) &&
    value.webSources.every(isWebSource) &&
    Array.isArray(value.webSnapshots) &&
    value.webSnapshots.every(isWebSnapshot) &&
    Array.isArray(value.notes) &&
    Array.isArray(value.highlights) &&
    value.highlights.every(isLibraryHighlight) &&
    (value.pdfMarkups === undefined || (Array.isArray(value.pdfMarkups) && value.pdfMarkups.every(isLibraryPdfMarkup))) &&
    isStringArrayRecord(value.tags) &&
    isStringArrayRecord(value.collections) &&
    Array.isArray(value.reading) &&
    value.reading.every(isReadingState)
  );
}

function isStringArrayRecord(value: unknown): value is Readonly<Record<string, readonly string[]>> {
  return isRecord(value) && v.is(stringArrayRecordSchema, value);
}

function isReadingState(value: unknown): value is ReadingState {
  return (
    isRecord(value) &&
    typeof value.referenceId === "string" &&
    (value.status === "unread" || value.status === "reading" || value.status === "read") &&
    (value.rating === null ||
      (typeof value.rating === "number" && Number.isInteger(value.rating) && value.rating >= 1 && value.rating <= 5)) &&
    (value.priority === "low" || value.priority === "normal" || value.priority === "high") &&
    typeof value.updatedAt === "string"
  );
}
