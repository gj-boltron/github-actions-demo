import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const baseURL = `http://localhost:${String(port)}`;
const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: ci, // a stray test.only fails the CI run
  retries: ci ? 2 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never" }], // never block a terminal or CI job waiting for a browser
    ["junit", { outputFile: "reports/e2e-junit.xml" }],
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Builds the app and starts it before the tests, stops it afterwards
  webServer: {
    command: "pnpm build && node dist/server.js",
    url: baseURL,
    env: { PORT: String(port) },
    reuseExistingServer: !ci,
  },
});
