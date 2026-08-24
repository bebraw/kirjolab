import * as v from "valibot";
import { isRecord } from "../unknown-value";
import { isLibraryPdfArtifact, type LibraryPdfArtifact } from "./artifacts";
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
  return isRecord(value) && hasReferenceFields(value) && hasArtifactFields(value) && hasResearchFields(value);
}

function hasReferenceFields(value: Record<string, unknown>): boolean {
  return isArrayOf(value.references, isBibliographicRecord) && isReferenceKeyStateRecord(value.referenceKeyStates);
}

function hasArtifactFields(value: Record<string, unknown>): boolean {
  return (
    isArrayOf(value.artifacts, isLibraryPdfArtifact) &&
    isArrayOf(value.webSources, isWebSource) &&
    isArrayOf(value.webSnapshots, isWebSnapshot)
  );
}

function hasResearchFields(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.notes) &&
    isArrayOf(value.highlights, isLibraryHighlight) &&
    isOptionalArrayOf(value.pdfMarkups, isLibraryPdfMarkup) &&
    isStringArrayRecord(value.tags) &&
    isStringArrayRecord(value.collections) &&
    isArrayOf(value.reading, isReadingState)
  );
}

function isArrayOf<Item>(value: unknown, predicate: (item: unknown) => item is Item): value is readonly Item[] {
  return Array.isArray(value) && value.every(predicate);
}

function isOptionalArrayOf<Item>(value: unknown, predicate: (item: unknown) => item is Item): value is readonly Item[] | undefined {
  return value === undefined || isArrayOf(value, predicate);
}

function isReferenceKeyStateRecord(value: unknown): value is Readonly<Record<string, ReferenceKeyState>> {
  return isRecord(value) && Object.values(value).every(isReferenceKeyState);
}

function isReferenceKeyState(value: unknown): value is ReferenceKeyState {
  return value === "provisional" || value === "final";
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
