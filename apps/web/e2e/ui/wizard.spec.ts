/* The mining wizard on a launch page, on desktop and on a phone.
 *
 * MINE turns the header into the wizard: the token's name stays in a strip at
 * the top, the steps — wallet, ticket, mine, mint — slide across one frame, and
 * every action is pressed in the bar under it. Nothing is signed without that
 * press, whatever the wallet; a passkey wallet asks for the passkey on it. A
 * wallet that cannot pay for the whole round signs nothing and is told how
 * much is missing.
 */

import { test, expect } from "../support/fixtures";
import { announce, bar, block, MINEABLE, mineUntilMintable, mintedShown, pressMine, showStep } from "../support/flows";
import { PLATFORM_SECRET } from "../support/platform";
import { PAYMASTER_ADDRESS, PLATFORM_ADDRESS } from "../support/rgbpp";

test.describe.configure({ timeout: 240_000 });

/** The shared demo wallet's address (`lib/bitcoin/vault.ts`). */
const DEMO_ADDRESS = "tb1qjjq482m9pj7dvge0l2r07a3fcyflktrzgzf6tz";

// The standard's split, restated as the page must show it (PROTOCOL.md §4).
const NEW_CELL = { promoter: 7_105, platform: 878, paymaster: 7_000 };

test.describe("mining wizard", () => {
  test("with the demo wallet: every transaction waits for its press, and a first round pays once", async ({ page, app, sim, ux }) => {
    await app.restoreKey(PLATFORM_SECRET);
    const id = await announce(page, { symbol: MINEABLE, image: "/tokens/demo.svg" });
    await app.logOut();
    sim.fund(DEMO_ADDRESS, 200_000);
    await block(page, sim);

    await app.goto("/");
    await page.locator(".tokencard").filter({ hasText: MINEABLE }).first().getByRole("link", { name: `Mine ${MINEABLE}` }).click();
    await expect(page).toHaveURL(new RegExp(`#/launch/${id}/mine$`));
    const wizard = page.locator(".lh").getByRole("region", { name: `Mine ${MINEABLE}` });

    // Step 0, in place; the wizard slides on to the ticket by itself.
    await wizard.getByRole("button", { name: "Use the demo wallet" }).click();

    // Step 1: the bill, then one press. The demo wallet signs nothing before it.
    const sign = bar(page).getByRole("button", { name: "Sign ticket", exact: true });
    await expect(sign).toBeEnabled({ timeout: 30_000 });
    const bill = wizard.locator(".wz-bill");
    await expect(bill).toContainText("7,105 sats");
    await expect(bill).toContainText("878 sats");
    await expect(bill).toContainText("7,000 sats");
    await expect(bill).toContainText("14,983 sats");
    await expect(bill).toContainText("3 sat/vB");
    await expect(wizard.getByText(/^Then arming and the mint cost ≈ [0-9,]+ sats of network fee\.$/)).toBeVisible();
    if (test.info().project.name === "ui") {
      // A laptop screen holds the whole step and its bar.
      await expect(bar(page)).toBeInViewport({ ratio: 1 });
    }
    await page.waitForTimeout(1500);
    expect(sim.broadcasts, "nothing is signed without the press").toHaveLength(0);
    await sign.click();

    await expect(wizard.getByRole("link", { name: "Ticket transaction on mempool.space" })).toBeVisible({ timeout: 30_000 });
    expect(sim.broadcasts).toHaveLength(1);
    const ticket = sim.broadcasts[0];
    expect(ticket.outputs.filter((o) => Number(o.amount) === NEW_CELL.promoter)).toHaveLength(1);
    expect(ticket.outputs.filter((o) => o.address === PLATFORM_ADDRESS && Number(o.amount) === NEW_CELL.platform)).toHaveLength(1);
    expect(ticket.outputs.filter((o) => o.address === PAYMASTER_ADDRESS && Number(o.amount) === NEW_CELL.paymaster)).toHaveLength(1);
    await expect(bar(page).getByRole("button", { name: "Waiting for a block" })).toBeVisible();
    await block(page, sim);

    // Arming the new cell: a second press, network fee only.
    const arm = bar(page).getByRole("button", { name: "Arm ticket", exact: true });
    await expect(arm).toBeEnabled({ timeout: 30_000 });
    await page.waitForTimeout(1000);
    expect(sim.broadcasts).toHaveLength(1);
    await arm.click();
    await expect(wizard.getByRole("link", { name: "Arming transaction on mempool.space" })).toBeVisible({ timeout: 30_000 });
    const arming = sim.broadcasts[1];
    expect(arming.outputs.some((o) => o.address === PLATFORM_ADDRESS || o.address === PAYMASTER_ADDRESS)).toBe(false);

    // Step 2: mining starts when the person says so, on the arming still in the mempool.
    await bar(page).getByRole("button", { name: "Mine →" }).click();
    await expect(bar(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    if (test.info().project.name === "ui") await expect(bar(page)).toBeInViewport({ ratio: 1 });
    const accept = await mineUntilMintable(page);
    await accept.click();

    // Step 3: the arming has not settled, so the mint waits — and still signs nothing by itself.
    await expect(bar(page).getByRole("button", { name: "Waiting for the ticket" })).toBeVisible();
    const minted = await mintedShown(page);
    await block(page, sim);
    const signMint = bar(page).getByRole("button", { name: "Sign mint", exact: true });
    await expect(signMint).toBeEnabled({ timeout: 30_000 });
    await page.waitForTimeout(1000);
    expect(sim.broadcasts).toHaveLength(2);
    await signMint.click();
    await expect(page.getByText(/ minted — landing\.$/)).toBeVisible({ timeout: 30_000 });
    const mint = sim.broadcasts[2];
    expect(mint.outputs.some((o) => o.address === PLATFORM_ADDRESS || o.address === PAYMASTER_ADDRESS)).toBe(false);

    // The tokens show as landing in the wallet before their block.
    await expect(page.getByText(`you hold · +${minted} landing`)).toBeVisible();
    await block(page, sim);
    await expect(wizard.getByRole("link", { name: "Mint transaction on mempool.space" })).toHaveAttribute("href", new RegExp(`${mint.txid}$`), { timeout: 30_000 });
    await expect(wizard.getByRole("link", { name: "Proof" })).toHaveAttribute("href", `#/proof/${mint.txid}`);
    await expect(bar(page).getByRole("button", { name: "Mine again", exact: true })).toBeVisible();
    await showStep(page, "Ticket");
    await expect(wizard.getByRole("link", { name: "Ticket transaction on mempool.space" })).toHaveAttribute("href", new RegExp(`${ticket.txid}$`));
    ux.note("A first round is three presses that sign — ticket, arming, mint — and one payment; the mint pays only the network.");
  });

  test("with a passkey: each signing press asks for the passkey", async ({ page, app, sim }) => {
    await app.restoreKey(PLATFORM_SECRET);
    await announce(page, { symbol: MINEABLE });
    await app.logOut();
    await block(page, sim);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
        hasPrf: true,
      },
    });
    let asked = 0;
    cdp.on("WebAuthn.credentialAsserted", () => asked++);

    await app.goto("/");
    await page.locator(".tokencard").filter({ hasText: MINEABLE }).first().getByRole("link", { name: `Mine ${MINEABLE}` }).click();
    const wizard = page.getByRole("region", { name: `Mine ${MINEABLE}` });
    await wizard.getByRole("button", { name: "Connect with a passkey" }).click();
    const address = (await page.locator(".wz-trace a.mono").first().getAttribute("href"))!.split("/").pop()!;
    expect(address).toMatch(/^tb1q/);
    sim.fund(address, 200_000);
    await block(page, sim);
    await pressMine(page);
    await showStep(page, "Ticket");

    const sign = bar(page).getByRole("button", { name: "Sign ticket", exact: true });
    await expect(sign).toBeEnabled({ timeout: 30_000 });
    const before = asked;
    await page.waitForTimeout(1000);
    expect(sim.broadcasts).toHaveLength(0);
    await sign.click();
    await expect(page.getByRole("link", { name: "Ticket transaction on mempool.space" })).toBeVisible({ timeout: 30_000 });
    expect(asked, "the press opened the passkey").toBe(before + 1);
    expect(sim.broadcasts).toHaveLength(1);
  });

  test("a wallet that cannot pay for the whole round signs nothing, says what is missing, and unlocks when coins arrive", async ({ page, app, sim }) => {
    await app.restoreKey(PLATFORM_SECRET);
    await announce(page, { symbol: MINEABLE });
    await app.logOut();
    const wallet = await app.createBrowserKey();
    // Enough for the ticket alone, not for the fees the round still has.
    sim.fund(wallet.address, 16_000);
    await block(page, sim);
    await app.goto("/");
    await page.locator(".tokencard").filter({ hasText: MINEABLE }).first().getByRole("link", { name: `Mine ${MINEABLE}` }).click();
    await showStep(page, "Ticket");

    await expect(page.getByText(/^[0-9,]+ sats missing\./)).toBeVisible({ timeout: 30_000 });
    await expect(bar(page).getByRole("button", { name: "Sign ticket", exact: true })).toBeDisabled();
    await expect(page.locator(".wz-fund .wz-spin")).toBeVisible();
    await expect(page.locator(".wz-fund")).toContainText("checking the address every 10 seconds");
    expect(sim.broadcasts).toHaveLength(0);

    // The address is re-read every 10 s: confirmed coins unlock the step without a reload.
    sim.fund(wallet.address, 50_000);
    sim.advance(1);
    await expect(bar(page).getByRole("button", { name: "Sign ticket", exact: true })).toBeEnabled({ timeout: 25_000 });
    await expect(page.getByText(/sats missing\./)).toHaveCount(0);
  });
});
