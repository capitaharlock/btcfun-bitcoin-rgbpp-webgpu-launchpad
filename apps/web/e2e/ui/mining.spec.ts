/* The loop: open a miner cell, buy a ticket, mine, mint — and the rails around it. */

import { test, expect } from "../support/fixtures";
import { announce, block, buyTicket, MINEABLE, mineButton, mineUntilMintable, mintOnce, openMiner, platformWallet } from "../support/flows";
import { PLATFORM_SECRET } from "../support/platform";
import { PAYMASTER_ADDRESS, PAYMASTER_FEE, PLATFORM_ADDRESS } from "../support/rgbpp";

test.describe.configure({ timeout: 240_000 });

test.describe("mining", () => {
  test("a first-time miner goes from nothing to a real balance", async ({ page, app, sim, rgbpp, ux }) => {
    await platformWallet(app, sim);
    const id = await announce(page, { symbol: MINEABLE });
    await block(page, sim);

    // Step 1: open, paid to the paymaster in the same transaction.
    await expect(page.getByRole("heading", { name: "Open a miner cell" })).toBeVisible();
    await openMiner(page, sim);
    const opening = sim.broadcasts.at(-1)!;
    expect(opening.outputs.some((o) => o.address === PAYMASTER_ADDRESS && Number(o.amount) >= PAYMASTER_FEE)).toBe(true);

    // Step 2: the ticket pays the promoter — here, the creator's own address —
    // and the platform its 5 %.
    await buyTicket(page);
    const ticket = sim.broadcasts.at(-1)!;
    expect(ticket.outputs.filter((o) => Number(o.amount) === 9500)).toHaveLength(1);
    expect(ticket.outputs.filter((o) => o.address === PLATFORM_ADDRESS && Number(o.amount) === 500)).toHaveLength(1);
    await expect(page.getByText(/^Ticket landing/)).toBeVisible();

    // Step 3: mining starts before the ticket settles; minting waits for it.
    await page.getByRole("group", { name: "Mining device" }).getByRole("button", { name: "CPU" }).click();
    await page.getByRole("button", { name: "Mine", exact: true }).click();
    await expect(page.getByText(/zero bits/).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: /^Mint / })).toHaveCount(0);
    await page.getByRole("button", { name: "Pause" }).click();
    await block(page, sim);

    // Step 4: settled — a qualifying hash can be minted, for exactly what it showed.
    const mint = await mineUntilMintable(page);
    const shown = ((await mint.textContent()) ?? "").replace(/^Mint /, "");
    await mint.click();
    await expect(page.getByText(/^Minting /)).toBeVisible();
    await block(page, sim);
    await expect(page.getByRole("button", { name: /^Buy ticket/ })).toBeVisible({ timeout: 30_000 });

    // The balance is on chain: the simulated queue accepted the mint under the script's rules.
    expect([...rgbpp.jobs.values()].every((j) => j.state === "completed")).toBe(true);
    // The mint is announced to the public feed, pointing at its transaction.
    const minted = rgbpp.events.find((e) => e.signed.body.kind === "mint");
    expect(minted?.signed.body.txid).toBe(sim.broadcasts.at(-1)!.txid);
    await expect(page.getByText("you hold").locator("..")).toContainText(shown.split(" ")[0]);
    await app.goto("/holdings");
    await expect(page.getByText(shown.split(" ")[0]).first()).toBeVisible();
    expect(id).toMatch(/^demo-/);
    ux.note("First tokens take four clicks and three blocks: open, ticket, mine, mint — each step says what it is waiting for.");
  });

  test("minting again adds to the same balance, and the best hash survives a reload", async ({ page, app, sim, rgbpp, ux }) => {
    await platformWallet(app, sim);
    await announce(page, { symbol: MINEABLE });
    await block(page, sim);
    const first = await mintOnce(page, sim);

    await buyTicket(page);
    await block(page, sim);
    const mint = await mineUntilMintable(page);
    const second = ((await mint.textContent()) ?? "").replace(/^Mint /, "");
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

  test("pause, reload and continue: the search picks up where it stopped", async ({ page, app, sim, ux }) => {
    await platformWallet(app, sim);
    await announce(page, { symbol: MINEABLE });
    await block(page, sim);
    await openMiner(page, sim);
    await buyTicket(page);

    const tried = page.getByText("nonces tried").locator("..");
    // The cell is shortened (13.14M); its tooltip carries the exact count.
    const count = async () => Number(((await tried.getAttribute("title")) ?? "").split(":")[0].replace(/[^0-9]/g, ""));
    const bestBits = page.getByText("best", { exact: true }).locator("..");

    // Mining starts on the broadcast ticket, before it settles.
    await page.getByRole("group", { name: "Mining device" }).getByRole("button", { name: "CPU" }).click();
    await page.getByRole("button", { name: "Mine", exact: true }).click();
    await expect.poll(count, { timeout: 30_000 }).toBeGreaterThan(200_000);
    await page.getByRole("button", { name: "Pause" }).click();
    const paused = await count();
    const best = (await bestBits.textContent()) ?? "";
    expect(best).toMatch(/\d+\s*zero bits/);
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible({ timeout: 30_000 });
    expect(await count()).toBe(paused);
    await expect(bestBits).toHaveText(best);

    await mineButton(page).click();
    await expect.poll(count, { timeout: 30_000 }).toBeGreaterThan(paused);
    await page.getByRole("button", { name: "Pause" }).click();
    // The best hash only ever improves.
    expect(Number(((await bestBits.textContent()) ?? "").replace(/[^0-9]/g, ""))).toBeGreaterThanOrEqual(Number(best.replace(/[^0-9]/g, "")));
    ux.note("Pausing and reloading keep the count of nonces tried and the best hash; Continue resumes the same sweep.");
  });

  test.describe("rails", () => {
    test("without a wallet, the page explains that tokens belong to an address", async ({ page, app, sim }) => {
      await app.restoreKey(PLATFORM_SECRET);
      const id = await announce(page, { symbol: MINEABLE });
      await app.logOut();
      await block(page, sim);
      await app.goto(`/launch/${id}`);
      await expect(page.getByRole("heading", { name: "Connect a wallet to mine" })).toBeVisible();
    });

    test("before the opening block there is nothing to buy", async ({ page, app, sim }) => {
      await platformWallet(app, sim);
      await announce(page, { symbol: MINEABLE, opensInBlocks: 10 });
      await expect(page.getByRole("heading", { name: "Not open yet" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Open miner cell|Buy ticket/ })).toHaveCount(0);
    });

    test("an empty wallet is told why nothing was sent", async ({ page, app, sim }) => {
      await app.restoreKey(PLATFORM_SECRET);
      await announce(page, { symbol: MINEABLE });
      await block(page, sim);
      await page.getByRole("button", { name: "Open miner cell" }).click();
      await expect(page.locator(".notice").filter({ hasText: /Not enough confirmed balance/ })).toBeVisible();
      expect(sim.broadcasts).toHaveLength(0);
    });

    test("a queue that has not settled keeps the ticket landing, not failed", async ({ page, app, sim, rgbpp }) => {
      await platformWallet(app, sim);
      await announce(page, { symbol: MINEABLE });
      await block(page, sim);
      await openMiner(page, sim);
      rgbpp.stalled = true;
      await buyTicket(page);
      await block(page, sim);
      await expect(page.getByText(/^Ticket landing/)).toBeVisible();
      await expect(page.getByRole("button", { name: /^Mint / })).toHaveCount(0);
    });

    test("on any launch but DEMO the site offers no miner, says why, and points at DEMO", async ({ page, app, sim }) => {
      await platformWallet(app, sim);
      const demo = await announce(page, { symbol: MINEABLE });
      // Even the platform's own launches: only the featured one is mined here.
      await announce(page, { symbol: "OTHER" });
      await block(page, sim);
      await expect(page.getByRole("heading", { name: "Mining is open on DEMO" })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/the mint script on CKB accepts a paid ticket and a valid hash for any launch/)).toBeVisible();
      await expect(page.getByRole("button", { name: /Open miner cell|Buy ticket/ })).toHaveCount(0);
      await page.getByRole("link", { name: "▶ Mine DEMO" }).click();
      await expect(page).toHaveURL(new RegExp(`#/launch/${demo}/mine$`));
      await expect(page.getByRole("button", { name: "Open miner cell" })).toBeVisible({ timeout: 30_000 });
    });
  });
});
