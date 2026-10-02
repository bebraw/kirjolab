import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createLatexArchiveFailureConformanceFixturesV2 } from "../../lib/paper-import/conformance-corpus";
import { extractSourceArchive } from "./project-source-zip";

function mutate(bytes: Uint8Array, patch: (view: DataView, central: number, end: number) => void): Uint8Array {
  const copy = bytes.slice();
  const view = new DataView(copy.buffer);
  const end = copy.length - 22;
  patch(view, view.getUint32(end + 16, true), end);
  return copy;
}
const include = (path: string): boolean => !path.startsWith("node_modules/");

describe("bounded source ZIP reader", () => {
  for (const fixture of createLatexArchiveFailureConformanceFixturesV2().filter(
    (fixture) => fixture.id !== "invalid-utf8" && fixture.id !== "oversized-source",
  )) {
    it(`preserves the established ZIP safety boundary for ${fixture.id}`, () => {
      expect(() => extractSourceArchive(fixture.archive, include)).toThrow(expect.objectContaining({ code: fixture.expected.code }));
    });
  }

  it("rejects path complexity and malformed names even on skipped entries", () => {
    for (const path of ["a".repeat(1_025), `${"a/".repeat(64)}main.md`])
      expect(() => extractSourceArchive(zipSync({ [path]: strToU8("text") }), include)).toThrow(/Archive path exceeds/u);
    const zip = zipSync({ "node_modules/file.js": strToU8("ignored") });
    const invalidName = mutate(zip, (view, central) => view.setUint8(central + 46, 0xff));
    expect(() => extractSourceArchive(invalidName, include)).toThrow("names must be UTF-8");
    const badLocal = mutate(zip, (view) => view.setUint8(30, "x".charCodeAt(0)));
    expect(() => extractSourceArchive(badLocal, include)).toThrow("local-file headers");
  });

  it("rejects forged sizes against both retained and full-archive bounds before allocation", () => {
    const zip = zipSync({ "source.pdf": strToU8("%PDF-1.7") });
    const retained = mutate(zip, (view, central) => {
      view.setUint32(central + 20, 100_000, true);
      view.setUint32(central + 24, 21 * 1024 * 1024, true);
    });
    expect(() => extractSourceArchive(retained, include)).toThrow("Imported project content exceeds 20 MiB");
    const all = mutate(zip, (view, central) => {
      view.setUint32(central + 20, 100_000, true);
      view.setUint32(central + 24, 65 * 1024 * 1024, true);
    });
    expect(() => extractSourceArchive(all, include)).toThrow("Expanded project archive exceeds 64 MiB");
    expect(() => extractSourceArchive(new Uint8Array(20 * 1024 * 1024 + 1), include)).toThrow("20 MiB");
  });

  it("refuses invalid directory records, methods, split archives and truncated metadata", () => {
    const zip = zipSync({ "main.md": strToU8("# Paper") });
    const patches: Array<(view: DataView, central: number, end: number) => void> = [
      (view, _central, end) => view.setUint16(end + 4, 1, true),
      (view, central) => view.setUint32(central, 0, true),
      (view, central) => view.setUint16(central + 28, 0xffff, true),
      (view, central) => view.setUint16(central + 10, 99, true),
      (view, _central, end) => view.setUint32(end + 16, end + 1, true),
      (view, _central, end) => view.setUint32(end + 12, 1, true),
    ];
    for (const patch of patches) expect(() => extractSourceArchive(mutate(zip, patch), include)).toThrow();
  });

  it("checks deflated output against forged local and central sizes", () => {
    const zip = zipSync({ "main.md": strToU8("# Paper\n" + "text".repeat(1_000)) });
    const low = mutate(zip, (view, central) => {
      view.setUint32(22, 1, true);
      view.setUint32(central + 24, 1, true);
    });
    expect(() => extractSourceArchive(low, include)).toThrow("expanded size");
    const high = mutate(zip, (view, central) => {
      view.setUint32(22, 5_000, true);
      view.setUint32(central + 24, 5_000, true);
    });
    expect(() => extractSourceArchive(high, include)).toThrow("expanded size");
  });

  it("retains selected bytes and validates directory entries without expanding skipped files", () => {
    const result = extractSourceArchive(
      zipSync({ "paper/": new Uint8Array(), "paper/main.md": strToU8("# Paper"), "node_modules/dep.md": strToU8("ignored") }),
      include,
    );
    expect([...result.files.keys()]).toEqual(["paper/main.md"]);
    expect(result.files.get("paper/main.md")).toEqual(strToU8("# Paper"));
    expect(result.skippedEntries).toBe(2);
  });
});
