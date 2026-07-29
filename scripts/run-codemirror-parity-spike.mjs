import { gzipSync } from "node:zlib";

import { chromium } from "@playwright/test";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["scripts/codemirror-parity-spike.ts"],
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2022",
  write: false,
});
const output = result.outputFiles[0];
if (!output) throw new Error("CodeMirror spike did not produce a browser bundle");

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 1024, height: 768 },
  });
  const page = await context.newPage();
  let externalRequests = 0;
  page.on("request", (request) => {
    if (!request.url().startsWith("data:") && request.url() !== "about:blank") {
      externalRequests += 1;
    }
  });
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ content: output.text });
  const spike = await page.evaluate(() => window.runCodeMirrorParitySpike());
  const report = {
    ...spike,
    bundle: {
      rawBytes: output.contents.byteLength,
      gzipBytes: gzipSync(output.contents).byteLength,
    },
    environment: {
      engine: "Playwright Chromium",
      touchViewport: "1024x768",
      externalRequests,
    },
  };
  console.log(JSON.stringify(report, null, 2));
  if (externalRequests !== 0 || report.checks.some((check) => !check.passed)) {
    process.exitCode = 1;
  }
  await context.close();
} finally {
  await browser.close();
}
