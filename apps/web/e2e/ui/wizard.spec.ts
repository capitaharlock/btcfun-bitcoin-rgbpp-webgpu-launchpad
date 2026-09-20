/* The mining wizard on a launch page, on desktop and on a phone.
 *
 * The header stays in view with its MINE; the wizard under it walks through
 * wallet, ticket, mine and mint without leaving the page, and every finished
 * step keeps a link to its transaction.
 */

import { test, expect } from "../support/fixtures";
import { announce, block, MINEABLE, mineUntilMintable, platformWallet, pressMine } from "../support/flows";
import { PLATFORM_SECRET } from "../support/platform";
import { PLATFORM_ADDRESS } from "../support/rgbpp";

test.describe.configure({ timeout: 240_000 });

/** The shared demo wallet's address (`lib/bitcoin/vault.ts`). */
const DEMO_ADDRESS = "tb1qjjq482m9pj7dvge0l2r07a3fcyflktrzgzf6tz";

test.describe("mining wizard", () => {
  test("from a card's MINE with no wallet: the header stays in view, the demo wallet is picked in place, and the loop runs itself to the mint", async ({ page, app, sim, ux }) => {
    await app.restoreKey(PLATFORM_SECRET);
    const id = await announce(page, { symbol: MINEABLE, image: "/tokens/demo.svg" });
    await app.logOut();
    sim.fund(DEMO_ADDRESS, 200_000);
    await block(page, sim);

    await app.goto("/");
    await page.locator(".tokencard").filter({ hasText: MINEABLE }).first().getByRole("link", { name: `Mine ${MINEABLE}` }).click();
    await expect(page).toHaveURL(new RegExp(`#/launch/${id}/mine$`));

    // The title and the big button are what shows — nothing scrolled away.
    const header = page.locator(".lh");
    const big = header.locator(".lh-mine");
    await expect(page.getByRole("heading", { level: 1, name: MINEABLE })).toBeInViewport();
    await expect(big).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(2);

    // Step 0, in place: the button waits with a spinner, the chooser opens under the header.
    const wizard = page.getByRole("region", { name: `Mine ${MINEABLE}` });
    await expect(big).toHaveText(/Waiting for a wallet/);
    await expect(wizard.getByText("You haven't connected a wallet yet.")).toBeVisible();
    await wizard.getByRole("button", { name: "Use the demo wallet" }).click();

    // The demo wallet signs by itself: the miner cell first…
    await expect(wizard.getByRole("link", { name: "Miner cell transaction on mempool.space" })).toBeVisible({ timeout: 30_000 });
    expect(sim.broadcasts).toHaveLength(1);
    await expect(wizard.getByText(/^Your miner cell is landing/)).toBeVisible();
    await block(page, sim);

    // …then the ticket, with no click, and mining starts on it at once.
    await expect(wizard.getByRole("link", { name: "Ticket transaction on mempool.space" })).toBeVisible({ timeout: 30_000 });
    expect(sim.broadcasts).toHaveLength(2);
    const ticket = sim.broadcasts[1];
    expect(ticket.outputs.filter((o) => Number(o.amount) === 9500)).toHaveLength(1);
    expect(ticket.outputs.filter((o) => o.address === PLATFORM_ADDRESS && Number(o.amount) === 500)).toHaveLength(1);
    await expect(wizard.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await expect(big).toHaveText("Pause mining");
    await expect(page.getByText(/^Ticket landing — keep mining/)).toBeVisible();
    await block(page, sim);

    // Step 3: the mint, and its trace with the proof.
    const mint = await mineUntilMintable(page);
    await mint.click();
    await expect(page.getByText(/^Minting /)).toBeVisible();
    await block(page, sim);
    const mintTx = sim.broadcasts.at(-1)!.txid;
    await expect(wizard.getByRole("link", { name: "Mint transaction on mempool.space" })).toHaveAttribute("href", new RegExp(`${mintTx}$`), { timeout: 30_000 });
    await expect(wizard.getByRole("link", { name: "Proof" })).toHaveAttribute("href", `#/proof/${mintTx}`);
    await expect(wizard.getByRole("link", { name: "Ticket transaction on mempool.space" })).toHaveAttribute("href", new RegExp(`${ticket.txid}$`));
    await expect(big).toHaveAccessibleName(`Mine ${MINEABLE} again`);
    ux.note("With the demo wallet the loop is two presses — MINE and Mint — and the page never leaves the token.");
  });

  test("a key of one's own waits for Sign and pay, and says what it pays", async ({ page, app, sim }) => {
    await platformWallet(app, sim);
    await announce(page, { symbol: MINEABLE });
    await block(page, sim);
    await pressMine(page);
    const wizard = page.getByRole("region", { name: `Mine ${MINEABLE}` });

    await page.waitForTimeout(1500);
    expect(sim.broadcasts, "nothing is signed without a click").toHaveLength(0);
    await wizard.getByRole("button", { name: "Open miner cell", exact: true }).click();
    await expect(wizard.getByRole("link", { name: "Miner cell transaction on mempool.space" })).toBeVisible();
    await block(page, sim);

    const pay = wizard.getByRole("button", { name: "Sign and pay", exact: true });
    await expect(pay).toBeVisible({ timeout: 30_000 });
    await expect(wizard.getByText(/To mine you'll pay/)).toBeVisible();
    await expect(wizard.locator(".wz-bill")).toContainText("9,500 sats");
    await expect(wizard.locator(".wz-bill")).toContainText("500 sats");
    await page.waitForTimeout(1500);
    expect(sim.broadcasts).toHaveLength(1);

    // The header hands over to the step that spends rather than spending itself.
    await page.locator(".lh").getByRole("button", { name: "Sign and pay below ↓" }).click();
    await expect(pay).toBeFocused();
    expect(sim.broadcasts).toHaveLength(1);

    await pay.click();
    await expect(wizard.getByRole("link", { name: "Ticket transaction on mempool.space" })).toBeVisible({ timeout: 30_000 });
    await expect(wizard.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    expect(sim.broadcasts).toHaveLength(2);
  });
});
