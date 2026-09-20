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

/** Open a miner cell on the launch page that is showing, and let it settle. */
export async function openMiner(page: Page, sim: ChainSim): Promise<void> {
  await page.getByRole("button", { name: "Open miner cell" }).click();
  await expect(page.getByText("Opening your miner cell")).toBeVisible();
  await block(page, sim);
  await expect(page.getByRole("button", { name: /^Buy ticket/ })).toBeVisible({ timeout: 30_000 });
}

/** Buy a ticket; returns once mining is possible (the ticket is landing). */
export async function buyTicket(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Buy ticket/ }).click();
  await expect(page.getByRole("button", { name: "Mine", exact: true })).toBeVisible({ timeout: 30_000 });
}

/** The one mining toggle while it is not running: MINE on a fresh ticket, CONTINUE after that. */
export function mineButton(page: Page) {
  return page.getByRole("button", { name: /^(Mine|Continue)$/ });
}

/** Mine on the CPU until a hash qualifies; returns the mint button. */
export async function mineUntilMintable(page: Page, timeout = 180_000) {
  await page.getByRole("group", { name: "Mining device" }).getByRole("button", { name: "CPU" }).click();
  await mineButton(page).click();
  const mint = page.getByRole("button", { name: /^Mint [0-9,.]+ / });
  await expect(mint).toBeVisible({ timeout });
  await page.getByRole("button", { name: "Pause" }).click();
  return mint;
}

/** The whole loop on the launch page that is showing: open, ticket, mine, mint. Returns atoms minted as displayed. */
export async function mintOnce(page: Page, sim: ChainSim): Promise<string> {
  // Wait for the page to have read the chain before deciding which step it is on.
  const step = page.getByRole("button", { name: /^(Open miner cell|Buy ticket)/ });
  await expect(step).toBeVisible({ timeout: 30_000 });
  // DOM text, not rendered text: button labels are upper-cased by the theme.
  if (((await step.textContent()) ?? "").startsWith("Open")) await openMiner(page, sim);
  await buyTicket(page);
  await block(page, sim);
  const mint = await mineUntilMintable(page);
  const label = ((await mint.textContent()) ?? "").replace(/^Mint /, "").trim();
  await mint.click();
  await expect(page.getByText(/^Minting /)).toBeVisible();
  await block(page, sim);
  await expect(page.getByRole("button", { name: /^Buy ticket/ })).toBeVisible({ timeout: 30_000 });
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
