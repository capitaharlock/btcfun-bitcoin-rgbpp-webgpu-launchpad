/* Creating a token through the wizard: the path that works, and every way off it. */

import { test, expect, type App } from "../support/fixtures";
import type { Page } from "@playwright/test";

async function fillIdentity(page: Page, symbol = "QATEST", name = "Quality run", blurb = "A token created by the browser suite to check the wizard end to end.") {
  await page.getByLabel(/^Symbol/).fill(symbol);
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^One sentence/).fill(blurb);
}

async function next(page: Page) {
  await page.getByRole("button", { name: "Continue →" }).click();
}

async function toCommit(page: Page, app: App) {
  await app.goto("/create");
  await fillIdentity(page);
  await next(page);
  await next(page);
  await next(page);
  await expect(page.getByRole("heading", { name: "Check it, then sign it" })).toBeVisible();
}

test.describe("create a token", () => {
  test("the whole wizard, signed with a wallet, lands in the launches grid", async ({ page, app, sim, ux }) => {
    await app.createDemoKey();
    await toCommit(page, app);

    const opensAt = sim.tip + 6; // default: opens in 6 blocks
    await expect(page.getByText(opensAt.toLocaleString("en-US")).first()).toBeVisible();

    await page.getByRole("button", { name: "Commit QATEST" }).click();
    await expect(page.getByRole("heading", { name: "QATEST is committed" })).toBeVisible();

    await page.getByRole("button", { name: "Open QATEST" }).click();
    await expect(page).toHaveURL(/#\/launch\/qatest-[0-9a-f]{16}$/);
    await expect(page.getByRole("heading", { name: "QATEST" })).toBeVisible();
    await expect(page.getByText("committed").first()).toBeVisible();

    await app.goto("/");
    await expect(page.getByText("QATEST").first()).toBeVisible();
    ux.note("Commit → open → grid takes three clicks and the new token is visible immediately, marked as not yet open.");
  });

  test("a committed token opens for mining once the chain reaches its height", async ({ page, app, sim }) => {
    await app.createDemoKey();
    await toCommit(page, app);
    await page.getByRole("button", { name: "Commit QATEST" }).click();
    await page.getByRole("button", { name: "Open QATEST" }).click();
    await expect(page.getByText("committed").first()).toBeVisible();

    sim.advance(6);
    // Just as on testnet4: the new tip is announced before its block can be
    // fetched by height. The page must keep asking, not give up for the epoch.
    sim.unindexed.set(sim.tip, 2);
    await page.reload();
    await expect(page.getByText("mining", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("epoch 0", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Buy a ticket for epoch 0" })).toBeVisible();
    await expect(page.getByText("Waiting for the hash of the block that opened this epoch.")).toBeHidden({
      timeout: 20_000,
    });
  });

  test("the draft survives leaving the wizard to connect a wallet", async ({ page, app, ux }) => {
    await toCommit(page, app);
    await page.getByRole("link", { name: "Connect a wallet" }).click();
    await page.getByRole("button", { name: "Create a demo key" }).click();
    await expect(page.locator(".copyable code").first()).toHaveText(/^tb1q/);

    await app.goto("/create");
    // Back on the step they left, with the wallet they went to get: one click
    // from signing, nothing retyped.
    await expect(page.getByRole("heading", { name: "Check it, then sign it" })).toBeVisible();
    await page.getByRole("button", { name: "Commit QATEST" }).click();
    await expect(page.getByRole("heading", { name: "QATEST is committed" })).toBeVisible();

    // A finished draft does not come back to haunt the next launch.
    await app.goto("/");
    await app.goto("/create");
    await expect(page.getByLabel(/^Symbol/)).toHaveValue("");
    ux.note("Step 4 sends a walletless user to the wallet page; on return they land on step 4 with everything intact, one click from signing.");
  });

  test.describe("stays on the rails", () => {
    const BAD_SYMBOLS = [
      { value: "A", why: "one character" },
      { value: "1ABC", why: "starts with a digit" },
      { value: "AB-CD", why: "punctuation" },
      { value: "MESH", why: "a seeded launch's symbol" },
    ];
    for (const { value, why } of BAD_SYMBOLS) {
      test(`refuses a symbol with ${why}`, async ({ page, app }) => {
        await app.goto("/create");
        await fillIdentity(page, value);
        await expect(page.getByRole("button", { name: "Continue →" })).toBeDisabled();
        // Later steps cannot be reached around the Continue button either.
        await expect(page.getByRole("button", { name: /Access/ })).toBeDisabled();
        await expect(page.getByRole("button", { name: /Commit/ }).first()).toBeDisabled();
      });
    }

    test("lowercase is accepted and shown as the uppercase symbol it becomes", async ({ page, app }) => {
      await app.goto("/create");
      await page.getByLabel(/^Symbol/).fill("qatest");
      await expect(page.getByLabel(/^Symbol/)).toHaveValue("QATEST");
    });

    test("a symbol longer than eight characters cannot be typed", async ({ page, app }) => {
      await app.goto("/create");
      await page.getByLabel(/^Symbol/).fill("ABCDEFGHIJK");
      await expect(page.getByLabel(/^Symbol/)).toHaveValue("ABCDEFGH");
    });

    test("name and one-line description need real content", async ({ page, app }) => {
      await app.goto("/create");
      await fillIdentity(page, "QATEST", "Q", "short");
      await expect(page.getByRole("button", { name: "Continue →" })).toBeDisabled();
      await expect(page.getByText(/Between 2 and 40 characters/)).toBeVisible();
      await expect(page.getByText(/Between 10 and 160 characters/)).toBeVisible();
    });

    test("a launch cannot open in the past or right now", async ({ page, app }) => {
      await app.goto("/create");
      await fillIdentity(page);
      await next(page);
      const opens = page.getByLabel(/^Opens in/);
      await opens.fill("0");
      await expect(opens).toHaveValue("1");
      await opens.fill("-50");
      await expect(opens).not.toHaveValue(/-/);
    });

    test("a ticket below the dust limit is refused", async ({ page, app }) => {
      await app.goto("/create");
      await fillIdentity(page);
      await next(page);
      await page.getByLabel(/^Ticket price/).fill("100");
      await expect(page.getByText(/At least 546 sats/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue →" })).toBeDisabled();
    });

    test("committing without a wallet offers to connect one instead", async ({ page, app }) => {
      await toCommit(page, app);
      await expect(page.getByText("A launch is a signed commitment, so it needs a wallet key.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Commit QATEST" })).toHaveCount(0);
    });
  });

  test("the emission step states the halvings the schedule promises", async ({ page, app }) => {
    await app.goto("/create");
    await fillIdentity(page);
    await next(page);
    await next(page);
    const milestones = page.locator(".kv").filter({ hasText: "After 1 half-life" });
    await expect(milestones).toContainText("50");
    await expect(milestones.getByText(/After 2/).locator("..")).toContainText("75");
    await expect(milestones.getByText(/After 3/).locator("..")).toContainText("87.5");
    await expect(milestones.getByText(/In 21 days/).locator("..")).toContainText("87.5");
  });
});
