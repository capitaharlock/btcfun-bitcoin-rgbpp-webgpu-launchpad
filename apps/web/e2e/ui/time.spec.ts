/* Time passing: a day, a week, twenty-one days, and past the end of issuance.
 *
 * The block height is the clock, so these tests move the simulated tip and
 * read what the launch page says. Expected values come from the formula
 * itself — A(n) = 1 − 2^(−n/H) with H = 1008 — not from the app's own code,
 * so a regression in the schedule cannot agree with itself here.
 */

import { test, expect, kv, amountOf } from "../support/fixtures";
import type { Page } from "@playwright/test";

const H = 1008;
const EPOCH = 6; // MESH's epoch length in blocks
const DAY = 144;

/** Share of supply scheduled after n blocks, as the page formats it. */
function expectedShare(n: number): string {
  const truncated = Math.floor((1 - 2 ** (-n / H)) * 10_000) / 10_000;
  return `${(truncated * 100).toFixed(1)}%`;
}

async function allowance(page: Page): Promise<number> {
  return amountOf(await kv(page, "Epoch allowance").innerText());
}

test.describe("the schedule over time", () => {
  test.beforeEach(async ({ app, sim }) => {
    // MESH opens exactly at the current tip, so block offset == blocks advanced.
    await app.pinOrigin("mesh", sim.tip);
  });

  const MOMENTS = [
    { label: "at opening", blocks: 0 },
    { label: "after one day", blocks: DAY },
    { label: "after seven days — one half-life", blocks: 7 * DAY },
    { label: "after fourteen days — two half-lives", blocks: 14 * DAY },
    { label: "on day twenty-one — three half-lives", blocks: 21 * DAY },
    { label: "after six weeks", blocks: 42 * DAY },
  ];

  for (const { label, blocks } of MOMENTS) {
    test(`${label}, the page shows the schedule's share and epoch`, async ({ page, app, sim }) => {
      sim.advance(blocks);
      await app.goto("/launch/mesh");
      await expect(page.getByText(`epoch ${Math.floor(blocks / EPOCH)}`, { exact: true })).toBeVisible();
      await expect(page.locator(".stat").filter({ hasText: "scheduled" })).toContainText(expectedShare(blocks));
      await expect(page.getByText(`block offset ${blocks.toLocaleString("en-US")}`)).toBeVisible();
    });
  }

  test("each half-life halves what an epoch may mint", async ({ page, app, sim, ux }) => {
    // Read only once the page shows the epoch the chain is really in: before the
    // provider answers, figures are computed against a placeholder height.
    const settledAt = async (blocks: number) => {
      await expect(page.getByText(`epoch ${blocks / EPOCH}`, { exact: true })).toBeVisible();
      return allowance(page);
    };

    await app.goto("/launch/mesh");
    const day0 = await settledAt(0);

    sim.advance(7 * DAY);
    await page.reload();
    const day7 = await settledAt(7 * DAY);

    sim.advance(14 * DAY);
    await page.reload();
    const day21 = await settledAt(21 * DAY);

    expect(day7 / day0).toBeCloseTo(0.5, 2);
    expect(day21 / day0).toBeCloseTo(0.125, 2);
    ux.note(
      `Epoch allowance on MESH: ${day0} at opening, ${day7} on day 7, ${day21} on day 21 — halving every week as specified.`,
    );
  });

  test("the countdown to the epoch close tracks the chain", async ({ page, app, sim }) => {
    sim.advance(2);
    await app.goto("/launch/mesh");
    await expect(page.getByText(/^4 blk · ~40m to close$/)).toBeVisible();
    sim.advance(3);
    await page.reload();
    await expect(page.getByText(/^1 blk · ~10m to close$/)).toBeVisible();
    sim.advance(1);
    await page.reload();
    await expect(page.getByText("epoch 1", { exact: true })).toBeVisible();
    await expect(page.getByText(/^6 blk · ~60m to close$/)).toBeVisible();
  });

  test("a new block reaches an open page without a reload", async ({ page, app, sim }) => {
    await app.goto("/launch/mesh");
    await expect(page.getByText("epoch 0", { exact: true })).toBeVisible();
    sim.advance(EPOCH);
    // The provider is polled every 15 s; nothing but waiting should be needed.
    await expect(page.getByText("epoch 1", { exact: true })).toBeVisible({ timeout: 25_000 });
  });

  test("past the terminal block the whole supply has been offered and nothing more", async ({ page, app, sim, ux }) => {
    sim.advance(70_000);
    await app.goto("/launch/mesh");
    await expect(page.locator(".stat").filter({ hasText: "scheduled" })).toContainText("100.0%");
    await expect(page.getByText(`epoch ${Math.floor(70_000 / EPOCH)}`, { exact: true })).toBeVisible();
    expect(await allowance(page)).toBe(0);
    ux.note("Beyond the terminal block the page shows 100% scheduled and a zero epoch allowance — issuance visibly over.");
  });
});
