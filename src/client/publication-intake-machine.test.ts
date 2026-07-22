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

function startPreview(value: PublicationIntakeActor, pdfId = "pdf-1"): number {
  value.send({ type: "OPEN", pdfId });
  value.send({ type: "START_PREVIEW" });
  return value.getSnapshot().context.requestId;
}

describe("publication intake machine", () => {
  it("coordinates preview and acceptance", () => {
    const value = actor();
    value.send({ type: "OPEN", pdfId: "pdf-1" });
    expect(value.getSnapshot()).toMatchObject({
      value: "idle",
      context: { pdfId: "pdf-1", requestId: 1, preview: null, error: null },
    });
    value.send({ type: "START_PREVIEW" });
    const previewRequest = value.getSnapshot().context.requestId;
    expect(previewRequest).toBe(2);
    expect(publicationIntakeBusy(value.getSnapshot())).toBe(true);

    value.send({ type: "PREVIEW_READY", requestId: previewRequest - 1, preview });
    expect(value.getSnapshot().value).toBe("previewing");
    value.send({ type: "PREVIEW_READY", requestId: previewRequest, preview: { ...preview, pdfId: "pdf-2" } });
    expect(value.getSnapshot().value).toBe("previewing");
    value.send({ type: "PREVIEW_READY", requestId: previewRequest, preview });
    expect(value.getSnapshot()).toMatchObject({ value: "reviewing", context: { preview } });

    value.send({ type: "ACCEPT" });
    const acceptRequest = value.getSnapshot().context.requestId;
    expect(acceptRequest).toBe(3);
    expect(publicationIntakeBusy(value.getSnapshot())).toBe(true);
    value.send({ type: "ACCEPTED", requestId: acceptRequest - 1 });
    expect(value.getSnapshot().value).toBe("accepting");
    value.send({ type: "ACCEPTED", requestId: acceptRequest });
    expect(value.getSnapshot()).toMatchObject({
      value: "idle",
      context: { pdfId: "pdf-1", requestId: 3, preview: null, error: null },
    });
    expect(publicationIntakeBusy(value.getSnapshot())).toBe(false);
  });

  it("ignores late responses after changing PDF context", () => {
    const value = actor();
    const requestId = startPreview(value);
    value.send({ type: "OPEN", pdfId: "pdf-2" });
    value.send({ type: "PREVIEW_READY", requestId, preview });
    expect(value.getSnapshot()).toMatchObject({ value: "idle", context: { pdfId: "pdf-2", preview: null } });
  });

  it("invalidates in-flight work when cancelled", () => {
    const value = actor();
    const requestId = startPreview(value);
    value.send({ type: "CANCEL" });
    expect(value.getSnapshot()).toMatchObject({
      value: "idle",
      context: { pdfId: "pdf-1", requestId: requestId + 1, preview: null, error: null },
    });
    value.send({ type: "PREVIEW_FAILED", requestId, message: "late" });
    expect(value.getSnapshot()).toMatchObject({ value: "idle", context: { preview: null, error: null } });
  });

  it("records only the active preview failure and clears it before retrying", () => {
    const value = actor();
    const requestId = startPreview(value);

    value.send({ type: "PREVIEW_FAILED", requestId: requestId - 1, message: "stale" });
    expect(value.getSnapshot()).toMatchObject({ value: "previewing", context: { error: null } });
    value.send({ type: "PREVIEW_FAILED", requestId, message: "Unavailable" });
    expect(value.getSnapshot()).toMatchObject({ value: "failed", context: { preview: null, error: "Unavailable" } });

    value.send({ type: "START_PREVIEW" });
    expect(value.getSnapshot()).toMatchObject({
      value: "previewing",
      context: { requestId: requestId + 1, preview: null, error: null },
    });
  });

  it("retains a reviewed preview after acceptance failure", () => {
    const value = actor();
    startPreview(value);
    value.send({ type: "PREVIEW_READY", requestId: value.getSnapshot().context.requestId, preview });
    value.send({ type: "ACCEPT" });
    value.send({ type: "ACCEPT_FAILED", requestId: value.getSnapshot().context.requestId, message: "Conflict" });
    expect(value.getSnapshot()).toMatchObject({ value: "reviewing", context: { preview, error: "Conflict" } });
    expect(publicationIntakeBusy(value.getSnapshot())).toBe(false);
  });
});
