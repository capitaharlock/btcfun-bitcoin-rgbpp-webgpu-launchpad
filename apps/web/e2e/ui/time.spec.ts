/* Block height is the clock: halvings, the rate a ticket locks in, and the end. */

import { test, expect } from "../support/fixtures";
import { announce, bar, block, buyTicket, MINEABLE, mineUntilMintable, mintedShown, platformWallet, activate } from "../support/flows";

test.describe.configure({ timeout: 240_000 });

const WEEK = 1008;

/** The whole-token part of "1,234.00", as a number. */
const whole = (label: string) => Number(label.split(".")[0].replace(/,/g, ""));

test.describe("time", () => {
  test("a day, a week and day 21: the rate halves by the week, shown before buying", async ({ page, app, sim, ux }) => {
    await app.createBrowserKey();
    const id = await announce(page, { symbol: "WEEK" });
    await block(page, sim);
    await expect(page.getByText("halving 0", { exact: true })).toBeVisible();
    await expect(page.getByText(/Now, for a 24-bit hash/).locator("..")).toContainText("576");

    await block(page, sim, 144); // one day
    await expect(page.getByText("halving 0", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Reward halves in 864 blocks/)).toBeVisible();

    await block(page, sim, WEEK - 144); // exactly one week after opening
    // Once the wizard runs the header is a strip; the schedule lives in "About".
    await expect(page.getByRole("list", { name: "Halving 1" })).toBeAttached();
    await expect(page.getByText(/Now, for a 24-bit hash/).locator("..")).toContainText("288");

    await block(page, sim, 2 * WEEK); // day 21
    await expect(page.getByText("halving 3", { exact: true })).toBeVisible();
    await expect(page.getByText(/Now, for a 24-bit hash/).locator("..")).toContainText("72");
    await app.goto("/");
    await expect(page.locator(".tokencard").filter({ hasText: "WEEK" }).first()).toContainText("72");
    expect(id).toMatch(/^week-/);
    ux.note("The rate halves exactly at each 1,008-block boundary and every screen agrees on it.");
  });

  test("a ticket keeps the rate it was bought at, even when minted after a halving", async ({ page, app, sim, rgbpp, ux }) => {
    await platformWallet(app, sim);
    await announce(page, { symbol: MINEABLE });
    await block(page, sim, WEEK - 5); // five blocks before the first halving
    await buyTicket(page, sim); // armed at the current tip, before the halving
    await block(page, sim, 10); // now past the halving
    await activate(page, sim); // the activation keeps the ticket's anchor
    // Once the wizard runs the header is a strip; the schedule lives in "About".
    await expect(page.getByRole("list", { name: "Halving 1" })).toBeAttached();
    const accept = await mineUntilMintable(page);
    await accept.click();
    const label = await mintedShown(page);
    await bar(page).getByRole("button", { name: /^Mint .+ fee$/ }).click();
    await expect(page.getByText(/^Mint sent: /)).toBeVisible({ timeout: 30_000 });
    await block(page, sim);
    const job = [...rgbpp.jobs.values()].at(-1)!;
    expect(job.state, job.failure ?? "").toBe("completed");
    // A pre-halving rate is at least 16² = 256 whole tokens; post-halving tops out lower for small hashes.
    expect(whole(label)).toBeGreaterThanOrEqual(256);
    ux.note("Buying a ticket just before a halving locks the higher rate; the mint after the halving is accepted at that rate.");
  });

  test("after the terminal halving a launch is spent and says so", async ({ page, app, sim }) => {
    await app.createBrowserKey();
    await announce(page, { symbol: "END" });
    await block(page, sim, 43 * WEEK + 1);
    await expect(page.getByText("spent", { exact: true }).first()).toBeVisible();
    await app.goto("/");
    await page.getByRole("button", { name: "Spent", exact: true }).click();
    await expect(page.locator(".tokencard").filter({ hasText: "END" }).first()).toBeVisible();
  });
});
