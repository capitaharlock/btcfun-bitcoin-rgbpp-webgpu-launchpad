/* The loop: buy a ticket, arm it when it created its cell, mine, mint — and the rails around it. */

import { test, expect } from "../support/fixtures";
import {
  announce,
  bar,
  block,
  buyTicket,
  MINEABLE,
  mineButton,
  mineOnCpu,
  mineUntilMintable,
  mintedShown,
  mintOnce,
  platformWallet,
  pressMine,
  showStep, activate } from "../support/flows";
import { PLATFORM_SECRET } from "../support/platform";
import { PAYMASTER_ADDRESS, PLATFORM_ADDRESS } from "../support/rgbpp";

test.describe.configure({ timeout: 240_000 });

/** Whole tokens in a displayed amount, e.g. "1,234.00" → 1234. */
const whole = (shown: string) => Number(shown.split(".")[0].replace(/,/g, ""));

test.describe("mining", () => {
  test("three rounds with a key of one's own: the paymaster is paid in the first two, and from the third the ticket re-arms", async ({ page, app, sim, rgbpp, ux }) => {
    await platformWallet(app, sim, 400_000);
    const id = await announce(page, { symbol: MINEABLE });
    const registered = sim.broadcasts.length;
    await block(page, sim);
    const wizard = page.getByRole("region", { name: `Mine ${MINEABLE}` });
    await expect(wizard).toHaveCount(0);

    const tickets: Array<(typeof sim.broadcasts)[number]> = [];
    let total = 0;
    for (let round = 1; round <= 3; round++) {
      const before = sim.broadcasts.length;
      total += whole(await mintOnce(page, sim));
      tickets.push(sim.broadcasts[before]);
      // A first round's ticket, arming and mint; a re-arming round has no arming.
      expect(sim.broadcasts.length - before).toBe(round < 3 ? 3 : 2);
      await expect(page.getByText("you hold").locator("..")).toContainText(total.toLocaleString("en-US"));
      if (round < 3) await bar(page).getByRole("button", { name: "New round →", exact: true }).click();
    }

    const paid = (tx: (typeof tickets)[number], address: string) => tx.outputs.filter((o) => o.address === address).reduce((n, o) => n + Number(o.amount), 0);
    expect(tickets.map((t) => paid(t, PAYMASTER_ADDRESS))).toEqual([7_000, 7_000, 0]);
    expect(tickets.map((t) => paid(t, PLATFORM_ADDRESS))).toEqual([878, 878, 1_648]);
    expect(tickets[2].outputs.filter((o) => Number(o.amount) === 13_335)).toHaveLength(1);
    // Only tickets pay anyone but the network.
    const others = sim.broadcasts.slice(registered).filter((b) => !tickets.includes(b));
    for (const tx of others) expect(paid(tx, PLATFORM_ADDRESS) + paid(tx, PAYMASTER_ADDRESS)).toBe(0);

    // Every operation settled under the script's rules, and each mint is on the public feed.
    for (const job of rgbpp.jobs.values()) expect(job.state, job.failure ?? "").toBe("completed");
    expect(rgbpp.events.filter((e) => e.signed.body.kind === "mint")).toHaveLength(3);
    await expect(wizard.getByRole("link", { name: "Proof" })).toBeVisible();
    await showStep(page, "Ticket");
    await expect(wizard.getByRole("link", { name: "Ticket transaction on mempool.space" })).toHaveAttribute("href", new RegExp(`${tickets[2].txid}$`));
    expect(id).toMatch(/^demo-/);
    ux.note("Rounds one and two each create a miner cell; from round three the ticket re-arms it, and only the ticket ever pays anyone.");
  });

  test("the best hash survives a reload and is offered again without re-mining", async ({ page, app, sim, rgbpp, ux }) => {
    await platformWallet(app, sim);
    await announce(page, { symbol: MINEABLE });
    await block(page, sim);
    await buyTicket(page, sim);
    await activate(page, sim);
    await mineUntilMintable(page);
    const shownBefore = await page.getByText("mintable now").locator("..").innerText();
    await page.reload();
    const accept = bar(page).getByRole("button", { name: "Use this hash → Mint" });
    await expect(accept).toBeEnabled({ timeout: 30_000 });
    expect(await page.getByText("mintable now").locator("..").innerText()).toBe(shownBefore);
    await accept.click();
    const minted = await mintedShown(page);
    await bar(page).getByRole("button", { name: /^Mint .+ fee$/ }).click();
    await expect(page.getByText(/^Mint sent: /)).toBeVisible({ timeout: 30_000 });
    await block(page, sim);
    for (const job of rgbpp.jobs.values()) expect(job.state, job.failure ?? "").toBe("completed");
    await expect(page.getByText("you hold").locator("..")).toContainText(minted.split(".")[0]);
    ux.note("A reload in the middle of mining keeps the best hash for the ticket; nothing has to be ground twice.");
  });

  test("pause, reload and continue: the search picks up where it stopped", async ({ page, app, sim, ux }) => {
    await platformWallet(app, sim);
    await announce(page, { symbol: MINEABLE });
    await block(page, sim);
    await buyTicket(page, sim);

    const tried = page.getByText("nonces tried").locator("..");
    // The cell is shortened (13.14M); its tooltip carries the exact count.
    const count = async () => Number(((await tried.getAttribute("title")) ?? "").split(":")[0].replace(/[^0-9]/g, ""));
    const bestBits = page.getByText("best", { exact: true }).locator("..");
    const pause = bar(page).getByRole("button", { name: "Pause", exact: true });

    // Mining runs on the arming before it settles.
    await mineOnCpu(page);
    await expect.poll(count, { timeout: 30_000 }).toBeGreaterThan(200_000);
    await pause.click();
    const paused = await count();
    const best = (await bestBits.textContent()) ?? "";
    expect(best).toMatch(/\d+\s*of 16\+ bits/);
    const resume = bar(page).getByRole("button", { name: "Continue", exact: true });
    await expect(resume).toBeVisible();

    await page.reload();
    await expect(resume).toBeVisible({ timeout: 30_000 });
    expect(await count()).toBe(paused);
    await expect(bestBits).toHaveText(best);

    await resume.click();
    await expect.poll(count, { timeout: 30_000 }).toBeGreaterThan(paused);
    await pause.click();
    await expect(mineButton(page)).toBeVisible();
    // The best hash only ever improves.
    expect(Number(((await bestBits.textContent()) ?? "").replace(/[^0-9]/g, ""))).toBeGreaterThanOrEqual(Number(best.replace(/[^0-9]/g, "")));
    ux.note("Pausing and reloading keep the count of nonces tried and the best hash; Continue resumes the same sweep.");
  });

  test.describe("rails", () => {
    test("without a wallet, MINE opens the wallet step in place", async ({ page, app, sim }) => {
      await app.restoreKey(PLATFORM_SECRET);
      const id = await announce(page, { symbol: MINEABLE });
      await app.logOut();
      await block(page, sim);
      await app.goto(`/launch/${id}`);
      await pressMine(page);
      await expect(page.getByRole("heading", { name: "Step 0: Wallet" })).toBeVisible();
      await expect(page.locator(".wz").getByRole("button", { name: "Connect with a passkey" })).toBeVisible();
      await expect(page.locator(".wz").getByRole("button", { name: "Use the demo wallet" })).toBeVisible();
      await expect(bar(page)).toContainText("No wallet connected");
      await expect(page).toHaveURL(new RegExp(`#/launch/${id}$`));
    });

    test("before the opening block there is nothing to buy", async ({ page, app, sim }) => {
      await platformWallet(app, sim);
      await announce(page, { symbol: MINEABLE, opensInBlocks: 10 });
      await expect(page.locator(".lh").getByRole("button", { name: "Not open yet" })).toBeDisabled();
      await expect(page.locator(".lh-status").getByText(/^Opens in 10 blocks/)).toBeVisible();
      await expect(page.getByRole("button", { name: /^Pay ticket/ })).toHaveCount(0);
    });

    test("an empty wallet is told what to send where, waits with a loader, and the step unlocks once coins arrive — no reload", async ({ page, app, sim }) => {
      const wallet = await app.restoreKey(PLATFORM_SECRET);
      await announce(page, { symbol: MINEABLE });
      const base = sim.broadcasts.length;
      await block(page, sim);
      await pressMine(page);
      await expect(page.getByText(/^[0-9,]+ sats missing\./)).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".wz-fund .copyable code")).toHaveText(wallet.address);
      await expect(bar(page).getByRole("button", { name: /^Pay ticket/ })).toBeDisabled();
      await expect(bar(page)).toContainText("Your wallet needs bitcoin");
      await expect(page.locator(".wz-fund .wz-spin")).toBeVisible();
      expect(sim.broadcasts).toHaveLength(base);

      // The address is re-read every 10 s: confirmed coins unlock the step by themselves.
      sim.fund(wallet.address, 200_000);
      sim.advance(1);
      await expect(bar(page).getByRole("button", { name: /^Pay ticket/ })).toBeEnabled({ timeout: 25_000 });
      await expect(page.getByText(/sats missing\./)).toHaveCount(0);
    });

    test("a queue that has not settled keeps the ticket landing, not failed", async ({ page, app, sim, rgbpp }) => {
      await platformWallet(app, sim);
      await announce(page, { symbol: MINEABLE });
      await block(page, sim);
      await pressMine(page);
      await bar(page).getByRole("button", { name: /^Pay ticket/ }).click();
      await expect(page.getByRole("link", { name: "Ticket transaction on mempool.space" })).toBeVisible({ timeout: 30_000 });
      rgbpp.stalled = true;
      await block(page, sim);
      // Confirmed on Bitcoin, not completed on CKB: still landing, mineable, and nothing to activate yet.
      await expect(bar(page).getByRole("button", { name: "Go mine →" })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("link", { name: "Ticket transaction on mempool.space" }).locator("..")).toContainText("landing", { timeout: 30_000 });
      await expect(bar(page).getByRole("button", { name: /^Activate ticket/ })).toHaveCount(0);
    });

    test("on any launch but DEMO the site offers no miner, says why, and points at DEMO", async ({ page, app, sim }) => {
      await platformWallet(app, sim);
      const demo = await announce(page, { symbol: MINEABLE });
      // Even the platform's own launches: only the featured one is mined here.
      await announce(page, { symbol: "OTHER" });
      await block(page, sim);
      await expect(page.getByRole("heading", { name: "Mining is open on DEMO" })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/the mint script on CKB accepts a paid ticket and a valid hash for any launch/)).toBeVisible();
      await expect(page.getByRole("button", { name: /^Pay ticket/ })).toHaveCount(0);
      await page.getByRole("link", { name: "▶ Mine DEMO" }).click();
      await expect(page).toHaveURL(new RegExp(`#/launch/${demo}/mine$`));
      await expect(bar(page).getByRole("button", { name: /^Pay ticket/ })).toBeVisible({ timeout: 30_000 });
    });
  });
});
