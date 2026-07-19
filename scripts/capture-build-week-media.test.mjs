import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  BUILD_WEEK_MEDIA,
  assertLoopbackCdpURL,
  assertMediaManifest,
  createBuildWeekEvidencePdf,
  parseCaptureOptions,
  readPngMetadata,
  renderCaptionsMarkdown,
  validateBuildWeekMedia,
} from "./capture-build-week-media.mjs";

test("defines an ordered fifteen-image Build Week manifest with bounded captions", () => {
  assert.doesNotThrow(() => assertMediaManifest());
  assert.deepEqual(
    BUILD_WEEK_MEDIA.map((item) => item.filename.slice(0, 2)),
    Array.from({ length: 15 }, (_, index) => String(index + 1).padStart(2, "0")),
  );
  assert.ok(BUILD_WEEK_MEDIA.every((item) => Array.from(item.caption).length <= 140));
});

test("parses capture, validation, and help modes without accepting unsafe CDP origins", () => {
  assert.deepEqual(parseCaptureOptions([], {}), {
    cdpURL: "http://127.0.0.1:9222",
    mode: "capture",
  });
  assert.equal(parseCaptureOptions(["--validate"], {}).mode, "validate");
  assert.equal(parseCaptureOptions(["--help"], {}).mode, "help");
  assert.equal(assertLoopbackCdpURL("http://127.0.0.1:9333"), "http://127.0.0.1:9333");
  assert.throws(() => parseCaptureOptions(["--unknown"], {}), /Unknown Build Week media option/u);
  assert.throws(() => parseCaptureOptions(["--help", "--validate"], {}), /either help or validation/u);
  assert.throws(() => assertLoopbackCdpURL("https://127.0.0.1:9222"), /loopback HTTP origin/u);
  assert.throws(() => assertLoopbackCdpURL("http://localhost:9222"), /loopback HTTP origin/u);
  assert.throws(() => assertLoopbackCdpURL("http://127.0.0.1:9222/json"), /loopback HTTP origin/u);
});

test("renders captions from the same manifest used for capture", () => {
  const markdown = renderCaptionsMarkdown();

  assert.match(markdown, /^# Build Week Project Media/u);
  for (const [index, item] of BUILD_WEEK_MEDIA.entries()) {
    assert.ok(markdown.includes(`${index + 1}. ${item.caption}`));
  }
});

test("generates a self-contained synthetic evidence PDF", () => {
  const pdf = createBuildWeekEvidencePdf();

  assert.equal(pdf.subarray(0, 8).toString("ascii"), "%PDF-1.4");
  assert.match(pdf.toString("ascii"), /Synthetic Build Week fixture/u);
  assert.match(pdf.toString("ascii"), /%%EOF\n$/u);
});

test("reads the dimensions and color metadata from a PNG", () => {
  const png = makePng({ marker: 1 });

  assert.deepEqual(readPngMetadata(png), {
    bitDepth: 8,
    chunks: ["IHDR", "sRGB", "tEXt", "IEND"],
    colorType: 6,
    height: 1_920,
    width: 2_880,
  });
  assert.throws(() => readPngMetadata(Buffer.from("not a png")), /valid PNG/u);
  assert.throws(() => readPngMetadata(png.subarray(0, png.length - 2)), /truncated|incomplete/u);
});

test("validates the complete staged upload and captions", async () => {
  const root = await mkdtemp(join(tmpdir(), "kirjolab-build-week-media-test-"));
  const upload = join(root, "upload");
  const captions = join(root, "captions.md");
  try {
    await mkdir(upload);
    await Promise.all(BUILD_WEEK_MEDIA.map((item, index) => writeFile(join(upload, item.filename), makePng({ marker: index }))));
    await writeFile(captions, renderCaptionsMarkdown(), "utf8");

    const summary = await validateBuildWeekMedia({ imageDirectory: upload, captionFile: captions });

    assert.deepEqual(summary, {
      count: 15,
      height: 1_920,
      largestBytes: makePng({ marker: 10 }).length,
      longestCaptionCharacters: Math.max(...BUILD_WEEK_MEDIA.map((item) => Array.from(item.caption).length)),
      width: 2_880,
    });

    await writeFile(join(upload, BUILD_WEEK_MEDIA[1].filename), makePng({ marker: 0 }));
    await assert.rejects(validateBuildWeekMedia({ imageDirectory: upload, captionFile: captions }), /image content is duplicated/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function makePng({ marker, width = 2_880, height = 1_920 }) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    signature,
    pngChunk("IHDR", header),
    pngChunk("sRGB", Buffer.from([0])),
    pngChunk("tEXt", Buffer.from(`fixture=${marker}`, "ascii")),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  return chunk;
}
