/* Holding, sending and receiving tokens — and every way to get it wrong. */

import type { Page } from "@playwright/test";
import { test, expect, kv, amountOf } from "../support/fixtures";
import { claimOnce, copyableText, demoKeyOn, fundedWallet, secondVisitor } from "../support/flows";

/** Open the MESH position on the holdings page and pick one of its tabs. */
async function position(page: Page, tab: "Send" | "Records" | "Backup") {
  await page.goto("/#/holdings");
  const card = page.locator(".panel").filter({ has: page.getByRole("group", { name: "MESH actions" }) });
  await card.getByRole("group", { name: "MESH actions" }).getByRole("button", { name: tab, exact: true }).click();
  return card;
}

test.describe("holdings", () => {
  // These journeys start by mining a claim; on a machine without WebGPU that
  // falls back to the CPU, whose time to 24 zero bits has a long tail.
  test.describe.configure({ timeout: 240_000 });
  test.beforeEach(async ({ app, sim }) => {
    await app.pinOrigin("mesh", sim.tip - 3);
  });

  test("a claimed balance appears as a position with its records", async ({ page, app, sim }) => {
    await fundedWallet(app, sim);
    await app.goto("/launch/mesh");
    const claimed = await claimOnce(page);

    await app.goto("/holdings");
    const card = page.locator(".panel").filter({ has: page.getByRole("group", { name: "MESH actions" }) });
    await expect(card).toBeVisible();
    const held = card.locator(".stat").filter({ hasText: "you hold" });
    expect(amountOf((await held.innerText()).replace(/you hold|MESH/gi, ""))).toBeCloseTo(claimed, 2);
    expect(claimed).toBeGreaterThan(0);
  });

  test.describe("sending", () => {
    test("a transfer moves tokens and the receiver can import the chain to see them", async ({
      page,
      app,
      sim,
      browser,
      ux,
    }) => {
      await fundedWallet(app, sim);
      await app.goto("/launch/mesh");
      await claimOnce(page);

      const bob = await secondVisitor(browser, sim);
      const bobWallet = await demoKeyOn(bob);

      const card = await position(page, "Send");
      await card.getByLabel("recipient public key").fill(bobWallet.identity);
      await card.getByLabel("amount").fill("1");
      await card.getByLabel(/memo/).fill("for the browser suite");
      await card.getByRole("button", { name: "Send MESH" }).click();
      await expect(card.locator(".notice").first()).toBeVisible();

      await app.goto("/launch/mesh");
      await expect(kv(page, "Records")).toHaveText("2");

      // Hand the chain over, as the prototype requires, and let Bob import it.
      const backup = await position(page, "Backup");
      await backup.getByRole("button", { name: "Export this chain" }).click();
      const chain = await copyableText(page, 0);
      expect(JSON.parse(chain).records).toHaveLength(2);

      await bob.goto("/#/holdings");
      await expect(bob.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
      await bob.getByLabel("chain you were sent").fill(chain);
      await bob.getByRole("button", { name: "Verify and receive" }).click();
      await expect(bob.getByText("Verified. Your MESH position is below.")).toBeVisible();
      await expect(bob.getByRole("group", { name: "MESH actions" })).toBeVisible();
      await bob.goto("/#/launch/mesh");
      await expect(kv(bob, "You hold")).toContainText("1.0000 MESH");
      ux.note("A recipient with no tokens yet can import the chain they were sent straight from the holdings page.");
    });

    const INVALID = [
      { name: "a malformed recipient key", to: "not-a-key", amount: "1" },
      { name: "a key that is one character short", to: `02${"a".repeat(63)}`, amount: "1" },
      { name: "zero", to: `02${"a".repeat(64)}`, amount: "0" },
      { name: "more than is held", to: `02${"a".repeat(64)}`, amount: "999999999999" },
      { name: "a negative amount", to: `02${"a".repeat(64)}`, amount: "-1" },
      { name: "more decimals than the token has", to: `02${"a".repeat(64)}`, amount: "0.000000001" },
    ];
    for (const bad of INVALID) {
      test(`refuses to send ${bad.name}`, async ({ page, app, sim }) => {
        await fundedWallet(app, sim);
        await app.goto("/launch/mesh");
        await claimOnce(page);
        const card = await position(page, "Send");
        await card.getByLabel("recipient public key").fill(bad.to);
        await card.getByLabel("amount").fill(bad.amount);
        await expect(card.getByRole("button", { name: "Send MESH" })).toBeDisabled();
      });
    }

    test("refuses to send to yourself", async ({ page, app, sim }) => {
      const me = await fundedWallet(app, sim);
      await app.goto("/launch/mesh");
      await claimOnce(page);
      const card = await position(page, "Send");
      await card.getByLabel("recipient public key").fill(me.identity);
      await card.getByLabel("amount").fill("1");
      const send = card.getByRole("button", { name: "Send MESH" });
      if (await send.isEnabled()) {
        await send.click();
        await expect(card.locator(".notice").filter({ hasText: /own author|yourself/i })).toBeVisible();
      }
      await app.goto("/launch/mesh");
      await expect(kv(page, "Records")).toHaveText("1");
    });
  });

  test("receiving refuses what is not a chain, and a launch the browser has never seen", async ({ page, app }) => {
    await app.createDemoKey();
    await app.goto("/holdings");
    const box = page.getByLabel("chain you were sent");
    await box.fill("hello");
    await page.getByRole("button", { name: "Verify and receive" }).click();
    await expect(page.locator(".notice.warn")).toContainText("not valid JSON");
    await box.fill(JSON.stringify({ launch: "ghost-0000000000000000", records: [] }));
    await page.getByRole("button", { name: "Verify and receive" }).click();
    await expect(page.locator(".notice.warn")).toContainText("has not seen");
  });

  test.describe("the chain cannot be forged", () => {
    test("an imported chain with an inflated balance is rejected, and nothing changes", async ({
      page,
      app,
      sim,
    }) => {
      await fundedWallet(app, sim);
      await app.goto("/launch/mesh");
      await claimOnce(page);
      const before = await kv(page, "You hold").innerText();

      const backup = await position(page, "Backup");
      await backup.getByRole("button", { name: "Export this chain" }).click();
      const chain = JSON.parse(await copyableText(page, 0));
      chain.records[0].body.amount = String(BigInt(chain.records[0].body.amount) * 10n);

      await backup.getByLabel(/import a chain/i).fill(JSON.stringify(chain));
      await backup.getByRole("button", { name: "Verify and replace" }).click();
      await expect(page.locator(".notice.warn").filter({ hasText: /rule allows|not signed/i })).toBeVisible();

      await app.goto("/launch/mesh");
      await expect(kv(page, "You hold")).toHaveText(before);
    });

    test("an import that is not JSON is refused in plain words", async ({ page, app, sim }) => {
      await fundedWallet(app, sim);
      await app.goto("/launch/mesh");
      await claimOnce(page);
      const backup = await position(page, "Backup");
      await backup.getByLabel(/import a chain/i).fill("{ this is not json");
      await backup.getByRole("button", { name: "Verify and replace" }).click();
      await expect(page.locator(".notice").filter({ hasText: "not valid JSON" })).toBeVisible();
    });

    test("corrupted storage is reported, never shown as an empty wallet", async ({ page, app, ux }) => {
      await app.seedStorage({ "btcfun:ledger:v1:mesh": "{broken" });
      await app.createDemoKey();
      await app.goto("/launch/mesh");
      await expect(page.locator(".notice").filter({ hasText: /could not be read/ })).toBeVisible();
      ux.note("A corrupted local chain is named as such on the launch page instead of reading as a zero balance.");
    });
  });

  test("resetting a chain asks first, because it cannot be undone", async ({ page, app, sim, ux }) => {
    await fundedWallet(app, sim);
    await app.goto("/launch/mesh");
    await claimOnce(page);

    const backup = await position(page, "Backup");
    await backup.getByRole("button", { name: "Reset chain" }).click();
    // One click must not destroy the only copy of someone's records.
    await expect(backup.getByText(/This deletes 1 record from this browser/)).toBeVisible();
    await backup.getByRole("button", { name: "Keep them" }).click();
    await app.goto("/launch/mesh");
    await expect(kv(page, "Records")).toHaveText("1");

    // And when they do mean it, it happens.
    const again = await position(page, "Backup");
    await again.getByRole("button", { name: "Reset chain" }).click();
    await again.getByRole("button", { name: "Delete 1 record" }).click();
    await app.goto("/launch/mesh");
    await expect(kv(page, "Records")).toHaveText("0");
    ux.note("Reset chain now names how many records it will delete and needs a second, explicit click.");
  });
});
