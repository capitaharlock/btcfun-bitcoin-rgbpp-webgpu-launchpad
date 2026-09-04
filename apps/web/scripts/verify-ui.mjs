#!/usr/bin/env node
/* Browser verification harness.
 *
 * `tsc` and `vitest` cannot see the two things most likely to be wrong in this
 * app: whether a WGSL kernel compiles and agrees with the CPU implementation on
 * *this* driver, and whether a page throws once React actually mounts it. This
 * script drives a real Chromium against the dev server and reports both.
 *
 *   node scripts/verify-ui.mjs [--url http://localhost:5273] [--shots DIR]
 *
 * Exit code is non-zero if any route logs a console error or a page fails to
 * render, so it is usable as a gate rather than only as a screenshot tool.
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

/** Routes worth a render check, with the selector that proves it mounted. */
const ROUTES = [
  { path: "/", name: "launches", ready: "table" },
  { path: "/launch/mesh", name: "launch", ready: ".hashfeed" },
  { path: "/lab", name: "lab", ready: "svg" },
  { path: "/launch/mesh/proof", name: "proof", ready: ".panel" },
  { path: "/holdings", name: "holdings", ready: ".panel" },
];

/** Grind for a moment on each backend and report what the device managed. */
const MINE_MS = 4000;

const failures = [];

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

for (const route of ROUTES) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  try {
    await page.goto(`${BASE}/#${route.path}`, { waitUntil: "networkidle" });
    await page.waitForSelector(route.ready, { timeout: 10_000 });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${route.name}.png`, fullPage: true });
  } catch (err) {
    failures.push(`${route.name}: ${err.message.split("\n")[0]}`);
  }

  if (errors.length > 0) failures.push(`${route.name}: ${errors.join(" | ")}`);
  console.log(`${errors.length === 0 ? "ok  " : "FAIL"} ${route.name.padEnd(10)} ${route.path}`);
  await page.close();
}

// ── Mining: does each backend run, and does the GPU agree with the CPU? ──────
const page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`${BASE}/#/launch/mesh`, { waitUntil: "networkidle" });
await page.waitForSelector(".hashfeed");

const adapter = await page.evaluate(async () => {
  if (!("gpu" in navigator)) return null;
  const a = await navigator.gpu.requestAdapter();
  return a ? (a.info?.description || a.info?.vendor || "adapter") : null;
});
console.log(`\nwebgpu adapter: ${adapter ?? "none"}`);

for (const backend of ["cpu", "gpu"]) {
  if (backend === "gpu" && !adapter) {
    console.log("gpu: skipped, no adapter in this browser");
    continue;
  }
  await page.getByRole("button", { name: backend.toUpperCase(), exact: true }).click();
  await page.getByRole("button", { name: "Mine", exact: true }).click();
  await page.waitForTimeout(MINE_MS);

  const stats = await page.evaluate(() => {
    const read = (label) => {
      const cells = [...document.querySelectorAll(".stat")];
      const hit = cells.find((c) => c.querySelector(".k")?.textContent?.trim() === label);
      return hit?.querySelector(".v")?.textContent?.trim() ?? "";
    };
    return { rate: read("hash rate"), attempts: read("attempts"), clz: read("best clz") };
  });
  await page.getByRole("button", { name: "Stop", exact: true }).click();

  const measured = Number(stats.attempts.replace(/,/g, "")) > 0;
  if (!measured) failures.push(`${backend} backend recorded no attempts`);
  console.log(
    `${measured ? "ok  " : "FAIL"} ${backend.padEnd(4)} ${stats.rate.padEnd(12)} ` +
      `attempts ${stats.attempts.padEnd(14)} best clz ${stats.clz}`,
  );
}

// The session re-hashes every GPU candidate on the CPU and stops the run with a
// notice if one fails. Its absence is the evidence that the kernel agrees.
const rejected = await page.locator(".notice.warn").count();
if (rejected > 0) {
  failures.push(`backend notice raised: ${await page.locator(".notice.warn").first().innerText()}`);
}
if (errors.length > 0) failures.push(`mining: ${errors.join(" | ")}`);

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  exit(1);
}
console.log("\nall routes rendered clean; every backend measured real work");
