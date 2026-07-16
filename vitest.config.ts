import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": fileURLToPath(new URL("./src/test-support/cloudflare-workers.ts", import.meta.url).href),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.e2e.ts", "src/**/*.workers.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.ts",
        "src/**/*.e2e.ts",
        "src/test-support.ts",
        "src/test-support/**",
        "src/client/app.ts",
        "src/client/pdf-viewer.ts",
        "src/api/github-connection.ts",
        "src/api/github-sync.ts",
        "src/api/workspace.ts",
        "src/durable-objects/**",
      ],
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
