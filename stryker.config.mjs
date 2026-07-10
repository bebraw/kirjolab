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
  mutate: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/*.test.ts",
    "!src/**/*.e2e.ts",
    "!src/test-support.ts",
    "!src/test-support/**",
    "!src/client/app.ts",
    "!src/api/workspace.ts",
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
