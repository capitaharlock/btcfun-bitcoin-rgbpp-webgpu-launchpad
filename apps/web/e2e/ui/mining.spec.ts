/* The loop: open a miner cell, buy a ticket, mine, mint — and the rails around it. */

import { test, expect } from "../support/fixtures";
import { announce, block, buyTicket, fundedWallet, mineUntilMintable, mintOnce, openMiner } from "../support/flows";
import { PAYMASTER_ADDRESS, PAYMASTER_FEE } from "../support/rgbpp";

test.describe.configure({ timeout: 240_000 });

test.describe("mining", () => {
  test("a first-time miner goes from nothing to a real balance", async ({ page, app, sim, rgbpp, ux }) => {
    await fundedWallet(app, sim);
    const id = await announce(page, { symbol: "MESH" });
    await block(page, sim);

    // Step 1: open, paid to the paymaster in the same transaction.
    await expect(page.getByRole("heading", { name: "Open a miner cell" })).toBeVisible();
    await openMiner(page, sim);
    const opening = sim.broadcasts.at(-1)!;
    expect(opening.outputs.some((o) => o.address === PAYMASTER_ADDRESS && Number(o.amount) >= PAYMASTER_FEE)).toBe(true);

    // Step 2: the ticket pays the promoter — here, the creator's own address.
    await buyTicket(page);
    const ticket = sim.broadcasts.at(-1)!;
    expect(ticket.outputs.filter((o) => Number(o.amount) === 5000)).toHaveLength(1);
    await expect(page.getByText("Your ticket is landing")).toBeVisible();

    // Step 3: mining starts before the ticket settles; minting waits for it.
    await page.getByRole("group", { name: "Mining device" }).getByRole("button", { name: "CPU" }).click();
    await page.getByRole("button", { name: "Mine", exact: true }).click();
    await expect(page.getByText(/zero bits/).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: /^Mint / })).toHaveCount(0);
    await page.getByRole("button", { name: "Stop" }).click();
    await block(page, sim);

    // Step 4: settled — a qualifying hash can be minted, for exactly what it showed.
    const mint = await mineUntilMintable(page);
    const shown = (await mint.innerText()).replace(/^Mint /, "");
    await mint.click();
    await expect(page.getByText(/^Minting /)).toBeVisible();
    await block(page, sim);
    await expect(page.getByRole("button", { name: /^Buy ticket/ })).toBeVisible({ timeout: 30_000 });

    // The balance is on chain: the simulated queue accepted the mint under the script's rules.
    expect([...rgbpp.jobs.values()].every((j) => j.state === "completed")).toBe(true);
    await expect(page.getByText("you hold").locator("..")).toContainText(shown.split(" ")[0]);
    await app.goto("/holdings");
    await expect(page.getByText(shown.split(" ")[0]).first()).toBeVisible();
    expect(id).toMatch(/^mesh-/);
    ux.note("First tokens take four clicks and three blocks: open, ticket, mine, mint — each step says what it is waiting for.");
  });

  test("minting again adds to the same balance, and the best hash survives a reload", async ({ page, app, sim, rgbpp, ux }) => {
    await fundedWallet(app, sim);
    await announce(page, { symbol: "LUMEN" });
    await block(page, sim);
    const first = await mintOnce(page, sim);

    await buyTicket(page);
    await block(page, sim);
    const mint = await mineUntilMintable(page);
    const second = (await mint.innerText()).replace(/^Mint /, "");
    await page.reload();
    // The kept hash is re-checked and offered again without re-mining.
    await expect(page.getByRole("button", { name: `Mint ${second}` })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: `Mint ${second}` }).click();
    await expect(page.getByText(/^Minting /)).toBeVisible();
    await block(page, sim);
    for (const job of rgbpp.jobs.values()) expect(job.state, job.failure ?? "").toBe("completed");
    const total = Number(first.replace(/[^0-9.]/g, "")) + Number(second.replace(/[^0-9.]/g, ""));
    await expect(page.getByText("you hold").locator("..")).toContainText(total.toLocaleString("en-US", { maximumFractionDigits: 2 }).split(".")[0]);
    ux.note("A reload in the middle of mining keeps the best hash for the ticket; nothing has to be ground twice.");
  });

  test.describe("rails", () => {
    test("without a wallet, the page explains that tokens belong to an address", async ({ page, app, sim }) => {
      await app.createDemoKey();
      const id = await announce(page, { symbol: "OBSV" });
      await page.getByRole("button", { name: /^Disconnect/ }).click().catch(() => undefined);
      await app.goto("/wallet");
      await page.getByRole("button", { name: /^Disconnect/ }).click();
      await block(page, sim);
      await app.goto(`/launch/${id}`);
      await expect(page.getByRole("heading", { name: "Connect a wallet to mine" })).toBeVisible();
    });

    test("before the opening block there is nothing to buy", async ({ page, app, sim }) => {
      await fundedWallet(app, sim);
      await announce(page, { symbol: "FORGE", opensInBlocks: 10 });
      await expect(page.getByRole("heading", { name: "Not open yet" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Open miner cell|Buy ticket/ })).toHaveCount(0);
    });

    test("an empty wallet is told why nothing was sent", async ({ page, app, sim }) => {
      await app.createDemoKey();
      await announce(page, { symbol: "CAIRN" });
      await block(page, sim);
      await page.getByRole("button", { name: "Open miner cell" }).click();
      await expect(page.locator(".notice").filter({ hasText: /Not enough confirmed balance/ })).toBeVisible();
      expect(sim.broadcasts).toHaveLength(0);
    });

    test("a queue that has not settled keeps the ticket landing, not failed", async ({ page, app, sim, rgbpp }) => {
      await fundedWallet(app, sim);
      await announce(page, { symbol: "TIDE" });
      await block(page, sim);
      await openMiner(page, sim);
      rgbpp.stalled = true;
      await buyTicket(page);
      await block(page, sim);
      await expect(page.getByText("Your ticket is landing")).toBeVisible();
      await expect(page.getByRole("button", { name: /^Mint / })).toHaveCount(0);
    });
  });
});
