import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"], // e2e/*.spec.ts belongs to Playwright
    reporters: ["default", "junit"],
    outputFile: { junit: "reports/junit.xml" },
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // server.ts is covered by the Playwright e2e tests
      exclude: ["src/cli.ts", "src/server.ts"],
      reporter: ["text", "html", "lcov"],
      thresholds: { lines: 80, functions: 80, branches: 80 },
    },
  },
});
