import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  applyYjsUpdateOnce,
  collaborationProtocolVersion,
  encodeClientSelectionMessage,
  encodeServerCollaborationMessage,
  isServerCollaborationMessage,
  parseServerCollaborationMessage,
  parseClientSelectionMessage,
  type ServerCollaborationMessage,
} from "./collaboration";

describe("server collaboration messages", () => {
  const messages: ServerCollaborationMessage[] = [
    { type: "sync", protocol: collaborationProtocolVersion, revision: 4 },
    { type: "ack", revision: 5 },
    { type: "revision", revision: 6 },
    { type: "reset", revision: 7 },
    { type: "presence", collaborators: 2 },
    { type: "selection", collaboratorId: "session-1", fileId: "main-file", start: 4, end: 12, revision: 8 },
    { type: "selection-clear", collaboratorId: "session-1" },
    { type: "resources" },
  ];

  it("round-trips every supported server control message", () => {
    for (const message of messages) {
      expect(parseServerCollaborationMessage(encodeServerCollaborationMessage(message))).toEqual(message);
      expect(isServerCollaborationMessage(message)).toBe(true);
    }
  });

  it.each([
    "",
    "{",
    "null",
    "[]",
    '"sync"',
    '{"type":"unknown"}',
    '{"type":"sync","revision":1}',
    '{"type":"sync","protocol":2,"revision":1}',
    '{"type":"sync","protocol":1,"revision":-1}',
    '{"type":"sync","protocol":1,"revision":1.5}',
    '{"type":"sync","protocol":1,"revision":1,"extra":true}',
    '{"type":"ack","revision":"1"}',
    '{"type":"revision","revision":1e400}',
    '{"type":"presence","collaborators":-1}',
    '{"type":"resources","revision":1}',
  ])("rejects invalid JSON or message shapes: %s", (value) => {
    expect(parseServerCollaborationMessage(value)).toBeNull();
  });

  it("rejects invalid values at the encoding boundary", () => {
    expect(() => encodeServerCollaborationMessage({ type: "ack", revision: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      "Invalid server collaboration message",
    );
    expect(() => encodeServerCollaborationMessage({ type: "resources", unexpected: true })).toThrow("Invalid server collaboration message");
  });
});

describe("client collaboration selection messages", () => {
  const selection = {
    type: "selection",
    protocol: collaborationProtocolVersion,
    fileId: "main-file",
    start: 4,
    end: 12,
    revision: 8,
  } as const;

  it("round-trips one bounded version-linked source selection", () => {
    expect(parseClientSelectionMessage(encodeClientSelectionMessage(selection))).toEqual(selection);
    expect(parseClientSelectionMessage(JSON.stringify({ ...selection, start: 12, end: 12 }))).toMatchObject({ start: 12, end: 12 });
  });

  it("rejects malformed, stale-shaped, and oversized selection messages", () => {
    for (const invalid of [
      "",
      "{",
      JSON.stringify({ ...selection, protocol: 2 }),
      JSON.stringify({ ...selection, fileId: "" }),
      JSON.stringify({ ...selection, start: -1 }),
      JSON.stringify({ ...selection, start: 13 }),
      JSON.stringify({ ...selection, revision: 1.5 }),
      JSON.stringify({ ...selection, extra: true }),
      "x".repeat(1_025),
    ]) {
      expect(parseClientSelectionMessage(invalid), invalid.slice(0, 80)).toBeNull();
    }
    expect(() => encodeClientSelectionMessage({ ...selection, end: -1 })).toThrow("Invalid client selection message");
  });
});

describe("applyYjsUpdateOnce", () => {
  it("applies new state and identifies an idempotent replay", () => {
    const source = new Y.Doc();
    source.getText("source").insert(0, "Inspectable evidence");
    const update = Y.encodeStateAsUpdate(source);
    const target = new Y.Doc();

    expect(applyYjsUpdateOnce(target, update)).toBe(true);
    expect(target.getText("source").toString()).toBe("Inspectable evidence");
    expect(applyYjsUpdateOnce(target, update)).toBe(false);
    expect(target.getText("source").toString()).toBe("Inspectable evidence");
  });

  it("accepts causally new state even when the visible text stays equal", () => {
    const source = new Y.Doc();
    source.getText("source").insert(0, "same");
    const target = new Y.Doc();
    expect(applyYjsUpdateOnce(target, Y.encodeStateAsUpdate(source))).toBe(true);
    const beforeReplacement = Y.encodeStateVector(source);

    source.transact(() => {
      const text = source.getText("source");
      text.delete(0, text.length);
      text.insert(0, "same");
    });

    expect(applyYjsUpdateOnce(target, Y.encodeStateAsUpdate(source, beforeReplacement))).toBe(true);
    expect(target.getText("source").toString()).toBe("same");
  });

  it("recognizes delete-only updates and rejects malformed input", () => {
    const source = new Y.Doc();
    source.getText("source").insert(0, "abc");
    const target = new Y.Doc();
    expect(applyYjsUpdateOnce(target, Y.encodeStateAsUpdate(source))).toBe(true);
    const beforeDeletion = Y.encodeStateVector(source);
    source.getText("source").delete(1, 1);

    expect(applyYjsUpdateOnce(target, Y.encodeStateAsUpdate(source, beforeDeletion))).toBe(true);
    expect(target.getText("source").toString()).toBe("ac");
    expect(() => applyYjsUpdateOnce(target, new Uint8Array([255]))).toThrow();
    expect(target.getText("source").toString()).toBe("ac");
  });
});
