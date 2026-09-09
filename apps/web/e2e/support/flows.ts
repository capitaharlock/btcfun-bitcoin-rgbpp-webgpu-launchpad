/* Multi-step journeys several specs need, written once.
 *
 * Each is what a person does on screen — no shortcuts through storage — so a
 * spec that uses one is also, incidentally, re-testing the path it relies on.
 */

import { createHash } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import { amountOf, type App, type Wallet } from "./fixtures";
import { ChainSim } from "./chain";

/** The launch's burn address as a scriptPubKey, derived independently of the app. */
export function reserveScript(launchId: string): string {
  const hash = createHash("sha256").update(`btc.fun/reserve/v1/${launchId}`).digest().subarray(0, 20);
  return `0014${hash.toString("hex")}`;
}

export async function fundedWallet(app: App, sim: ChainSim, sats = 50_000): Promise<Wallet> {
  const wallet = await app.createDemoKey();
  sim.fund(wallet.address, sats);
  return wallet;
}

export async function buyTicket(page: Page, timeout = 20_000): Promise<void> {
  const buy = page.getByRole("button", { name: /^Buy a ticket for epoch/ });
  await expect(buy).toBeEnabled({ timeout });
  await buy.click();
  await expect(page.getByText("ticket held")).toBeVisible({ timeout: 60_000 });
}

export async function mineUntilQualified(
  page: Page,
  device: "Auto" | "GPU" | "CPU" = "Auto",
  timeout = 180_000,
) {
  await page.getByRole("group", { name: "Mining device" }).getByRole("button", { name: device }).click();
  await page.getByRole("button", { name: "Mine", exact: true }).click();
  const claim = page.getByRole("button", { name: /^Claim / });
  await expect(claim).toBeVisible({ timeout });
  return claim;
}

/** Ticket, mine, claim on a launch page already open. Returns atoms claimed as shown. */
export async function claimOnce(page: Page, device: "Auto" | "GPU" | "CPU" = "GPU"): Promise<number> {
  await buyTicket(page);
  const claim = await mineUntilQualified(page, device);
  const shown = amountOf((await claim.innerText()).replace(/^Claim /, "").replace(/[A-Z]+$/, ""));
  await claim.click();
  await expect(page.getByText(/^Claimed /)).toBeVisible();
  return shown;
}

/** A second person, in their own browser, on the same simulated chain. */
export async function secondVisitor(browser: Browser, sim: ChainSim): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  await sim.install(page);
  return page;
}

/** Create a demo key on an arbitrary page (a second visitor has no `app`). */
export async function demoKeyOn(page: Page): Promise<Wallet> {
  await page.goto("/#/wallet");
  await page.getByRole("button", { name: "Create a demo key" }).click();
  await expect(page.locator(".copyable code").first()).toHaveText(/^tb1q/);
  const address = (await page.locator(".copyable code").first().innerText()).trim();
  const identity = await page.evaluate(
    () => (JSON.parse(localStorage.getItem("btcfun:vault:v1") ?? "{}") as { identity: string }).identity,
  );
  return { address, identity };
}

/** Text of the first Copyable carrying `label`. */
export async function copyableText(page: Page, index = 0): Promise<string> {
  return (await page.locator(".copyable code").nth(index).innerText()).trim();
}
