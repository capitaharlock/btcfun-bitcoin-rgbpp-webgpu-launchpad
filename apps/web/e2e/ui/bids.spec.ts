/* Bids: a signed intention a holder meets and the bidder completes.
 *
 * Nothing is escrowed at any point, so each step is a different person acting
 * in their own browser: the bidder signs a bid, a holder signs a listing for
 * exactly its terms, and the bidder's one transaction settles both sides.
 */

import type { Page } from "@playwright/test";

import { test, expect } from "../support/fixtures";
import type { ChainSim } from "../support/chain";
import { announce, block, browserKeyOn, fundedWallet, mintOnce, secondVisitor } from "../support/flows";

test.describe.configure({ timeout: 300_000 });

async function placeBid(page: Page, tokens: string, sats: number): Promise<void> {
  await page.getByLabel("Amount (tokens)").fill(tokens);
  await page.getByLabel("Total price (sats)").fill(String(sats));
  await page.getByRole("button", { name: "Place bid" }).click();
  await expect(page.getByText(/^Bid published\./)).toBeVisible();
}

const bidsTable = (page: Page) => page.getByRole("table", { name: "Bids", exact: true });
const balance = (sim: ChainSim, address: string) => (sim.utxos.get(address) ?? []).reduce((n, u) => n + u.value, 0);

test.describe("bids", () => {
  test("a holder sells to a bid and the bidder completes it; both sides settle in one transaction", async ({ page, app, sim, rgbpp, browser, ux }) => {
    const holder = await fundedWallet(app, sim);
    await announce(page, { symbol: "BIDS" });
    await block(page, sim);
    await mintOnce(page, sim);

    const bidderPage = await secondVisitor(browser, sim, rgbpp);
    const bidder = await browserKeyOn(bidderPage);
    sim.fund(bidder.address, 100_000);
    await bidderPage.goto("/#/market");
    await placeBid(bidderPage, "100", 20_000);
    const myBid = bidderPage.getByRole("group", { name: "Your bid for BIDS" });
    await expect(myBid).toContainText("waiting for a seller", { timeout: 30_000 });
    await expect(bidderPage.getByRole("table", { name: "Bids · buying" })).toContainText("200", { timeout: 30_000 });
    // Placing a bid moves nothing.
    expect(balance(sim, bidder.address)).toBe(100_000);

    // The holder's cell is larger than the bid, so the amount is set aside first.
    await page.goto("/#/market");
    const row = bidsTable(page).locator("tbody tr").filter({ hasText: "20,000 sats" });
    await row.getByRole("button", { name: /^Set aside 100\.00/ }).click({ timeout: 30_000 });
    await expect(page.getByText(/^Setting aside 100\.00 BIDS/)).toBeVisible();
    await block(page, sim);
    expect([...rgbpp.jobs.values()].at(-1)!.state).toBe("completed");
    await row.getByRole("button", { name: "Sell to this bid" }).click({ timeout: 30_000 });
    await expect(row).toContainText("accepted", { timeout: 30_000 });
    const listing = JSON.parse(rgbpp.events.filter((e) => e.signed.body.kind === "offer").at(-1)!.signed.body.meta!);
    const bidId = rgbpp.events.find((e) => e.signed.body.kind === "bid")!.id;
    expect(listing).toMatchObject({ amount: "10000000000", priceSats: 20_000, bid: bidId });
    await page.goto("about:blank"); // the holder leaves

    const holderBefore = balance(sim, holder.address);
    await bidderPage.reload();
    await expect(bidderPage.getByText(/A seller accepted your bid/)).toBeVisible({ timeout: 30_000 });
    await myBid.getByRole("button", { name: "Complete purchase" }).click();
    await expect(bidderPage.getByText(/^Bought 100\.00 BIDS for 20,000 sats/)).toBeVisible();

    const sale = sim.broadcasts.at(-1)!;
    expect(sale.outputs[0].address).toBe(holder.address);
    expect(Number(sale.outputs[0].amount)).toBe(20_000);
    expect(sale.outputs[1].script.startsWith("6a20")).toBe(true);
    expect(sale.outputs[2].address).toBe(bidder.address);

    sim.advance(1);
    const job = [...rgbpp.jobs.values()].at(-1)!;
    expect(job.state, job.failure ?? "").toBe("completed");
    // The holder's seal (546) went into the sale; the price came out.
    expect(balance(sim, holder.address) - holderBefore).toBe(20_000 - 546);
    // The bidder paid the price and a fee; the 546-sat seal now carrying their tokens is still theirs.
    const fee = 100_000 - balance(sim, bidder.address) - (20_000 - 546);
    expect(fee).toBeGreaterThan(0);
    expect(fee).toBeLessThan(2_000);

    await bidderPage.goto("/#/holdings");
    await expect(bidderPage.getByText("100.00").first()).toBeVisible({ timeout: 30_000 });
    await bidderPage.goto("/#/market");
    await expect(myBid).toContainText("filled", { timeout: 30_000 });
    await expect(bidderPage.getByRole("table", { name: "Recent trades" })).toContainText("20,000 sats");
    await expect(bidderPage.getByText("No bids for BIDS.")).toBeVisible();
    ux.note("The bidder signed a bid that locked nothing; the holder met it with a listing; the bidder's one transaction settled both sides.");
  });

  test("a bid its author withdraws leaves the book for everyone", async ({ page, app, sim, rgbpp, browser, ux }) => {
    await fundedWallet(app, sim);
    await announce(page, { symbol: "WDRW" });
    await page.goto("/#/market");
    await placeBid(page, "50", 10_000);
    const myBid = page.getByRole("group", { name: "Your bid for WDRW" });
    await expect(myBid).toContainText("waiting for a seller", { timeout: 30_000 });
    await expect(bidsTable(page)).toContainText("10,000 sats");

    const other = await secondVisitor(browser, sim, rgbpp);
    await browserKeyOn(other);
    await other.goto("/#/market");
    await expect(bidsTable(other)).toContainText("10,000 sats", { timeout: 30_000 });
    await expect(bidsTable(other)).toContainText("You hold 0.00.");

    await myBid.getByRole("button", { name: "Withdraw bid" }).click();
    await expect(myBid).toContainText("withdrawn", { timeout: 30_000 });
    await expect(page.getByText("No bids for WDRW.")).toBeVisible();
    const cancel = rgbpp.events.find((e) => e.signed.body.kind === "cancel")!;
    expect(cancel.signed.body.ref).toBe(rgbpp.events.find((e) => e.signed.body.kind === "bid")!.id);

    await other.reload();
    await expect(other.getByText("No bids for WDRW.")).toBeVisible({ timeout: 30_000 });
    ux.note("Withdrawing a bid is one signed event; every visitor's book drops it on the next read.");
  });
});
