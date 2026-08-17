import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  inspectLatexArchive,
  latexArchiveMaximumCompressedBytes,
  latexArchiveMaximumPathCodeUnits,
  latexArchiveMaximumPathSegments,
  latexArchiveMaximumStructuralRecords,
  latexArchiveMaximumTextBytes,
  type LatexArchiveLimits,
} from "./latex-archive";

describe("neutral LaTeX archive inspection", () => {
  it("publishes practical archive path complexity ceilings", () => {
    expect(latexArchiveMaximumPathCodeUnits).toBe(1_024);
    expect(latexArchiveMaximumPathSegments).toBe(64);
  });

  it("preserves decoded source authority and exact UTF-16 reference offsets", async () => {
    const source = "% Résumé 😀\r\n\\documentclass{article}\r\n\\begin{document}\r\n\\input{missing}\r\n\\end{document}\r\n";
    const result = await inspectLatexArchive(zipSync({ "main.tex": strToU8(source) }));

    expect(result.files[0]?.text).toBe(source);
    const include = result.includes[0]!;
    expect(source.slice(include.from, include.to)).toBe("\\input{missing}");
  });

  it("space-masks line and comment-environment contents during reference scans", async () => {
    const source =
      "\\documentclass{article}\r\n" +
      "\\begin{document}\r\n" +
      "% \\input{line-hidden}\r\n" +
      "\\begin{comment}😀 \\input{environment-hidden}\\end{comment}\r\n" +
      "\\input{visible}\r\n" +
      "\\end{document}\r\n";
    const result = await inspectLatexArchive(zipSync({ "main.tex": strToU8(source) }));

    expect(result.includes).toHaveLength(1);
    expect(result.includes[0]?.requestedPath).toBe("visible");
    expect(source.slice(result.includes[0]?.from, result.includes[0]?.to)).toBe("\\input{visible}");
  });

  it("treats include and bibliography commands inside literal environments as inert text", async () => {
    const source =
      "\\documentclass{article}\n\\begin{document}\n" +
      "\\begin{lstlisting}\\input{listing-hidden}\\end{lstlisting}\n" +
      "\\begin{minted}{tex}\\bibliography{minted-hidden}\\end{minted}\n" +
      "\\begin{verbatim}\\input{verbatim-hidden}\\end{verbatim}\n" +
      "\\input{visible}\\bibliography{visible}\n\\end{document}\n";
    const result = await inspectLatexArchive(zipSync({ "main.tex": strToU8(source) }));

    expect(result.includes.map(({ requestedPath }) => requestedPath)).toEqual(["visible"]);
    expect(result.bibliographies.map(({ requestedPath }) => requestedPath)).toEqual(["visible"]);
  });

  it("stops structural command scans at unmatched groups instead of reinterpreting their suffixes", async () => {
    const source =
      "\\documentclass{article}\\begin{document}" +
      "\\input{outer \\input{inner}" +
      "\\addbibresource[broken \\addbibresource{refs.bib}" +
      "\\end{document}";
    const malformedRoot = "\\documentclass[broken \\documentclass{article}\\begin{document}text\\end{document}";
    const result = await inspectLatexArchive(
      zipSync({ "main.tex": strToU8(source), "malformed-root.tex": strToU8(malformedRoot), "refs.bib": strToU8("@misc{x}") }),
    );

    expect(result.rootCandidates).toEqual(["main.tex"]);
    expect(result.includes).toEqual([]);
    expect(result.bibliographies).toEqual([]);
  });

  it("handles dense below-cap unmatched structural groups with deterministic empty inventories", async () => {
    const result = await inspectLatexArchive(
      zipSync({
        "main.tex": strToU8(`\\documentclass{article}\\begin{document}${"\\input{".repeat(50_000)}\\end{document}`),
        "malformed-bibliography.tex": strToU8("\\addbibresource[".repeat(30_000)),
        "malformed-root.tex": strToU8("\\documentclass[".repeat(30_000)),
      }),
    );

    expect(result.rootCandidates).toEqual(["main.tex"]);
    expect(result.includes).toEqual([]);
    expect(result.bibliographies).toEqual([]);
  }, 20_000);

  it("enforces consumer limits when they tighten the hard ceilings", async () => {
    const source = "\\documentclass{article}\\begin{document}text\\end{document}";
    const archive = zipSync({ "main.tex": strToU8(source) });
    const limits: LatexArchiveLimits = { maximumTextBytes: strToU8(source).byteLength - 1 };

    await expect(inspectLatexArchive(archive, limits)).rejects.toMatchObject({ code: "archive-text-size" });

    const references = zipSync({
      "main.tex": strToU8("\\documentclass{article}\\begin{document}\\input{x}\\input{x}\\end{document}"),
      "x.tex": strToU8("Resolved."),
    });
    await expect(inspectLatexArchive(references, { maximumStructuralRecords: 1 })).rejects.toMatchObject({
      code: "archive-structural-record-limit",
    });
  });

  it("does not let consumer limits loosen a hard security ceiling", async () => {
    const oversized = new Uint8Array(latexArchiveMaximumCompressedBytes + 1);

    await expect(inspectLatexArchive(oversized, { maximumCompressedBytes: latexArchiveMaximumCompressedBytes + 1 })).rejects.toMatchObject({
      code: "archive-size",
    });
  });

  it("rejects an entry name that would poison the unzip result object before expansion", async () => {
    const archive = renameZipEntry(zipSync({ "safe-name": strToU8("ignored") }), "safe-name", "__proto__");

    await expect(inspectLatexArchive(archive)).rejects.toMatchObject({
      name: "LatexArchiveFailure",
      code: "archive-path",
      message: "Unsafe archive path: __proto__",
    });
  });

  it("enforces the aggregate expanded-size limit against extracted bytes, not only ZIP metadata", async () => {
    const source = `\\documentclass{article}\\begin{document}${"x".repeat(256)}\\end{document}`;
    const archive = patchFirstLocalAndCentralExpandedSize(zipSync({ "main.tex": strToU8(source) }, { level: 0 }), 1);

    await expect(
      inspectLatexArchive(archive, {
        maximumExpandedBytes: strToU8(source).byteLength - 1,
        maximumTextBytes: strToU8(source).byteLength,
      }),
    ).rejects.toMatchObject({
      name: "LatexArchiveFailure",
      code: "archive-expanded-size",
      message: `Expanded LaTeX archive exceeds the configured limit of ${strToU8(source).byteLength - 1} bytes`,
    });
  });

  it("rejects a central-only expanded-size mismatch before extraction", async () => {
    const archive = patchFirstCentralExpandedSize(zipSync({ "main.tex": strToU8("small source") }, { level: 9 }), 1);

    await expect(inspectLatexArchive(archive)).rejects.toMatchObject({
      name: "LatexArchiveFailure",
      code: "archive-format",
      message: "ZIP local-file headers do not match the central directory",
    });
  });

  it("rejects matching local and central expanded-size metadata that exceeds the emitted bytes", async () => {
    const contents = strToU8("small source");
    const archive = patchFirstLocalAndCentralExpandedSize(zipSync({ "main.tex": contents }, { level: 9 }), contents.byteLength + 1);

    await expect(inspectLatexArchive(archive)).rejects.toMatchObject({
      name: "LatexArchiveFailure",
      code: "archive-format",
      message: "ZIP expanded size does not match the central directory",
    });
  });

  it("aborts forged-size deflate expansion at the configured actual-byte ceiling", async () => {
    const source = `\\documentclass{article}\\begin{document}` + "x".repeat(1_500_000) + "\\end{document}";
    expect(strToU8(source).byteLength).toBeLessThan(latexArchiveMaximumTextBytes);
    const archive = patchFirstLocalAndCentralExpandedSize(zipSync({ "main.tex": strToU8(source) }, { level: 9 }), 1);

    await expect(inspectLatexArchive(archive, { maximumExpandedBytes: 64 * 1_024 })).rejects.toMatchObject({
      name: "LatexArchiveFailure",
      code: "archive-expanded-size",
      message: "Expanded LaTeX archive exceeds the configured limit of 65536 bytes",
    });
  });

  it.each([
    ["path length", `${"a".repeat(1_025)}.tex`, "Archive path exceeds 1,024 UTF-16 code units"],
    ["path depth", `${"a/".repeat(64)}main.tex`, "Archive path exceeds 64 segments"],
  ])("rejects excessive archive %s before expansion", async (_case, path, message) => {
    await expect(inspectLatexArchive(zipSync({ [path]: strToU8("ignored") }))).rejects.toMatchObject({
      name: "LatexArchiveFailure",
      code: "archive-path",
      message,
    });
  });

  it.each([
    ["include", `\\input{${"a".repeat(1_025)}}`, "LaTeX include path exceeds 1,024 UTF-16 code units"],
    ["bibliography", `\\bibliography{${"b".repeat(1_025)}}`, "LaTeX bibliography path exceeds 1,024 UTF-16 code units"],
  ])("rejects an oversized %s argument without reflecting the authored value", async (_case, command, message) => {
    const source = `\\documentclass{article}\\begin{document}${command}\\end{document}`;

    await expect(inspectLatexArchive(zipSync({ "main.tex": strToU8(source) }))).rejects.toMatchObject({
      name: "LatexArchiveFailure",
      code: "archive-path",
      message,
    });
    expect(message.length).toBeLessThan(100);
  });

  it("enforces the fixed aggregate structural-reference and diagnostic ceiling", async () => {
    const boundarySource = `\\documentclass{article}\\begin{document}${"\\input{x}".repeat(
      latexArchiveMaximumStructuralRecords,
    )}\\end{document}`;
    const boundary = await inspectLatexArchive(zipSync({ "main.tex": strToU8(boundarySource), "x.tex": strToU8("Resolved.") }));
    expect(boundary.includes).toHaveLength(latexArchiveMaximumStructuralRecords);

    const overReferences = boundarySource.replace("\\end{document}", "\\input{x}\\end{document}");
    await expect(
      inspectLatexArchive(zipSync({ "main.tex": strToU8(overReferences), "x.tex": strToU8("Resolved.") }), {
        maximumStructuralRecords: latexArchiveMaximumStructuralRecords + 1,
      }),
    ).rejects.toMatchObject({ code: "archive-structural-record-limit" });

    const missingCount = Math.floor(latexArchiveMaximumStructuralRecords / 2) + 1;
    const overDiagnostics = `\\documentclass{article}\\begin{document}${"\\input{missing}".repeat(missingCount)}\\end{document}`;
    await expect(inspectLatexArchive(zipSync({ "main.tex": strToU8(overDiagnostics) }))).rejects.toMatchObject({
      code: "archive-structural-record-limit",
    });
  });

  it.each([
    [{ maximumCompressedBytes: 0 }, "maximumCompressedBytes"],
    [{ maximumCompressedBytes: Number.NaN }, "maximumCompressedBytes"],
    [{ maximumCompressedBytes: 1.5 }, "maximumCompressedBytes"],
    [{ maximumCompressedBytes: Number.MAX_SAFE_INTEGER + 1 }, "maximumCompressedBytes"],
    [{ maximumExpandedBytes: 0 }, "maximumExpandedBytes"],
    [{ maximumExpandedBytes: Number.NaN }, "maximumExpandedBytes"],
    [{ maximumExpandedBytes: 1.5 }, "maximumExpandedBytes"],
    [{ maximumExpandedBytes: Number.MAX_SAFE_INTEGER + 1 }, "maximumExpandedBytes"],
    [{ maximumEntries: 0 }, "maximumEntries"],
    [{ maximumEntries: Number.NaN }, "maximumEntries"],
    [{ maximumEntries: 1.5 }, "maximumEntries"],
    [{ maximumEntries: Number.MAX_SAFE_INTEGER + 1 }, "maximumEntries"],
    [{ maximumStructuralRecords: 0 }, "maximumStructuralRecords"],
    [{ maximumStructuralRecords: Number.NaN }, "maximumStructuralRecords"],
    [{ maximumStructuralRecords: 1.5 }, "maximumStructuralRecords"],
    [{ maximumStructuralRecords: Number.MAX_SAFE_INTEGER + 1 }, "maximumStructuralRecords"],
    [{ maximumTextBytes: 0 }, "maximumTextBytes"],
    [{ maximumTextBytes: Number.NaN }, "maximumTextBytes"],
    [{ maximumTextBytes: 1.5 }, "maximumTextBytes"],
    [{ maximumTextBytes: Number.MAX_SAFE_INTEGER + 1 }, "maximumTextBytes"],
  ] satisfies ReadonlyArray<readonly [LatexArchiveLimits, keyof LatexArchiveLimits]>)(
    "rejects invalid public limit %j with a typed failure",
    async (limits, field) => {
      await expect(inspectLatexArchive(new Uint8Array([1]), limits)).rejects.toMatchObject({
        name: "LatexArchiveFailure",
        code: "archive-invalid-limits",
        message: `${field} must be a positive safe integer`,
      });
    },
  );
});

function renameZipEntry(archive: Uint8Array, from: string, to: string): Uint8Array {
  expect(to).toHaveLength(from.length);
  const result = archive.slice();
  const encodedFrom = strToU8(from);
  const encodedTo = strToU8(to);
  let replacements = 0;
  for (let offset = 0; offset <= result.length - encodedFrom.length; offset += 1) {
    if (!encodedFrom.every((byte, index) => result[offset + index] === byte)) continue;
    result.set(encodedTo, offset);
    replacements += 1;
    offset += encodedFrom.length - 1;
  }
  expect(replacements).toBe(2);
  return result;
}

function patchFirstCentralExpandedSize(archive: Uint8Array, expandedSize: number): Uint8Array {
  const result = archive.slice();
  const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
  for (let offset = 0; offset <= result.length - 4; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    view.setUint32(offset + 24, expandedSize, true);
    return result;
  }
  throw new Error("Test ZIP central-directory entry was not found");
}

function patchFirstLocalAndCentralExpandedSize(archive: Uint8Array, expandedSize: number): Uint8Array {
  const result = patchFirstCentralExpandedSize(archive, expandedSize);
  const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
  for (let offset = 0; offset <= result.length - 4; offset += 1) {
    if (view.getUint32(offset, true) !== 0x04034b50) continue;
    view.setUint32(offset + 22, expandedSize, true);
    return result;
  }
  throw new Error("Test ZIP local-file entry was not found");
}
