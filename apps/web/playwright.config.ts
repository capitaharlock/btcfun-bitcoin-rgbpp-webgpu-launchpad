/* The browser suite.
 *
 *   ui      Deterministic. The Bitcoin provider is simulated, so the block
 *           height — the emission schedule's clock — is whatever a test says it
 *           is. This is where time is moved forward a day, a week, twenty-one
 *           days, and where every wrong input is tried. Nothing leaves the machine.
 *
 *   mobile  The layout, docs and wizard specs again on a phone viewport.
 *
 * Real testnet runs are the command-line runners (`npm run rgbpp:live`), not
 * a browser project: they spend, and must never start from a test glob.
 *
 * `HEADED=1` shows the browser; `SLOWMO=<ms>` slows it enough to follow.
 */

import { TEST_CERT_KEY } from "./src/lib/launches/certificate";
import { defineConfig, devices } from "@playwright/test";
import { PLATFORM_IDENTITY } from "./e2e/support/platform";

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
      testMatch: /\/(layout|docs|wizard)\.spec\.ts$/,
      timeout: 60_000,
      use: { ...devices["Pixel 7"] },
    },
  ],
  // The production build, served statically: what ships, and fast enough that
  // parallel workers never wait on a dev server compiling modules on demand.
  webServer: {
    command: `npx vite build --logLevel error && npx vite preview --port ${PORT} --strictPort`,
    // The platform's identity is build configuration; the suite's is the key
    // `e2e/support/platform.ts` restores, so it can announce the DEMO launch.
    env: { VITE_PLATFORM_IDENTITY: PLATFORM_IDENTITY, VITE_PLATFORM_CERT_KEY: TEST_CERT_KEY },
    port: PORT,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
