/* Anyone can check a mint from the two chains. */

import { test, expect } from "../support/fixtures";
import { announce, bar, block, MINEABLE, mintOnce, platformWallet, pressMine } from "../support/flows";

test.describe.configure({ timeout: 240_000 });

test.describe("proof", () => {
  test("a real mint passes every check, recomputed from chain data", async ({ page, app, sim, ux }) => {
    await platformWallet(app, sim);
    await announce(page, { symbol: MINEABLE });
    await block(page, sim);
    const minted = await mintOnce(page, sim);
    const mintTx = sim.broadcasts.at(-1)!.txid;

    await app.goto("/proof");
    await page.getByLabel("Bitcoin txid").fill(mintTx);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByRole("heading", { name: "Every rule holds" })).toBeVisible({ timeout: 30_000 });
    for (const check of ["commitment", "armed ticket", "disarmed", "proof of work", "amount"]) {
      await expect(page.getByText(`✓ ${check}`)).toBeVisible();
    }
    await expect(page.getByText(`Minted ${minted.split(" ")[0]}`)).toBeVisible();
    ux.note("The proof page recomputes commitment, ticket, work and amount; every line says what it checked.");
  });

  test("a ticket is not a mint, and says why", async ({ page, app, sim }) => {
    await platformWallet(app, sim);
    await announce(page, { symbol: MINEABLE });
    await block(page, sim);
    await pressMine(page);
    await bar(page).getByRole("button", { name: "Sign ticket" }).click();
    await expect(bar(page).getByRole("button", { name: "Waiting for a block" })).toBeVisible({ timeout: 30_000 });
    const ticketTx = sim.broadcasts.at(-1)!.txid;
    await block(page, sim);
    await app.goto(`/proof/${ticketTx}`);
    await expect(page.getByRole("heading", { name: "This is not a valid mint" })).toBeVisible({ timeout: 30_000 });
  });

  test("a malformed txid keeps Verify disabled", async ({ page, app }) => {
    await app.goto("/proof");
    await page.getByLabel("Bitcoin txid").fill("xyz");
    await expect(page.getByRole("button", { name: "Verify" })).toBeDisabled();
  });
});
