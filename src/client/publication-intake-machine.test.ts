import { afterEach, describe, expect, it } from "vitest";
import { createPublicationIntakeActor, publicationIntakeBusy, type PublicationIntakeActor } from "./publication-intake-machine";
import type { PublicationIntakePreview } from "../domain/workspace";

const actors: PublicationIntakeActor[] = [];
const preview: PublicationIntakePreview = {
  pdfId: "pdf-1",
  doi: "10.1000/example",
  citationKey: "Example2026",
  existingPublicationId: null,
  metadataFingerprint: "fingerprint",
  metadata: {
    type: "article",
    title: "Example",
    authors: ["Ada Example"],
    year: "2026",
    venue: "Journal",
    doi: "10.1000/example",
    url: "https://doi.org/10.1000/example",
    abstract: "An example abstract.",
  },
};

afterEach(() => {
  for (const actor of actors.splice(0)) actor.stop();
});

function actor(): PublicationIntakeActor {
  const value = createPublicationIntakeActor();
  actors.push(value);
  return value;
}

describe("publication intake machine", () => {
  it("coordinates preview and acceptance", () => {
    const value = actor();
    value.send({ type: "OPEN", pdfId: "pdf-1" });
    value.send({ type: "START_PREVIEW" });
    const previewRequest = value.getSnapshot().context.requestId;
    expect(publicationIntakeBusy(value.getSnapshot())).toBe(true);
    value.send({ type: "PREVIEW_READY", requestId: previewRequest, preview });
    expect(value.getSnapshot()).toMatchObject({ value: "reviewing", context: { preview } });

    value.send({ type: "ACCEPT" });
    const acceptRequest = value.getSnapshot().context.requestId;
    value.send({ type: "ACCEPTED", requestId: acceptRequest });
    expect(value.getSnapshot()).toMatchObject({ value: "idle", context: { preview: null } });
  });

  it("ignores late responses after changing PDF context", () => {
    const value = actor();
    value.send({ type: "OPEN", pdfId: "pdf-1" });
    value.send({ type: "START_PREVIEW" });
    const requestId = value.getSnapshot().context.requestId;
    value.send({ type: "OPEN", pdfId: "pdf-2" });
    value.send({ type: "PREVIEW_READY", requestId, preview });
    expect(value.getSnapshot()).toMatchObject({ value: "idle", context: { pdfId: "pdf-2", preview: null } });
  });

  it("invalidates in-flight work when cancelled", () => {
    const value = actor();
    value.send({ type: "OPEN", pdfId: "pdf-1" });
    value.send({ type: "START_PREVIEW" });
    const requestId = value.getSnapshot().context.requestId;
    value.send({ type: "CANCEL" });
    value.send({ type: "PREVIEW_FAILED", requestId, message: "late" });
    expect(value.getSnapshot()).toMatchObject({ value: "idle", context: { preview: null, error: null } });
  });

  it("retains a reviewed preview after acceptance failure", () => {
    const value = actor();
    value.send({ type: "OPEN", pdfId: "pdf-1" });
    value.send({ type: "START_PREVIEW" });
    value.send({ type: "PREVIEW_READY", requestId: value.getSnapshot().context.requestId, preview });
    value.send({ type: "ACCEPT" });
    value.send({ type: "ACCEPT_FAILED", requestId: value.getSnapshot().context.requestId, message: "Conflict" });
    expect(value.getSnapshot()).toMatchObject({ value: "reviewing", context: { preview, error: "Conflict" } });
    expect(publicationIntakeBusy(value.getSnapshot())).toBe(false);
  });
});
