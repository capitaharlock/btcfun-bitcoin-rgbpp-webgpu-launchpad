/* What you hold, and sending it to someone else. */

import { test, expect } from "../support/fixtures";
import { announce, block, browserKeyOn, MINEABLE, mintOnce, platformWallet, secondVisitor } from "../support/flows";

test.describe.configure({ timeout: 300_000 });

test.describe("holdings", () => {
  test("a transfer reaches another wallet, which sees it with no action of its own", async ({ page, app, sim, rgbpp, browser, ux }) => {
    await platformWallet(app, sim);
    const id = await announce(page, { symbol: MINEABLE });
    await block(page, sim);
    const minted = await mintOnce(page, sim);
    const total = Number(minted.split(" ")[0].replace(/,/g, ""));

    const bobPage = await secondVisitor(browser, sim, rgbpp);
    const bob = await browserKeyOn(bobPage);
    sim.track(bob.address);

    await app.goto("/holdings");
    const card = page.locator(".tk-card").filter({ hasText: MINEABLE });
    await card.getByRole("button", { name: "Transfer" }).click();
    await page.getByLabel("Send to").fill(bob.address);
    await page.getByLabel(`Amount (${MINEABLE})`).fill("100");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/^Sent — /)).toBeVisible();
    await block(page, sim);

    // The sender keeps the change; the recipient sees the rest.
    await expect(page.getByText((total - 100).toLocaleString("en-US")).first()).toBeVisible({ timeout: 30_000 });
    await bobPage.goto("/#/holdings");
    await expect(bobPage.getByText("100", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await bobPage.goto(`/#/launch/${id}`);
    await expect(bobPage.getByText("you hold").locator("..")).toContainText("100");
    await bobPage.context().close();
    ux.note("The recipient's balance appears on their own holdings page after one block, without any action from them.");
  });

  test.describe("refuses what cannot be sent", () => {
    test("more than the balance, a non-address and a mainnet address keep Send disabled", async ({ page, app, sim }) => {
      await platformWallet(app, sim);
      await announce(page, { symbol: MINEABLE });
      await block(page, sim);
      const minted = await mintOnce(page, sim);
      const total = Number(minted.split(" ")[0].replace(/,/g, ""));
      await app.goto("/holdings");
      await page.locator(".tk-card").filter({ hasText: MINEABLE }).getByRole("button", { name: "Transfer" }).click();

      await page.getByLabel("Send to").fill("tb1qt5r7g40j93s46c3mdnycc2qsz2t57xqfjddukj");
      await page.getByLabel(`Amount (${MINEABLE})`).fill(String(total + 1));
      await expect(page.getByText("More than you hold.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

      await page.getByLabel(`Amount (${MINEABLE})`).fill("1");
      await page.getByLabel("Send to").fill("not-an-address");
      await expect(page.getByText(/A testnet3 address/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

      await page.getByLabel("Send to").fill("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq");
      await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

      await page.getByLabel(`Amount (${MINEABLE})`).fill("0");
      await page.getByLabel("Send to").fill("tb1qt5r7g40j93s46c3mdnycc2qsz2t57xqfjddukj");
      await expect(page.getByText("A positive amount, up to 8 decimals.")).toBeVisible();
    });
  });

  test("an empty wallet is told how to get tokens", async ({ page, app }) => {
    await app.createBrowserKey();
    await app.goto("/holdings");
    await expect(page.getByText(/No tokens yet/)).toBeVisible();
  });
});
