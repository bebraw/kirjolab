import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.e2e.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}"],
      exclude: ["src/**/*.d.ts", "src/**/*.test.ts", "src/**/*.e2e.ts", "src/test-support.ts"],
      reporter: ["text", "html"],
      reportsDirectory: "reports/coverage",
      thresholds: {
        branches: 80,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
