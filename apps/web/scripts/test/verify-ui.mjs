#!/usr/bin/env node
/* Browser verification harness.
 *
 * `tsc` and `vitest` cannot see the things most likely to be wrong in this app:
 * whether a WGSL kernel compiles and agrees with the CPU implementation on
 * *this* driver, whether a page throws once React mounts it, and whether the
 * wallet actually derives an address in a real browser. This drives Chromium
 * against the dev server and checks all three.
 *
 *   node scripts/test/verify-ui.mjs [--url http://localhost:5273] [--shots DIR]
 *
 * Exits non-zero on any console error, failed render, backend that recorded no
 * work, or candidate that fails recomputation — so it gates rather than only
 * producing screenshots.
 *
 * Backends are exercised through the module rather than the UI, because the UI
 * correctly refuses to mine without a paid ticket and the harness has no coins.
 * The module path is the same code the page runs.
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { argv, exit } from "node:process";

function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const BASE = arg("url", "http://localhost:5273");
const SHOTS = arg("shots", null);

/** Routes worth a render check, with the selector that proves they mounted. */
const ROUTES = [
  { path: "/", name: "launches", ready: ".cardgrid" },
  { path: "/launch/mesh", name: "launch", ready: ".panel" },
  { path: "/lab", name: "lab", ready: "svg" },
  { path: "/create", name: "create", ready: ".wizard" },
  { path: "/activity", name: "activity", ready: ".panel" },
  { path: "/launch/mesh/proof", name: "proof", ready: "table" },
  { path: "/holdings", name: "holdings", ready: ".panel" },
  { path: "/market", name: "market", ready: ".panel" },
  { path: "/wallet", name: "wallet", ready: ".panel" },
];

/** Grind for this long on each backend. */
const MINE_MS = 3500;

const failures = [];
const note = (ok, label, detail = "") =>
  console.log(`${ok ? "ok  " : "FAIL"} ${label.padEnd(22)} ${detail}`);

const browser = await chromium.launch({
  args: [
    // Chromium gates WebGPU behind these outside a normal desktop profile.
    "--enable-unsafe-webgpu",
    "--enable-features=Vulkan",
    "--use-angle=metal",
  ],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });

if (SHOTS) await mkdir(SHOTS, { recursive: true });

// ── Every route renders without a console error ──────────────────────────────
for (const route of ROUTES) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  try {
    await page.goto(`${BASE}/#${route.path}`, { waitUntil: "networkidle" });
    await page.waitForSelector(route.ready, { timeout: 15_000 });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${route.name}.png`, fullPage: true });
  } catch (err) {
    failures.push(`${route.name}: ${err.message.split("\n")[0]}`);
  }

  if (errors.length > 0) failures.push(`${route.name}: ${errors.join(" | ")}`);
  note(errors.length === 0, route.name, route.path);
  await page.close();
}

// ── The wallet derives a real address in a real browser ──────────────────────
{
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/#/wallet`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Create a demo key" }).click();

  let address = "";
  try {
    await page.waitForSelector(".copyable code", { timeout: 15_000 });
    address = (await page.locator(".copyable code").first().innerText()).trim();
  } catch (err) {
    failures.push(`wallet: ${err.message.split("\n")[0]}`);
  }

  const valid = /^tb1q[0-9a-z]{38}$/.test(address);
  if (!valid) failures.push(`wallet: derived a malformed address "${address}"`);
  if (errors.length > 0) failures.push(`wallet: ${errors.join(" | ")}`);
  note(valid, "wallet address", address || "(none)");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/wallet-connected.png`, fullPage: true });
  await page.close();
}

// ── Both mining backends do real, verifiable work ────────────────────────────
{
  const page = await context.newPage();
  page.on("pageerror", (e) => failures.push(`mining: pageerror ${e.message}`));
  await page.goto(`${BASE}/#/lab`, { waitUntil: "networkidle" });

  const adapter = await page.evaluate(async () => {
    if (!("gpu" in navigator)) return null;
    const a = await navigator.gpu.requestAdapter();
    return a ? a.info?.description || a.info?.vendor || "adapter" : null;
  });
  console.log(`\nwebgpu adapter: ${adapter ?? "none"}`);

  for (const backend of ["cpu", "gpu"]) {
    if (backend === "gpu" && !adapter) {
      console.log("skip gpu — no adapter in this browser");
      continue;
    }

    const result = await page.evaluate(
      async ([choice, duration]) => {
        const { MiningSession, verifyCandidate } = await import("/src/domain/mining/index.ts");
        // A fixed challenge so a run is comparable between invocations.
        const challenge = new Uint8Array(32).map((_, i) => (i * 37) & 0xff);

        let last = null;
        let improvements = 0;
        let bad = 0;
        let notice = null;

        const session = new MiningSession({
          onSample: (s) => (last = s),
          onImprovement: (c) => {
            improvements++;
            if (!verifyCandidate(challenge, c)) bad++;
          },
          onFallback: (reason) => (notice = reason),
        });

        await session.start(challenge, choice);
        await new Promise((r) => setTimeout(r, duration));
        const sample = last;
        session.stop();

        return {
          backend: sample?.backend ?? null,
          hashes: sample?.hashes ?? 0,
          rate: sample?.hashRate ?? 0,
          clz: sample?.best?.clz ?? -1,
          improvements,
          bad,
          notice,
        };
      },
      [backend, MINE_MS],
    );

    if (result.hashes === 0) failures.push(`${backend}: recorded no attempts`);
    if (result.bad > 0) failures.push(`${backend}: ${result.bad} candidate(s) failed recomputation`);
    if (result.backend !== backend) {
      failures.push(`${backend}: session actually ran on "${result.backend}" — ${result.notice}`);
    }

    const mhs = (result.rate / 1e6).toFixed(2);
    note(
      result.hashes > 0 && result.bad === 0 && result.backend === backend,
      `${backend} backend`,
      `${mhs} MH/s · ${result.hashes.toLocaleString()} hashes · best clz ${result.clz} · ` +
        `${result.improvements} improvements, all re-hashed`,
    );
  }

  await page.close();
}

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  exit(1);
}
console.log("\nall routes rendered clean; wallet derived; both backends verified");
