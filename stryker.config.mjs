// @ts-check

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
const config = {
  $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  checkers: ["typescript"],
  cleanTempDir: "always",
  concurrency: "50%",
  htmlReporter: {
    fileName: "reports/mutation/index.html",
  },
  ignorePatterns: [".wrangler/**"],
  mutate: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/*.test.ts",
    "!src/**/*.e2e.ts",
    "!src/test-support.ts",
    "!src/test-support/**",
    "!src/client/app.ts",
    "!src/client/markdown-runtime.ts",
    "!src/client/pdfjs-runtime.ts",
    "!src/client/pdf-viewer.ts",
    "!src/client/review-study.ts",
    "!src/client/service-worker.ts",
    "!src/api/**",
    "!src/durable-objects/**",
  ],
  packageManager: "npm",
  reporters: ["clear-text", "progress", "html", "json"],
  testRunner: "vitest",
  thresholds: {
    high: 90,
    low: 80,
    break: 80,
  },
  tsconfigFile: "tsconfig.json",
  typescriptChecker: {
    prioritizePerformanceOverAccuracy: true,
  },
  vitest: {
    configFile: "vitest.config.ts",
    related: true,
  },
};

export default config;
