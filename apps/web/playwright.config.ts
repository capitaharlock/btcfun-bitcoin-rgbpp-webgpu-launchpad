/* The browser suite.
 *
 * Two projects, because they answer different questions and must never be
 * confused:
 *
 *   ui    Deterministic. The Bitcoin provider is simulated, so the block height
 *         — the emission schedule's clock — is whatever a test says it is. This
 *         is where time is moved forward a day, a week, twenty-one days, and
 *         where every wrong input is tried. Nothing leaves the machine.
 *
 *   live  Real testnet3 and CKB testnet, real satoshis, the funded end-to-end wallet restored
 *         through the wallet page like any user would. Serial, slow, and the
 *         only project that can spend money. Skipped unless E2E_LIVE=1.
 *
 * `HEADED=1` shows the browser; `SLOWMO=<ms>` slows it enough to follow.
 */

import { defineConfig, devices } from "@playwright/test";

const PORT = 5273;
const headed = process.env.HEADED === "1";
const slowMo = Number(process.env.SLOWMO ?? (headed ? 120 : 0));

// Chromium gates WebGPU behind these outside a normal desktop profile.
const WEBGPU_ARGS = ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=metal"];

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e-output/artifacts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [
    ["list"],
    ["json", { outputFile: "e2e-output/results.json" }],
    ["html", { outputFolder: "e2e-output/html", open: "never" }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 960 },
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    headless: !headed,
    launchOptions: { args: WEBGPU_ARGS, slowMo },
  },
  projects: [
    {
      name: "ui",
      testDir: "e2e/ui",
      timeout: 60_000,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 960 } },
    },
    {
      name: "mobile",
      testDir: "e2e/ui",
      testMatch: /layout\.spec\.ts/,
      timeout: 60_000,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "live",
      testDir: "e2e/live",
      // Its own artifact folder: a concurrent `ui` run cleans the shared one.
      outputDir: "e2e-output/live-artifacts",
      // One wallet, one UTXO set: two runs in parallel would double-spend.
      workers: 1,
      timeout: 45 * 60_000,
      retries: 0,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 960 } },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
