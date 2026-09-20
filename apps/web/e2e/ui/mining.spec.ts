/* The loop: open a miner cell, buy a ticket, mine, mint — and the rails around it. */

import { test, expect } from "../support/fixtures";
import {
  announce,
  block,
  buyTicket,
  MINEABLE,
  mineButton,
  mineOnCpu,
  mineUntilMintable,
  mintOnce,
  openMiner,
  platformWallet,
  pressMine,
} from "../support/flows";
import { PLATFORM_SECRET } from "../support/platform";
import { PAYMASTER_ADDRESS, PAYMASTER_FEE, PLATFORM_ADDRESS } from "../support/rgbpp";

test.describe.configure({ timeout: 240_000 });

test.describe("mining", () => {
  test("a first-time miner with a key of their own signs every payment, and each step leaves its trace", async ({ page, app, sim, rgbpp, ux }) => {
    await platformWallet(app, sim);
    const id = await announce(page, { symbol: MINEABLE });
    await block(page, sim);
    const wizard = page.getByRole("region", { name: `Mine ${MINEABLE}` });

    // Nothing opens before MINE is pressed; then step 1 explains the one-time setup.
    await expect(wizard).toHaveCount(0);
    await pressMine(page);
    await expect(wizard.getByText("One-time setup: open your miner cell, then pay the ticket.")).toBeVisible();

    // Opening, paid to the paymaster in the same transaction.
    await openMiner(page, sim);
    const opening = sim.broadcasts[0];
    expect(opening.outputs.some((o) => o.address === PAYMASTER_ADDRESS && Number(o.amount) >= PAYMASTER_FEE)).toBe(true);
    await expect(wizard.getByRole("link", { name: "Miner cell transaction on mempool.space" })).toHaveAttribute("href", new RegExp(`${opening.txid}$`));

    // The ticket says what it pays and waits for the click: a key of one's own never spends by itself.
    await expect(wizard.getByText(/To mine you'll pay/)).toBeVisible();
    await expect(wizard.getByText("Platform fee", { exact: true })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(sim.broadcasts).toHaveLength(1);
    await buyTicket(page);
    const ticket = sim.broadcasts.at(-1)!;
    expect(ticket.outputs.filter((o) => Number(o.amount) === 9500)).toHaveLength(1);
    expect(ticket.outputs.filter((o) => o.address === PLATFORM_ADDRESS && Number(o.amount) === 500)).toHaveLength(1);

    // Mining started by itself on the broadcast ticket; minting waits for it to settle.
    await expect(page.getByText(/^Ticket landing/)).toBeVisible();
    await expect(wizard.getByRole("link", { name: "Ticket transaction on mempool.space" })).toHaveAttribute("href", new RegExp(`${ticket.txid}$`));
    await mineOnCpu(page);
    await expect(page.getByText(/zero bits/).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: /^Mint / })).toHaveCount(0);
    await wizard.getByRole("button", { name: "Pause", exact: true }).click();
    await block(page, sim);

    // Settled — a qualifying hash can be minted, for exactly what it showed.
    const mint = await mineUntilMintable(page);
    const shown = ((await mint.textContent()) ?? "").replace(/^Mint /, "");
    await mint.click();
    await expect(page.getByText(/^Minting /)).toBeVisible();
    await block(page, sim);
    await expect(wizard.getByRole("button", { name: "Mine again", exact: true })).toBeVisible({ timeout: 30_000 });
    const mintTx = sim.broadcasts.at(-1)!.txid;
    await expect(wizard.getByRole("link", { name: "Mint transaction on mempool.space" })).toHaveAttribute("href", new RegExp(`${mintTx}$`));
    await expect(wizard.getByRole("link", { name: "Proof" })).toHaveAttribute("href", `#/proof/${mintTx}`);

    // The balance is on chain: the simulated queue accepted the mint under the script's rules.
    expect([...rgbpp.jobs.values()].every((j) => j.state === "completed")).toBe(true);
    // The mint is announced to the public feed, pointing at its transaction.
    const minted = rgbpp.events.find((e) => e.signed.body.kind === "mint");
    expect(minted?.signed.body.txid).toBe(mintTx);
    await expect(page.getByText("you hold").locator("..")).toContainText(shown.split(" ")[0]);

    // Mine again: back to step 1, with a clean slate.
    await wizard.getByRole("button", { name: "Mine again", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sign and pay", exact: true })).toBeVisible();
    await expect(wizard.getByRole("link", { name: "Mint transaction on mempool.space" })).toHaveCount(0);

    await app.goto("/holdings");
    await expect(page.getByText(shown.split(" ")[0]).first()).toBeVisible();
    expect(id).toMatch(/^demo-/);
    ux.note("With a key of one's own the loop is three signatures — open, ticket, mint — and each leaves its transaction on screen.");
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
    const pause = page.locator(".wz").getByRole("button", { name: "Pause", exact: true });

    // Mining started by itself on the broadcast ticket, before it settles.
    await mineOnCpu(page);
    await expect.poll(count, { timeout: 30_000 }).toBeGreaterThan(200_000);
    await pause.click();
    const paused = await count();
    const best = (await bestBits.textContent()) ?? "";
    expect(best).toMatch(/\d+\s*zero bits/);
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
    await expect(page.getByText("Paused — Continue picks up exactly where it stopped.")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible({ timeout: 30_000 });
    expect(await count()).toBe(paused);
    await expect(bestBits).toHaveText(best);

    // The header's big button drives the same search.
    await page.locator(".lh").getByRole("button", { name: "Continue mining" }).click();
    await expect.poll(count, { timeout: 30_000 }).toBeGreaterThan(paused);
    await page.locator(".lh").getByRole("button", { name: "Pause mining" }).click();
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
      await expect(page.getByText("You haven't connected a wallet yet.")).toBeVisible();
      await expect(page.locator(".wz").getByRole("button", { name: "Connect with a passkey" })).toBeVisible();
      await expect(page.locator(".wz").getByRole("button", { name: "Use the demo wallet" })).toBeVisible();
      await expect(page.locator(".lh").getByRole("button", { name: "Waiting for a wallet" })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`#/launch/${id}$`));
    });

    test("before the opening block there is nothing to buy", async ({ page, app, sim }) => {
      await platformWallet(app, sim);
      await announce(page, { symbol: MINEABLE, opensInBlocks: 10 });
      await expect(page.locator(".lh").getByRole("button", { name: "Not open yet" })).toBeDisabled();
      await expect(page.locator(".lh-status").getByText(/^Opens in 10 blocks/)).toBeVisible();
      await expect(page.getByRole("button", { name: /Open miner cell|Sign and pay/ })).toHaveCount(0);
    });

    test("an empty wallet is told what to send where, and the step unlocks once it arrives", async ({ page, app, sim }) => {
      const wallet = await app.restoreKey(PLATFORM_SECRET);
      await announce(page, { symbol: MINEABLE });
      await block(page, sim);
      await pressMine(page);
      await expect(page.getByText("Not enough bitcoin.")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".wz-fund .copyable code")).toHaveText(wallet.address);
      await expect(page.getByRole("button", { name: "Open miner cell", exact: true })).toBeDisabled();
      await expect(page.locator(".lh").getByRole("button", { name: "Waiting for funds" })).toBeVisible();
      expect(sim.broadcasts).toHaveLength(0);

      sim.fund(wallet.address, 200_000);
      await block(page, sim);
      await expect(page.getByRole("button", { name: "Open miner cell", exact: true })).toBeEnabled({ timeout: 30_000 });
      await expect(page.getByText("Not enough bitcoin.")).toHaveCount(0);
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
      await expect(page.getByRole("button", { name: /Open miner cell|Sign and pay/ })).toHaveCount(0);
      await page.getByRole("link", { name: "▶ Mine DEMO" }).click();
      await expect(page).toHaveURL(new RegExp(`#/launch/${demo}/mine$`));
      await expect(page.getByRole("button", { name: "Open miner cell", exact: true })).toBeVisible({ timeout: 30_000 });
    });
  });
});
