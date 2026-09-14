/* Announcing a launch: identity, income and opening — and nothing economic. */

import { test, expect } from "../support/fixtures";
import { announce, block } from "../support/flows";

test.describe("create wizard", () => {
  test("announces a launch whose id is its token's, and lists it as opening soon", async ({ page, app, sim, ux }) => {
    const wallet = await app.createDemoKey();
    const id = await announce(page, { symbol: "QUILL", opensInBlocks: 3 });
    expect(id).toMatch(/^quill-[0-9a-f]{16}$/);
    await expect(page.getByRole("heading", { name: "QUILL" })).toBeVisible();
    await expect(page.getByText(/opens in 3 blk/)).toBeVisible();

    // The token id on the page is the one in the URL.
    const tokenId = await page.getByText(/^0x[0-9a-f]{8}/).first().getAttribute("title");
    expect(tokenId?.slice(2, 18)).toBe(id.split("-")[1]);
    // The promoter defaulted to the creator's own address.
    await expect(page.locator(`a[href$="${wallet.address}"]`)).toBeVisible();

    await app.goto("/");
    await expect(page.locator(".tokencard").filter({ hasText: "QUILL" }).first()).toContainText("opens soon");
    await block(page, sim, 3);
    await expect(page.locator(".tokencard").filter({ hasText: "QUILL" }).first()).toContainText("mining now");
    ux.note("Announcing takes three steps and no economic choices; the card flips to mining when the block arrives.");
  });

  test("never asks for supply, price, difficulty or schedule", async ({ page, app }) => {
    await app.createDemoKey();
    await app.goto("/create");
    for (const label of [/supply/i, /decimals/i, /difficulty/i, /half-life/i, /ticket price/i, /epoch/i]) {
      await expect(page.getByLabel(label)).toHaveCount(0);
    }
    await page.getByLabel("Symbol").fill("MESH");
    await page.getByLabel("Name").fill("Meshwork");
    await page.getByLabel("One sentence").fill("A community token for mesh relay operators.");
    await page.getByRole("button", { name: "Continue →" }).click();
    await expect(page.getByText("What you do not choose")).toBeVisible();
    await expect(page.getByText("10,000 sats: 9,500 to your address, 500 to the platform")).toBeVisible();
  });

  test.describe("refuses what is not a launch", () => {
    test("a malformed symbol, name or sentence keeps Continue disabled with the reason in place", async ({ page, app }) => {
      await app.goto("/create");
      await page.getByLabel("Symbol").fill("1X");
      await page.getByLabel("Name").fill("A");
      await page.getByLabel("One sentence").fill("short");
      await expect(page.getByRole("button", { name: "Continue →" })).toBeDisabled();
      await expect(page.getByText("2–8 characters, letters and digits, starting with a letter.")).toBeVisible();
      await expect(page.getByText("Between 2 and 40 characters.")).toBeVisible();
    });

    test("an income address on another network is refused", async ({ page, app }) => {
      await app.createDemoKey();
      await app.goto("/create");
      await page.getByLabel("Symbol").fill("MESH");
      await page.getByLabel("Name").fill("Meshwork");
      await page.getByLabel("One sentence").fill("A community token for mesh relay operators.");
      await page.getByRole("button", { name: "Continue →" }).click();
      await page.getByLabel("Ticket income to").fill("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq");
      await expect(page.getByText(/A testnet3 address, starting with tb1/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue →" })).toBeDisabled();
    });

    test("opening now is refused: a launch must be announced before it opens", async ({ page, app }) => {
      await app.createDemoKey();
      await app.goto("/create");
      await page.getByLabel("Symbol").fill("MESH");
      await page.getByLabel("Name").fill("Meshwork");
      await page.getByLabel("One sentence").fill("A community token for mesh relay operators.");
      await page.getByRole("button", { name: "Continue →" }).click();
      await page.getByLabel("Opens in (blocks)").fill("0");
      // The field clamps to 1, the earliest future block.
      await expect(page.getByLabel("Opens in (blocks)")).toHaveValue("1");
    });
  });

  test("keeps the draft when the visitor leaves to get a wallet", async ({ page, app, ux }) => {
    await app.goto("/create");
    await page.getByLabel("Symbol").fill("TIDE");
    await page.getByLabel("Name").fill("Tidepool");
    await page.getByLabel("One sentence").fill("Coastal monitoring co-op, sensors earn.");
    await page.getByRole("button", { name: "Continue →" }).click();
    await page.getByLabel("Ticket income to").fill("tb1qt5r7g40j93s46c3mdnycc2qsz2t57xqfjddukj");
    await page.getByRole("button", { name: "Continue →" }).click();
    await page.getByRole("link", { name: "Connect a wallet" }).click();
    await page.getByRole("button", { name: "Create a demo key" }).click();
    await app.goto("/create");
    await expect(page.getByRole("button", { name: "Announce TIDE" })).toBeVisible();
    ux.note("Leaving the wizard for the wallet and coming back lands on the last step with everything kept.");
  });
});
