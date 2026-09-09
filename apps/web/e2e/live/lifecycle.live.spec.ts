/* The whole product on testnet4, with real satoshis, through the browser.
 *
 * Two people, two browsers, one real chain:
 *
 *   Alice  the funded end-to-end wallet, restored through the wallet page
 *   Bob    a fresh demo key with no bitcoin at all
 *
 * Alice buys a ticket, mines and claims MESH, and sends some to Bob. Bob lists
 * one MESH for sale; Alice pays for it with a real transaction; Bob's page finds
 * that payment on testnet4 by itself and he delivers; Alice receives the chain
 * and holds what she bought. Then Alice creates a token of her own, waits for
 * the chain to open it, and mines that too.
 *
 * Every transaction the browser broadcasts is fetched back from mempool.space
 * and checked: it exists, and it pays what the page said, to where it said.
 *
 * Runs only with E2E_LIVE=1. Costs about 4,000 sat plus fees.
 */

import { createHash } from "node:crypto";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { amountOf, kv } from "../support/fixtures";
import { fetchTx, fundedSecret, tipHeight } from "../support/funded";

const LIVE = process.env.E2E_LIVE === "1";
const MESH_TICKET = 2_000;
const PRICE = 1_000;

function reserveScript(launchId: string): string {
  const hash = createHash("sha256").update(`btc.fun/reserve/v1/${launchId}`).digest().subarray(0, 20);
  return `0014${hash.toString("hex")}`;
}

test.describe.configure({ mode: "serial" });
test.skip(!LIVE, "live money: set E2E_LIVE=1");

let contexts: BrowserContext[] = [];
let alice: Page;
let bob: Page;
const errors: string[] = [];
const notes: string[] = [];
let aliceIdentity = "";
let bobIdentity = "";
let bobAddress = "";
let offerJson = "";
let createdId = "";

async function open(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  return page;
}

async function identityOf(page: Page): Promise<string> {
  return page.evaluate(
    () => (JSON.parse(localStorage.getItem("btcfun:vault:v1") ?? "{}") as { identity: string }).identity,
  );
}

async function copyable(page: Page, label: string): Promise<string> {
  return (
    await page
      .locator(".copyable")
      .filter({ has: page.getByRole("button", { name: `Copy ${label}` }) })
      .first()
      .locator("code")
      .innerText()
  ).trim();
}

async function mineAndClaim(page: Page): Promise<string> {
  await page.getByRole("group", { name: "Mining device" }).getByRole("button", { name: "GPU" }).click();
  await expect(page.getByRole("button", { name: "Mine", exact: true })).toBeEnabled({ timeout: 120_000 });
  const started = Date.now();
  await page.getByRole("button", { name: "Mine", exact: true }).click();
  const claim = page.getByRole("button", { name: /^Claim / });
  await expect(claim).toBeVisible({ timeout: 300_000 });
  const label = await claim.innerText();
  await claim.click();
  await expect(page.getByText(/^Claimed /)).toBeVisible();
  return `${label} after ${((Date.now() - started) / 1000).toFixed(1)} s on the GPU`;
}

test.beforeAll(async ({ browser }) => {
  alice = await open(browser);
  bob = await open(browser);
});

test.afterAll(async () => {
  for (const c of contexts) await c.close();
  contexts = [];
});

test.afterEach(async ({}, testInfo) => {
  for (const note of notes.splice(0)) testInfo.annotations.push({ type: "ux", description: note });
  expect(errors, "a page raised uncaught errors").toEqual([]);
});

test("Alice restores the funded wallet through the wallet page", async () => {
  const secret = fundedSecret();
  test.skip(!secret, "no funded wallet — run `npm run e2e:wallet` and fund it");

  await alice.goto("/#/wallet");
  await alice.getByRole("button", { name: "Restore from a secret" }).click();
  await alice.getByPlaceholder("64 hex characters").fill(secret!);
  await alice.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(alice.locator(".copyable code").first()).toHaveText(/^tb1q/);
  aliceIdentity = await identityOf(alice);

  const balance = alice.locator(".stat").filter({ hasText: "balance" });
  await expect(balance).not.toContainText("—", { timeout: 30_000 });
  const tbtc = amountOf((await balance.innerText()).replace(/balance|tBTC/gi, ""));
  expect(tbtc).toBeGreaterThan(0.00005);
  notes.push(`Alice restored the funded wallet; the page showed ${tbtc} tBTC.`);
});

test("Bob creates a demo key with no bitcoin at all", async () => {
  await bob.goto("/#/wallet");
  await bob.getByRole("button", { name: "Create a demo key" }).click();
  await expect(bob.locator(".copyable code").first()).toHaveText(/^tb1q/);
  bobAddress = (await bob.locator(".copyable code").first().innerText()).trim();
  bobIdentity = await identityOf(bob);
});

test("Alice buys a real MESH ticket, found on testnet4", async () => {
  await alice.goto("/#/launch/mesh");
  const buy = alice.getByRole("button", { name: /^Buy a ticket for epoch/ });
  await expect(buy).toBeEnabled({ timeout: 30_000 });
  await buy.click();
  await expect(alice.getByText("ticket held")).toBeVisible({ timeout: 60_000 });

  const href = await alice.getByRole("link", { name: /… ↗$/ }).first().getAttribute("href");
  const txid = href!.split("/").pop()!;
  const tx = await fetchTx(txid);
  expect(tx.vout.find((o) => o.scriptpubkey === reserveScript("mesh"))?.value).toBe(MESH_TICKET);
  expect(tx.vout.some((o) => o.scriptpubkey_type === "op_return")).toBe(true);
  const rate = tx.fee / (tx.weight / 4);
  expect(rate).toBeGreaterThanOrEqual(1);
  notes.push(`Ticket ${txid}: ${MESH_TICKET} sat to the MESH burn address, fee ${tx.fee} sat (${rate.toFixed(2)} sat/vB).`);
});

test("Alice mines on the GPU and claims MESH", async () => {
  notes.push(`MESH claimed: ${await mineAndClaim(alice)}.`);
  await expect(kv(alice, "Records")).toHaveText("1");
  await alice.goto("/#/launch/mesh/proof");
  await expect(alice.getByText(/1 records replayed/)).toBeVisible();
});

test("Alice sends Bob two MESH, and Bob receives the chain", async () => {
  await alice.goto("/#/holdings");
  const card = alice.locator(".panel").filter({ has: alice.getByRole("group", { name: "MESH actions" }) });
  await card.getByLabel("recipient public key").fill(bobIdentity);
  await card.getByLabel("amount").fill("2");
  await card.getByRole("button", { name: "Send MESH" }).click();
  await card.getByRole("group", { name: "MESH actions" }).getByRole("button", { name: "Backup", exact: true }).click();
  await card.getByRole("button", { name: "Export this chain" }).click();
  const chain = await copyable(alice, "ledger chain");

  await bob.goto("/#/holdings");
  await bob.getByLabel("chain you were sent").fill(chain);
  await bob.getByRole("button", { name: "Verify and receive" }).click();
  await expect(bob.getByText("Verified. Your MESH position is below.")).toBeVisible();
  await bob.goto("/#/launch/mesh");
  await expect(kv(bob, "You hold")).toHaveText("2.0000 MESH");
});

test("Bob lists one MESH for sale", async () => {
  await bob.goto("/#/market/mesh");
  const panel = bob.locator(".panel").filter({ has: bob.getByRole("heading", { name: "Make an offer" }) });
  await panel.getByLabel(/amount \(MESH\)/).fill("1");
  await panel.getByLabel(/price \(satoshis\)/).fill(String(PRICE));
  await panel.getByRole("button", { name: "Sign the offer" }).click();
  offerJson = await copyable(bob, "signed offer");
  expect(JSON.parse(offerJson).offer.payTo).toBe(bobAddress);
});

test("Alice pays Bob for real; the payment names the offer and Alice", async () => {
  await alice.goto("/#/market/mesh");
  await alice.getByLabel("signed offer").fill(offerJson);
  await alice.getByRole("button", { name: "Verify and add" }).click();
  const row = alice.locator("tbody tr").filter({ hasText: "open" }).first();
  await row.getByRole("button", { name: `Pay ${PRICE.toLocaleString("en-US")}` }).click();
  await expect(alice.getByText(/The seller's page finds your payment on chain by itself/)).toBeVisible({
    timeout: 60_000,
  });

  const history = (await (await fetch(`https://mempool.space/testnet4/api/address/${bobAddress}/txs`)).json()) as Array<{
    txid: string;
    vout: Array<{ scriptpubkey: string; scriptpubkey_address?: string; value: number }>;
  }>;
  const payment = history.find((tx) => tx.vout.some((o) => o.scriptpubkey_address === bobAddress));
  expect(payment, "the payment reached Bob's address on testnet4").toBeTruthy();
  expect(payment!.vout.find((o) => o.scriptpubkey_address === bobAddress)?.value).toBe(PRICE);
  const memo = payment!.vout.find((o) => o.scriptpubkey.startsWith("6a"))!.scriptpubkey;
  expect(memo).toContain(Buffer.from("btcfun:f2:").toString("hex"));
  expect(memo).toContain(aliceIdentity);
  notes.push(`Payment ${payment!.txid}: ${PRICE} sat to Bob, memo naming the offer and Alice's key.`);
});

test("Bob's page finds the payment on testnet4 by itself, and he delivers", async () => {
  await bob.goto("/#/");
  await bob.goto("/#/market/mesh");
  await expect(bob.getByText(/The buyer's payment is on chain and names this offer/)).toBeVisible({
    timeout: 120_000,
  });
  await bob.getByRole("button", { name: "Sign the transfer" }).click();
  await expect(bob.getByText(/^Delivered\./)).toBeVisible();
  const chain = await copyable(bob, "your chain, for the buyer");
  expect(JSON.parse(chain).records.at(-1).body.to).toBe(aliceIdentity);

  await alice.goto("/#/holdings");
  await alice.getByLabel("chain you were sent").fill(chain);
  await alice.getByRole("button", { name: "Verify and receive" }).click();
  await expect(alice.getByText("Verified. Your MESH position is below.")).toBeVisible();
  await alice.goto("/#/market/mesh");
  await expect(alice.getByText("settled").first()).toBeVisible();
  notes.push("A real sale settled between two browsers: Bob learned of the payment from testnet4, delivered, and Alice received.");
});

test("Alice creates a token through the wizard", async () => {
  await alice.goto("/#/create");
  await alice.getByLabel(/^Symbol/).fill("LIVEQA");
  await alice.getByLabel(/^Name/).fill("Live quality run");
  await alice.getByLabel(/^One sentence/).fill("Created, opened and mined on testnet4 by the browser suite.");
  await alice.getByRole("button", { name: "Continue →" }).click();
  await alice.getByLabel(/^Opens in/).fill("1");
  await alice.getByLabel(/^Ticket price/).fill("1000");
  await alice.getByLabel(/^Difficulty/).fill("20");
  await alice.getByRole("button", { name: "Continue →" }).click();
  await alice.getByRole("button", { name: "Continue →" }).click();
  await alice.getByRole("button", { name: "Commit LIVEQA" }).click();
  await expect(alice.getByRole("heading", { name: "LIVEQA is committed" })).toBeVisible();
  await alice.getByRole("button", { name: "Open LIVEQA" }).click();
  createdId = alice.url().split("/launch/")[1];
  expect(createdId).toMatch(/^liveqa-[0-9a-f]{16}$/);
});

test("testnet4 opens the new token, and Alice mines it for real", async () => {
  test.setTimeout(75 * 60_000);
  const opensAt = Number(
    (await alice.getByText(/h₀ [\d,]+/).innerText()).match(/h₀ ([\d,]+)/)![1].replace(/,/g, ""),
  );
  const waitStarted = Date.now();
  while ((await tipHeight()) < opensAt) await new Promise((r) => setTimeout(r, 30_000));
  const waited = (Date.now() - waitStarted) / 60_000;

  await alice.goto(`/#/launch/${createdId}`);
  await expect(alice.getByText("mining", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  const buy = alice.getByRole("button", { name: /^Buy a ticket for epoch/ });
  await expect(buy).toBeEnabled({ timeout: 60_000 });
  await buy.click();
  await expect(alice.getByText("ticket held")).toBeVisible({ timeout: 60_000 });
  notes.push(
    `LIVEQA opened at ${opensAt} after ${waited.toFixed(1)} min; ${await mineAndClaim(alice)} — mined on the token we created.`,
  );
});
