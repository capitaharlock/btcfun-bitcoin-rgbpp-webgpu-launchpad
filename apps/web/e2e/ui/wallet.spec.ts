/* Getting a wallet, seeing what it holds, and not being able to break it. */

import { test, expect } from "../support/fixtures";

const KNOWN_SECRET = "11".repeat(32);
/** The shared demo wallet's address, fixed by the constant in `vault.ts`. */
const DEMO_ADDRESS = "tb1qjjq482m9pj7dvge0l2r07a3fcyflktrzgzf6tz";

test.describe("wallet", () => {
  test("a browser key yields a testnet address and an empty balance", async ({ page, app }) => {
    const wallet = await app.createBrowserKey();
    expect(wallet.address).toMatch(/^tb1q[0-9a-z]{38}$/);
    expect(wallet.identity).toMatch(/^0[23][0-9a-f]{64}$/);
    await expect(page.getByText("balance", { exact: true }).locator("..")).toContainText("0");
    // The header pill now shows the connected wallet instead of "Connect wallet".
    await expect(page.getByRole("button", { name: "Connect wallet" })).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("link", { name: /^Wallet/ })).toBeVisible();
  });

  test("funds arriving on chain show up without a reload", async ({ page, app, sim }) => {
    const wallet = await app.createBrowserKey();
    sim.fund(wallet.address, 100_000);
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("0.001").first()).toBeVisible();
    await expect(page.getByText("confirmed", { exact: true }).locator("..")).toContainText("0.001");
  });

  test("restoring the same secret twice yields the same wallet", async ({ page, app }) => {
    const first = await app.restoreKey(KNOWN_SECRET);
    await app.logOut();
    await expect(page.getByRole("button", { name: "Create a browser key" })).toBeVisible();
    const second = await app.restoreKey(KNOWN_SECRET);
    expect(second).toEqual(first);
  });

  test("the revealed secret round-trips to the same address", async ({ page, app }) => {
    const wallet = await app.createBrowserKey();
    await page.getByRole("button", { name: "Reveal the wallet secret" }).click();
    const secret = (await page.locator(".copyable code").nth(1).innerText()).trim();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    await app.logOut();
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
      await expect(page.getByRole("button", { name: "Create a browser key" })).toBeVisible();
      ux.note("A malformed secret is refused with a readable message and no wallet is created.");
    });
  });

  test("logging out forgets the wallet on reload", async ({ page, app }) => {
    await app.createBrowserKey();
    await app.logOut();
    await page.reload();
    await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
  });
});

test.describe("connect chooser", () => {
  test("offers your own wallet or the shared demo one, in a modal that Escape closes", async ({ page, app, ux }) => {
    await app.goto("/");
    const trigger = page.getByRole("banner").getByRole("button", { name: "Connect wallet" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Connect a wallet" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.getByRole("heading", { name: "Your wallet — passkey" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /Demo wallet — shared, testnet3 only/ })).toBeVisible();
    await expect(dialog).toContainText("Its key is public");
    await expect(dialog.getByRole("button", { name: "Restore from a secret" })).toBeVisible();

    // Focus starts inside and cannot leave for the page behind.
    await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    ux.note("Connect wallet opens a two-choice dialog; Escape closes it and returns focus to the button.");
  });

  test("the demo wallet connects in one click and says it is shared", async ({ page, app, context, ux }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const wallet = await app.connectDemoWallet();
    expect(wallet.address).toBe(DEMO_ADDRESS);

    // The whole address, copyable, with a QR code of it.
    await expect(page.locator(".copyable code").first()).toHaveText(DEMO_ADDRESS);
    await page.getByRole("button", { name: "Copy address" }).click();
    await expect(page.getByRole("button", { name: "Copy address" })).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(DEMO_ADDRESS);
    await expect(page.getByRole("img", { name: `QR code of the address ${DEMO_ADDRESS}` })).toBeVisible();

    // Shared, and said so everywhere the wallet shows.
    await expect(page.getByRole("banner").getByText("Demo wallet · shared")).toBeVisible();
    await expect(page.locator("main").getByText("Demo wallet · shared", { exact: true })).toBeVisible();
    await expect(page.getByText(/Its key is public: anyone can spend what is here/)).toBeVisible();
    ux.note("The demo wallet needs no gesture and no funds of one's own; its address, copy button and QR are on the overview.");
  });
});

test.describe("wallet tabs", () => {
  test("overview, tokens and activity are places of their own", async ({ page, app }) => {
    await app.createBrowserKey();
    const tabs = page.getByRole("navigation", { name: "Wallet sections" });
    await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: /held|Tokens/ })).toBeVisible();

    await tabs.getByRole("link", { name: "Tokens" }).click();
    await expect(page).toHaveURL(/#\/wallet\/tokens$/);
    await expect(page.getByText(/No tokens yet/)).toBeVisible();

    await tabs.getByRole("link", { name: "Activity" }).click();
    await expect(page).toHaveURL(/#\/wallet\/activity$/);
    await expect(page.getByText(/Nothing signed from this browser yet/)).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/#\/wallet\/tokens$/);
  });

  test("the old holdings address opens the Tokens tab", async ({ page, app }) => {
    await app.createBrowserKey();
    await app.goto("/holdings");
    await expect(page).toHaveURL(/#\/wallet\/tokens$/);
    await expect(
      page.getByRole("navigation", { name: "Wallet sections" }).getByRole("link", { name: "Tokens" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("the top bar has one way to the wallet and no separate holdings button", async ({ page, app }) => {
    await app.createBrowserKey();
    await app.goto("/");
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("button", { name: "Holdings" })).toHaveCount(0);
    // One click: the wallet button is the way to the wallet page, not a menu.
    await banner.getByRole("link", { name: /^Wallet/ }).click();
    await expect(page).toHaveURL(/#\/wallet$/);
    await expect(banner.getByRole("menu")).toHaveCount(0);
  });
});

test.describe("switching wallets", () => {
  test("switches from a browser key to the demo wallet on the wallet page", async ({ page, app }) => {
    const before = await app.createBrowserKey();
    await app.goto("/wallet");
    await page.getByRole("button", { name: "Switch wallet" }).click();

    // The same warning as a log out: switching away from a browser key loses it.
    const leaving = page.getByRole("dialog", { name: "Switch to another wallet?" });
    await expect(leaving).toContainText("loses the wallet");
    await leaving.getByRole("button", { name: "Log out and switch" }).click();

    await expect(page.getByRole("heading", { name: "Connect a wallet" })).toBeVisible();
    await page.getByRole("button", { name: "Use the demo wallet" }).first().click();
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("link", { name: /^Demo wallet/ })).toBeVisible();
    await expect(banner.getByText("Demo wallet · shared")).toBeVisible();
    expect(DEMO_ADDRESS).not.toBe(before.address);
  });

  test("cancelling a switch keeps the wallet", async ({ page, app }) => {
    await app.connectDemoWallet();
    await page.getByRole("button", { name: "Switch wallet" }).click();
    const leaving = page.getByRole("dialog", { name: "Switch to another wallet?" });
    await expect(leaving).toContainText("open it again any time");
    await leaving.getByRole("button", { name: "Cancel" }).click();
    await expect(leaving).toBeHidden();
    await expect(page.getByRole("banner").getByRole("link", { name: /^Demo wallet/ })).toBeVisible();
  });
});

test.describe("log out", () => {
  test("says what each kind of wallet loses before it forgets it", async ({ page, app }) => {
    await app.connectDemoWallet();
    await page.getByRole("button", { name: "Log out" }).click();
    const demo = page.getByRole("dialog", { name: "Log out of this wallet?" });
    await expect(demo).toContainText("open it again any time");
    await demo.getByRole("button", { name: "Cancel" }).click();
    await expect(demo).toBeHidden();
    await app.logOut();
    await expect(page.getByRole("heading", { name: "Connect a wallet" })).toBeVisible();

    await app.createBrowserKey();
    await page.getByRole("button", { name: "Log out" }).click();
    const local = page.getByRole("dialog", { name: "Log out of this wallet?" });
    await expect(local).toContainText("loses the wallet");
    await expect(local.getByRole("button", { name: "Reveal the wallet secret" })).toBeVisible();
  });

  test("returns to disconnected everywhere", async ({ page, app }) => {
    await app.connectDemoWallet();
    await app.logOut();
    await expect(page.getByRole("banner").getByText("Demo wallet · shared")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("banner").getByRole("button", { name: "Connect wallet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use the demo wallet" })).toBeVisible();
  });
});
