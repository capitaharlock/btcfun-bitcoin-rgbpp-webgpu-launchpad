/* Selling and buying tokens between two people, and every way it must refuse. */

import type { Page } from "@playwright/test";
import { test, expect, kv } from "../support/fixtures";
import { claimOnce, demoKeyOn, fundedWallet, secondVisitor } from "../support/flows";
import type { ChainSim } from "../support/chain";

const PRICE = 3_000;

async function signOffer(page: Page, amount = "1", price = String(PRICE)): Promise<string> {
  await page.goto("/#/market/mesh");
  const panel = page.locator(".panel").filter({ has: page.getByRole("heading", { name: "Make an offer" }) });
  await panel.getByLabel(/amount \(MESH\)/).fill(amount);
  await panel.getByLabel(/price \(satoshis\)/).fill(price);
  await panel.getByRole("button", { name: "Sign the offer" }).click();
  await expect(panel.getByText(/^Signed\. Send this to a buyer/)).toBeVisible();
  return (await panel.locator(".copyable code").first().innerText()).trim();
}

async function addOffer(page: Page, json: string) {
  await page.goto("/#/market/mesh");
  await page.getByLabel("signed offer").fill(json);
  await page.getByRole("button", { name: "Verify and add" }).click();
}

/** Alice claims MESH and signs an offer. Returns the offer JSON. */
async function aliceSells(page: Page, app: Parameters<typeof fundedWallet>[0], sim: ChainSim) {
  const alice = await fundedWallet(app, sim);
  await app.goto("/launch/mesh");
  await claimOnce(page);
  return { alice, offer: await signOffer(page) };
}

test.describe("market", () => {
  // These journeys start by mining a claim; on a machine without WebGPU that
  // falls back to the CPU, whose time to 24 zero bits has a long tail.
  test.describe.configure({ timeout: 240_000 });
  test.beforeEach(async ({ app, sim }) => {
    await app.pinOrigin("mesh", sim.tip - 3);
  });

  test("a complete sale between two browsers", async ({ page, app, sim, browser, ux }) => {
    const { alice, offer } = await aliceSells(page, app, sim);

    // Bob, in his own browser, adds the offer he was sent and pays for it.
    const bob = await secondVisitor(browser, sim);
    const bobWallet = await demoKeyOn(bob);
    sim.fund(bobWallet.address, 20_000);
    await bob.getByRole("button", { name: "Refresh" }).click();
    await addOffer(bob, offer);
    const row = bob.locator("tbody tr").filter({ hasText: "open" }).first();
    await row.getByRole("button", { name: `Pay ${PRICE.toLocaleString("en-US")}` }).click();
    await expect(bob.getByText("awaiting-transfer").first()).toBeVisible();
    await expect(bob.getByText(/The seller's page finds your payment on chain by itself/)).toBeVisible();

    // The payment on chain pays Alice and names both the offer and Bob.
    const payment = sim.broadcasts.at(-1)!;
    expect(payment.outputs.find((o) => o.address === alice.address)?.amount).toBe(BigInt(PRICE));
    const memo = payment.outputs.find((o) => o.script.startsWith("6a"))!.script;
    expect(memo).toContain(Buffer.from("btcfun:f2:").toString("hex"));
    expect(memo).toContain(bobWallet.identity);

    // Alice's page finds the payment itself — nothing was handed back. It
    // watches her address every 30 s; "Check now" looks immediately.
    await page.goto("/#/market/mesh");
    await expect(page.getByText("watching for payments")).toBeVisible();
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.getByText(/The buyer's payment is on chain and names this offer/)).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Sign the transfer" }).click();
    await expect(page.getByText("settled").first()).toBeVisible();
    const chain = (
      await page
        .locator(".copyable")
        .filter({ has: page.getByRole("button", { name: "Copy your chain, for the buyer" }) })
        .locator("code")
        .innerText()
    ).trim();
    const delivered = JSON.parse(chain).records.at(-1).body;
    expect(delivered.to).toBe(bobWallet.identity);

    // Bob receives the chain and holds what he bought.
    await bob.goto("/#/holdings");
    await bob.getByLabel("chain you were sent").fill(chain);
    await bob.getByRole("button", { name: "Verify and receive" }).click();
    await bob.goto("/#/launch/mesh");
    await expect(kv(bob, "You hold")).toHaveText("1.0000 MESH");
    await bob.goto("/#/market/mesh");
    await expect(bob.getByText("settled").first()).toBeVisible();

    ux.note(
      "A two-browser sale now completes with two hand-overs — the offer out, the chain back. The seller learns of the payment from the chain.",
    );
  });

  test.describe("refuses", () => {
    test("an offer that is not JSON", async ({ page, app }) => {
      await app.createDemoKey();
      await addOffer(page, "an offer, honestly");
      await expect(page.locator(".notice.warn").filter({ hasText: "not valid JSON" })).toBeVisible();
    });

    test("an offer whose price was edited after signing", async ({ page, app, sim }) => {
      const { offer } = await aliceSells(page, app, sim);
      const tampered = JSON.parse(offer);
      tampered.offer.priceSats = "1";
      const bob = await secondVisitor(page.context().browser()!, sim);
      await demoKeyOn(bob);
      await addOffer(bob, JSON.stringify(tampered));
      await expect(bob.locator(".notice.warn").filter({ hasText: "Signature does not verify" })).toBeVisible();
      await expect(bob.locator("tbody tr")).toHaveCount(0);
    });

    test("an offer for a different launch", async ({ page, app, sim }) => {
      const { offer } = await aliceSells(page, app, sim);
      await page.goto("/#/market/obsv");
      await page.getByLabel("signed offer").fill(offer);
      await page.getByRole("button", { name: "Verify and add" }).click();
      await expect(page.locator(".notice.warn").filter({ hasText: /for launch "mesh"/ })).toBeVisible();
    });

    test("to let a seller pay their own offer", async ({ page, app, sim }) => {
      await aliceSells(page, app, sim);
      const row = page.locator("tbody tr").filter({ hasText: "open" }).first();
      await expect(row).toBeVisible();
      await expect(row.getByRole("button", { name: /^Pay / })).toHaveCount(0);
    });

    test("to sell more than is held, or for nothing", async ({ page, app, sim }) => {
      await fundedWallet(app, sim);
      await app.goto("/launch/mesh");
      await claimOnce(page);
      await page.goto("/#/market/mesh");
      const panel = page.locator(".panel").filter({ has: page.getByRole("heading", { name: "Make an offer" }) });
      await panel.getByLabel(/amount \(MESH\)/).fill("99999999");
      await panel.getByLabel(/price \(satoshis\)/).fill("1000");
      await expect(panel.getByRole("button", { name: "Sign the offer" })).toBeDisabled();
      await panel.getByLabel(/amount \(MESH\)/).fill("1");
      await panel.getByLabel(/price \(satoshis\)/).fill("0");
      await expect(panel.getByRole("button", { name: "Sign the offer" })).toBeDisabled();
    });

    test("a payment the buyer cannot afford, without broadcasting anything", async ({ page, app, sim, browser }) => {
      const { offer } = await aliceSells(page, app, sim);
      const before = sim.broadcasts.length;
      const bob = await secondVisitor(browser, sim);
      await demoKeyOn(bob);
      await addOffer(bob, offer);
      const pay = bob.locator("tbody tr").first().getByRole("button", { name: /^Pay / });
      if (await pay.isEnabled()) {
        await pay.click();
        await expect(bob.locator(".notice.warn").filter({ hasText: /Not enough confirmed balance/ })).toBeVisible();
      }
      expect(sim.broadcasts.length).toBe(before);
    });

    test("to pay an offer once it has expired", async ({ page, app, sim, browser }) => {
      const { offer } = await aliceSells(page, app, sim);
      sim.advance(145); // default validity is 144 blocks
      const bob = await secondVisitor(browser, sim);
      await demoKeyOn(bob);
      await addOffer(bob, offer);
      const row = bob.locator("tbody tr").first();
      await expect(row).toContainText("expired");
      await expect(row.getByRole("button", { name: /^Pay / })).toHaveCount(0);
    });
  });
});
