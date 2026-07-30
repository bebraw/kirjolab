import * as v from "valibot";
import { isIdentifier, isTimestamp } from "./citation-contract-validation";

export interface CitationResearchQueueItem {
  readonly referenceId: string;
  readonly seedReferenceId: string;
  readonly direction: "references" | "citations";
  readonly addedAt: string;
}

export interface QueueCitationReferenceInput {
  readonly seedReferenceId: string;
  readonly direction: "references" | "citations";
}

const queueItemSchema = v.pipe(
  v.object({
    referenceId: v.custom<string>(isIdentifier),
    seedReferenceId: v.custom<string>(isIdentifier),
    direction: v.picklist(["references", "citations"]),
    addedAt: v.custom<string>(isTimestamp),
  }),
  v.check(({ referenceId, seedReferenceId }) => referenceId !== seedReferenceId),
);

export function isCitationResearchQueue(value: unknown): value is readonly CitationResearchQueueItem[] {
  return v.is(v.pipe(v.array(queueItemSchema), v.maxLength(128)), value);
}

export function isQueueCitationReferenceInput(value: unknown): value is QueueCitationReferenceInput {
  return v.is(
    v.pipe(
      v.strictObject({
        seedReferenceId: v.custom<string>(isIdentifier),
        direction: v.picklist(["references", "citations"]),
      }),
    ),
    value,
  );
}
