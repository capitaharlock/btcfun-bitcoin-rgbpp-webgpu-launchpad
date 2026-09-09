/* Buying a ticket, mining and claiming, against the simulated chain.
 *
 * The transaction the browser signs is captured and parsed here, so these tests
 * check what would have been broadcast — amount, destination, commitment, fee —
 * without spending anything. The live project repeats the path with real money.
 */

import { test, expect, kv, amountOf } from "../support/fixtures";
import { buyTicket, fundedWallet, mineUntilQualified, reserveScript } from "../support/flows";

const TICKET_SATS = 2_000; // MESH
const MIN_CLZ = 24; // MESH

test.describe("mining", () => {
  // Finding 24 leading zero bits takes about 16.7 million attempts on average,
  // and the tail of that distribution is long — on a busy CPU several times
  // the mean. The budget reflects the distribution, not the happy case.
  test.describe.configure({ timeout: 240_000 });

  test.beforeEach(async ({ app, sim }) => {
    await app.pinOrigin("mesh", sim.tip - 3);
  });

  test.describe("before it can start", () => {
    test("without a wallet, mining explains what is missing", async ({ page, app }) => {
      await app.goto("/launch/mesh");
      await expect(page.getByText(/Connect a wallet — the challenge commits to your identity/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Mine", exact: true })).toBeDisabled();
      await expect(page.getByRole("link", { name: "Connect a wallet" })).toBeVisible();
    });

    test("with an empty wallet, the ticket cannot be bought", async ({ page, app }) => {
      await app.createDemoKey();
      await app.goto("/launch/mesh");
      await expect(page.getByRole("button", { name: /^Buy a ticket/ })).toBeDisabled();
      await expect(page.getByText(/Not enough balance for the ticket and its fee/)).toBeVisible();
      await expect(page.getByText(/Buy a ticket\. The challenge commits to its txid/)).toBeVisible();
    });

    test("one sat short of ticket plus fee is still refused", async ({ page, app, sim }) => {
      await fundedWallet(app, sim, TICKET_SATS + 399);
      await app.goto("/launch/mesh");
      await expect(page.getByRole("button", { name: /^Buy a ticket/ })).toBeDisabled();
    });
  });

  test("the ticket pays the launch's burn address, commits on chain and pays a fair fee", async ({
    page,
    app,
    sim,
    ux,
  }) => {
    const wallet = await fundedWallet(app, sim);
    await app.goto("/launch/mesh");
    await buyTicket(page);

    expect(sim.broadcasts).toHaveLength(1);
    const tx = sim.broadcasts[0];
    const toReserve = tx.outputs.find((o) => o.script === reserveScript("mesh"));
    expect(toReserve?.amount).toBe(BigInt(TICKET_SATS));

    const opReturn = tx.outputs.find((o) => o.script.startsWith("6a"));
    const memo = Buffer.from(opReturn!.script.slice(4), "hex").toString("utf8");
    expect(memo).toMatch(/^btcfun:t1:mesh:\d+:/);
    expect(memo).toContain(wallet.identity.slice(0, 16));

    // Fee: whatever is not paid out, over the transaction's virtual size.
    const paidOut = tx.outputs.reduce((sum, o) => sum + o.amount, 0n);
    const fee = 50_000n - paidOut;
    const vsize = Math.ceil(Buffer.from(tx.hex, "hex").length * 0.6); // bounded above; exact check lives in unit tests
    expect(Number(fee)).toBeGreaterThan(0);
    expect(Number(fee)).toBeLessThan(2_000);
    ux.note(`Ticket transaction: ${TICKET_SATS} sat to the burn address, fee ${fee} sat for ~${vsize} vB, memo "${memo}".`);

    // Change came back to the wallet, unconfirmed, as a node would report it.
    await page.goto("/#/wallet");
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("pending").locator("..")).not.toContainText(/^pending\s*0$/);
  });

  for (const device of ["GPU", "CPU"] as const) {
    test(`mine on the ${device} and claim: the balance is signed, replayed and shown`, async ({
      page,
      app,
      sim,
      ux,
    }) => {
      await fundedWallet(app, sim);
      await app.goto("/launch/mesh");
      await buyTicket(page);

      const started = Date.now();
      const claim = await mineUntilQualified(page, device);
      const seconds = (Date.now() - started) / 1000;
      const text = await claim.innerText();
      const promised = amountOf(text.replace(/MESH/, ""));
      expect(promised).toBeGreaterThan(0);
      await claim.click();

      await expect(page.getByText(/^Claimed /)).toBeVisible();
      await expect(kv(page, "You hold")).toContainText(text.replace(/^Claim /, ""));
      await expect(kv(page, "Records")).toHaveText("1");
      await expect(kv(page, "Reserve paid")).toHaveText(`${TICKET_SATS.toLocaleString("en-US")} sats`);

      await app.goto("/holdings");
      await expect(page.getByText("MESH").first()).toBeVisible();

      await app.goto("/launch/mesh/proof");
      await expect(page.getByText("1 records replayed")).toBeVisible();
      ux.note(`${device}: reached ${MIN_CLZ} zero bits and the claim button in ${seconds.toFixed(1)} s.`);
    });
  }

  test.describe("after a claim", () => {
    test("the same ticket cannot claim twice", async ({ page, app, sim }) => {
      await fundedWallet(app, sim);
      await app.goto("/launch/mesh");
      await buyTicket(page);
      await (await mineUntilQualified(page, "GPU")).click();
      await expect(page.getByText(/^Claimed /)).toBeVisible();

      // Mining again on the same ticket may find a better candidate, but the
      // claim it offers must be refused by the ledger, not merely hidden.
      await page.reload();
      await expect(page.getByText(/lapsed unused/)).toHaveCount(0); // a used ticket is not "lapsed"
      const claim = page.getByRole("button", { name: /^Claim |^Keep mining/ });
      if (await claim.isEnabled()) {
        await claim.click();
        await expect(page.locator(".notice").filter({ hasText: /already been used|exhausted|nothing left/i })).toBeVisible();
      }
      await expect(kv(page, "Records")).toHaveText("1");
    });

    test("a ticket bought for one epoch does not carry into the next", async ({ page, app, sim, ux }) => {
      await fundedWallet(app, sim);
      await app.goto("/launch/mesh");
      await buyTicket(page);
      const epoch = Number((await page.getByText(/^epoch \d+$/).innerText()).split(" ")[1]);

      sim.advance(6);
      await page.reload();
      await expect(page.getByText(`epoch ${epoch + 1}`, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: `Buy a ticket for epoch ${epoch + 1}` })).toBeVisible();
      await expect(page.getByText(`Your ticket for epoch ${epoch} lapsed unused when that epoch closed.`)).toBeVisible();
      ux.note("An unused ticket that outlives its epoch is named as lapsed, next to the offer of a new one.");
    });
  });
});
