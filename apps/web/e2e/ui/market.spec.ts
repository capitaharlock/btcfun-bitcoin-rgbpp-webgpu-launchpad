/* A sale the buyer completes alone — and the ways it must not go wrong. */

import { test, expect } from "../support/fixtures";
import { announce, block, demoKeyOn, fundedWallet, mintOnce, secondVisitor } from "../support/flows";

test.describe.configure({ timeout: 300_000 });

async function listFirstCell(page: import("@playwright/test").Page, price: number) {
  await page.goto("/#/market");
  await page.getByLabel("Price (sats, for the whole cell)").fill(String(price));
  await page.getByRole("button", { name: /^List / }).click();
  await expect(page.getByText(/^Listed\./)).toBeVisible();
}

test.describe("market", () => {
  test("a buyer completes a listing while the seller is away; both sides settle in one transaction", async ({ page, app, sim, rgbpp, browser, ux }) => {
    const seller = await fundedWallet(app, sim);
    await announce(page, { symbol: "SALE" });
    await block(page, sim);
    const minted = await mintOnce(page, sim);
    await listFirstCell(page, 25_000);
    await page.goto("about:blank"); // the seller leaves

    const buyerPage = await secondVisitor(browser, sim, rgbpp);
    const buyer = await demoKeyOn(buyerPage);
    sim.fund(buyer.address, 100_000);
    const sellerBefore = (sim.utxos.get(seller.address) ?? []).reduce((n, u) => n + u.value, 0);

    await buyerPage.goto("/#/market");
    const row = buyerPage.locator("tr").filter({ hasText: "SALE" });
    await expect(row).toContainText("25,000 sats", { timeout: 30_000 });
    await row.getByRole("button", { name: "Buy" }).click();
    await expect(buyerPage.getByText(/^Bought .* for 25,000 sats/)).toBeVisible();

    // One Bitcoin transaction: the seller's price at output 0, the commitment at 1, the buyer's seal at 2.
    const sale = sim.broadcasts.at(-1)!;
    expect(sale.outputs[0].address).toBe(seller.address);
    expect(Number(sale.outputs[0].amount)).toBe(25_000);
    expect(sale.outputs[1].script.startsWith("6a20")).toBe(true);
    expect(sale.outputs[2].address).toBe(buyer.address);

    sim.advance(1);
    const job = [...rgbpp.jobs.values()].at(-1)!;
    expect(job.state, job.failure ?? "").toBe("completed");
    const sellerAfter = (sim.utxos.get(seller.address) ?? []).reduce((n, u) => n + u.value, 0);
    expect(sellerAfter - sellerBefore).toBe(25_000 - 546);

    await buyerPage.goto("/#/holdings");
    await expect(buyerPage.getByText(minted.split(" ")[0]).first()).toBeVisible({ timeout: 30_000 });
    await buyerPage.reload();
    await buyerPage.goto("/#/market");
    await expect(buyerPage.getByText("No open listings.")).toBeVisible({ timeout: 30_000 });
    ux.note("The seller closed their browser after listing; the buyer's single transaction paid them and moved the tokens.");
  });

  test("a listing the seller cancels disappears, and cannot be bought", async ({ page, app, sim, rgbpp }) => {
    await fundedWallet(app, sim);
    await announce(page, { symbol: "BACK" });
    await block(page, sim);
    await mintOnce(page, sim);
    await listFirstCell(page, 30_000);
    const row = page.locator("tr").filter({ hasText: "BACK" });
    await expect(row.getByRole("button", { name: "Cancel" })).toBeVisible({ timeout: 30_000 });
    await expect(row.getByRole("button", { name: "Buy" })).toHaveCount(0);
    await row.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText(/^Cancelled /)).toBeVisible();
    await expect(row).toHaveCount(0);
    await block(page, sim);
    expect([...rgbpp.jobs.values()].at(-1)!.state).toBe("completed");
    await expect(page.getByText("No open listings.")).toBeVisible({ timeout: 30_000 });
  });

  test("a listing whose PSBT was tampered with is never shown", async ({ page, app, sim, rgbpp, ux }) => {
    await fundedWallet(app, sim);
    await announce(page, { symbol: "FAKE" });
    await block(page, sim);
    await mintOnce(page, sim);
    await listFirstCell(page, 40_000);
    // Rewrite the price in the index copy, as a hostile index could.
    const event = rgbpp.events.find((e) => e.signed.body.kind === "offer")!;
    const listing = JSON.parse(event.signed.body.meta!);
    event.signed.body.meta = JSON.stringify({ ...listing, priceSats: 1_000 });
    await page.evaluate(() => localStorage.removeItem("btcfun:activity:v1"));
    await page.reload();
    await expect(page.getByText("No open listings.")).toBeVisible({ timeout: 30_000 });
    ux.note("A listing altered in the index fails its signature and PSBT checks and is not offered to buyers.");
  });

  test("with nothing to sell, the sell panel says how to get tokens", async ({ page, app }) => {
    await app.createDemoKey();
    await app.goto("/market");
    await expect(page.getByText(/You hold no tokens this app knows/)).toBeVisible();
  });
});
