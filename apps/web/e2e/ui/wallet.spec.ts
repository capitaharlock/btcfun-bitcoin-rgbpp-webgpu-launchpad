/* Getting a wallet, seeing what it holds, and not being able to break it. */

import { test, expect } from "../support/fixtures";

const KNOWN_SECRET = "11".repeat(32);

test.describe("wallet", () => {
  test("a demo key yields a testnet address and an empty balance", async ({ page, app }) => {
    const wallet = await app.createDemoKey();
    expect(wallet.address).toMatch(/^tb1q[0-9a-z]{38}$/);
    expect(wallet.identity).toMatch(/^0[23][0-9a-f]{64}$/);
    await expect(page.getByText("balance", { exact: true }).locator("..")).toContainText("0");
    // The header pill now shows the connected wallet instead of "Connect wallet".
    await expect(page.getByRole("button", { name: "Connect wallet" })).toHaveCount(0);
  });

  test("funds arriving on chain show up without a reload", async ({ page, app, sim }) => {
    const wallet = await app.createDemoKey();
    sim.fund(wallet.address, 100_000);
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("0.001").first()).toBeVisible();
  });

  test("restoring the same secret twice yields the same wallet", async ({ page, app }) => {
    const first = await app.restoreKey(KNOWN_SECRET);
    await page.getByRole("button", { name: /^Disconnect/ }).click();
    await expect(page.getByRole("button", { name: "Create a demo key" })).toBeVisible();
    const second = await app.restoreKey(KNOWN_SECRET);
    expect(second).toEqual(first);
  });

  test("the revealed secret round-trips to the same address", async ({ page, app }) => {
    const wallet = await app.createDemoKey();
    await page.getByRole("button", { name: "Reveal the demo key secret" }).click();
    const secret = (await page.locator(".copyable code").nth(1).innerText()).trim();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    await page.getByRole("button", { name: /^Disconnect/ }).click();
    expect(await app.restoreKey(secret)).toEqual(wallet);
  });

  test.describe("refuses bad secrets", () => {
    test("too short keeps Restore disabled", async ({ page, app }) => {
      await app.goto("/wallet");
      await page.getByRole("button", { name: "Restore from a secret" }).click();
      await page.getByPlaceholder("64 hex characters").fill("ab".repeat(31));
      await expect(page.getByRole("button", { name: "Restore", exact: true })).toBeDisabled();
    });

    test("64 characters that are not hex are rejected in words a person understands", async ({
      page,
      app,
      ux,
    }) => {
      await app.goto("/wallet");
      await page.getByRole("button", { name: "Restore from a secret" }).click();
      await page.getByPlaceholder("64 hex characters").fill("zz".repeat(32));
      await page.getByRole("button", { name: "Restore", exact: true }).click();
      const notice = page.locator(".notice").filter({ hasText: /hex/i });
      await expect(notice).toBeVisible();
      // An internal function name is not an error message.
      await expect(notice).not.toContainText("hexToBytes");
      await expect(page.getByRole("button", { name: "Create a demo key" })).toBeVisible();
      ux.note("A malformed secret is refused with a readable message and no wallet is created.");
    });
  });

  test("disconnecting forgets the wallet on reload", async ({ page, app }) => {
    await app.createDemoKey();
    await page.getByRole("button", { name: /^Disconnect/ }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
  });
});
