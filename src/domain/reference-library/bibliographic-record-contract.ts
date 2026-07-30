import * as v from "valibot";

const bibliographicRecordFieldsSchema = v.object({
  referenceKey: v.string(),
  type: v.string(),
  title: v.string(),
  authors: v.array(v.string()),
  year: v.string(),
  venue: v.string(),
  doi: v.string(),
  url: v.string(),
  abstract: v.string(),
  provenance: v.custom<Readonly<Record<string, unknown>>>((value) => typeof value === "object" && value !== null && !Array.isArray(value)),
});

export type BibliographicRecordFields = v.InferOutput<typeof bibliographicRecordFieldsSchema>;

export function hasBibliographicRecordFields(value: Record<string, unknown>): value is Record<string, unknown> & BibliographicRecordFields {
  return v.is(bibliographicRecordFieldsSchema, value);
}
