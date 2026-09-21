/* Multi-step journeys several specs need, written once.
 *
 * Each is what a person does on screen — no shortcuts through storage — so a
 * spec that uses one is also, incidentally, re-testing the path it relies on.
 * Time passes by mining simulated blocks: a block confirms what was broadcast,
 * and the RGB++ simulator settles what confirmed.
 */

import { expect, type Browser, type Page } from "@playwright/test";
import type { App, Wallet } from "./fixtures";
import type { ChainSim } from "./chain";
import { PLATFORM_SECRET } from "./platform";
import { RgbppSim } from "./rgbpp";

export async function fundedWallet(app: App, sim: ChainSim, sats = 200_000): Promise<Wallet> {
  const wallet = await app.createBrowserKey();
  sim.fund(wallet.address, sats);
  return wallet;
}

/**
 * The platform's key, funded. On the testnet showcase the site offers mining
 * only on the platform's DEMO launch (`lib/launches/featured.ts`), so a spec
 * that mines announces DEMO under this key.
 */
export async function platformWallet(app: App, sim: ChainSim, sats = 200_000): Promise<Wallet> {
  const wallet = await app.restoreKey(PLATFORM_SECRET);
  sim.fund(wallet.address, sats);
  return wallet;
}

/** The symbol of the launch the site mines. */
export const MINEABLE = "DEMO";

export interface Draft {
  symbol: string;
  name?: string;
  blurb?: string;
  promoter?: string;
  opensInBlocks?: number;
  /** Project links by field label, e.g. `{ Website: "https://…", X: "@handle" }`. */
  links?: Record<string, string>;
  why?: string;
  plan?: string;
  /** Picture reference, e.g. `/tokens/demo.svg`. */
  image?: string;
}

/**
 * A wizard field by its label. A label carries its hint after " · " (a
 * character count, a fault), so match the name exactly up to there.
 */
export function field(page: Page, label: string) {
  const name = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${name}( ·|$)`));
}

/** Announce a launch through the wizard; returns its id from the URL it opens at. */
export async function announce(page: Page, draft: Draft): Promise<string> {
  await page.goto("/#/create");
  await page.getByLabel("Symbol").fill(draft.symbol);
  await page.getByLabel("Name").fill(draft.name ?? `${draft.symbol} collective`);
  await page.getByLabel("One sentence").fill(draft.blurb ?? "A community token for people who build things together.");
  await page.getByRole("button", { name: "Continue →" }).click();
  if (draft.promoter) await page.getByLabel("Ticket income to").fill(draft.promoter);
  await page.getByLabel("Opens in (blocks)").fill(String(draft.opensInBlocks ?? 1));
  await page.getByRole("button", { name: "Continue →" }).click();
  // Links, story and picture: optional.
  if (draft.image) await field(page, "Image").fill(draft.image);
  for (const [label, value] of Object.entries(draft.links ?? {})) await field(page, label).fill(value);
  if (draft.why) await field(page, "Why").fill(draft.why);
  if (draft.plan) await field(page, "The plan").fill(draft.plan);
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByRole("button", { name: `Announce ${draft.symbol}` }).click();
  await page.getByRole("button", { name: `Open ${draft.symbol}` }).click();
  await expect(page).toHaveURL(/#\/launch\/[a-z0-9]+-[0-9a-f]{16}$/);
  return decodeURIComponent(page.url().split("#/launch/")[1]);
}

/** Mine a block and let the page read the result. */
export async function block(page: Page, sim: ChainSim, count = 1): Promise<void> {
  sim.advance(count);
  await page.reload();
}

/**
 * Press the big MINE in the launch's header, if the wizard is not open yet.
 * Its accessible name is "Mine <SYMBOL>"; the arrow in front is decoration.
 */
export async function pressMine(page: Page): Promise<void> {
  const header = page.locator(".lh").getByRole("button", { name: /^Mine [A-Z0-9]+$/ });
  const wizard = page.getByRole("region", { name: /^Mine [A-Z0-9]+$/ });
  await expect(header.or(wizard).first()).toBeVisible({ timeout: 30_000 });
  if (await header.isVisible()) await header.click();
  await expect(wizard).toBeVisible();
}

/** The wizard's bar: back, the step's action, forward. Every loop action is pressed here. */
export function bar(page: Page) {
  return page.locator(".wz-bar");
}

/**
 * Buy a ticket on the launch page that is showing and arm it — a ticket that
 * creates its miner cell needs one block, then "Arm ticket" — and start mining
 * on it. After a mint, "Mine again" comes first. Returns once mining runs.
 */
export async function buyTicket(page: Page, sim: ChainSim): Promise<void> {
  await pressMine(page);
  const again = bar(page).getByRole("button", { name: "Mine again", exact: true });
  const sign = bar(page).getByRole("button", { name: "Sign ticket", exact: true });
  await expect(again.or(sign).first()).toBeVisible({ timeout: 30_000 });
  if (await again.isVisible()) await again.click();
  await expect(sign).toBeEnabled({ timeout: 30_000 });
  const creates = await page.getByText("Paymaster · new miner cell").isVisible();
  await sign.click();
  if (creates) {
    await expect(bar(page).getByRole("button", { name: "Waiting for a block" })).toBeVisible({ timeout: 30_000 });
    await block(page, sim);
    const arm = bar(page).getByRole("button", { name: "Arm ticket", exact: true });
    await expect(arm).toBeEnabled({ timeout: 30_000 });
    await arm.click();
  }
  // The armed ticket waits on its step until the person moves on to mine.
  await bar(page).getByRole("button", { name: "Mine →" }).click();
  await expect(bar(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible({ timeout: 30_000 });
}

/** Slide the wizard to one of its steps, to read what it left behind. */
export async function showStep(page: Page, title: "Wallet" | "Ticket" | "Mine" | "Mint"): Promise<void> {
  await page.locator(".wz-rail").getByRole("button", { name: new RegExp(`^Step \\d, ${title}:`) }).click();
}

/** The mining toggle while it is not running: Start on a fresh ticket, Continue after that. */
export function mineButton(page: Page) {
  return bar(page).getByRole("button", { name: /^(Start mining|Continue)$/ });
}

/** Pause if running, pick the CPU (deterministic under test), and mine again. */
export async function mineOnCpu(page: Page): Promise<void> {
  const pause = bar(page).getByRole("button", { name: "Pause", exact: true });
  if (await pause.isVisible()) await pause.click();
  await page.getByRole("group", { name: "Mining device" }).getByRole("button", { name: "CPU" }).click();
  await mineButton(page).click();
}

/** Mine on the CPU until a hash qualifies, then pause; returns the Accept button. */
export async function mineUntilMintable(page: Page, timeout = 180_000) {
  await mineOnCpu(page);
  const accept = bar(page).getByRole("button", { name: "Accept · mint →" });
  await expect(accept).toBeEnabled({ timeout });
  await bar(page).getByRole("button", { name: "Pause", exact: true }).click();
  return accept;
}

/** What the mint step says the kept hash mints, e.g. "784.00". */
export async function mintedShown(page: Page): Promise<string> {
  return ((await page.locator(".wz-mint-sum .stat").first().locator(".v").innerText()).match(/[0-9][0-9,.]*/) ?? [""])[0];
}

/**
 * The whole loop on the launch page that is showing: ticket, (arm,) mine, mint.
 * Returns the amount minted as displayed.
 */
export async function mintOnce(page: Page, sim: ChainSim): Promise<string> {
  await buyTicket(page, sim);
  await block(page, sim);
  const accept = await mineUntilMintable(page);
  await accept.click();
  const label = await mintedShown(page);
  const sign = bar(page).getByRole("button", { name: "Sign mint", exact: true });
  await expect(sign).toBeEnabled({ timeout: 30_000 });
  await sign.click();
  await expect(page.getByText(/ minted — landing\.$/)).toBeVisible({ timeout: 30_000 });
  await block(page, sim);
  await expect(bar(page).getByRole("button", { name: "Mine again", exact: true })).toBeVisible({ timeout: 30_000 });
  return label;
}

/** A second person, in their own browser, on the same simulated chains. */
export async function secondVisitor(browser: Browser, sim: ChainSim, rgbpp: RgbppSim): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  await sim.install(page);
  await rgbpp.install(page);
  return page;
}

/** Create a browser key on an arbitrary page (a second visitor has no `app`). */
export async function browserKeyOn(page: Page): Promise<Wallet> {
  await page.goto("/#/wallet");
  await page.getByRole("button", { name: "Create a browser key" }).click();
  await expect(page.locator(".copyable code").first()).toHaveText(/^tb1q/);
  const address = (await page.locator(".copyable code").first().innerText()).trim();
  const identity = await page.evaluate(
    () => (JSON.parse(localStorage.getItem("btcfun:vault:v1") ?? "{}") as { identity: string }).identity,
  );
  return { address, identity };
}
