/* The public feed: signed announcements and listings, checked on arrival. */

import { secp256k1 } from "@noble/curves/secp256k1";

import { activityDigest, activityId } from "../../src/lib/activity/verify";
import { ACTIVITY_VERSION, type ActivityKind, type SignedActivity } from "../../src/lib/activity/types";
import { bytesToHex } from "../../src/lib/bytes";
import { signDigestWith } from "../../src/lib/signatures";
import { test, expect } from "../support/fixtures";
import { announce, browserKeyOn, secondVisitor } from "../support/flows";
import type { RgbppSim } from "../support/rgbpp";

/** Someone else's signed event, straight into the index: the feed shows other people. */
function publishAs(rgbpp: RgbppSim, kind: ActivityKind, launch: string, amount: bigint, txid: string): void {
  const key = secp256k1.utils.randomPrivateKey();
  const body = {
    v: ACTIVITY_VERSION,
    kind,
    launch,
    actor: bytesToHex(secp256k1.getPublicKey(key, true)),
    amount: amount.toString(),
    sats: 0,
    ref: txid,
    txid,
    at: new Date().toISOString(),
  } as const;
  const signed: SignedActivity = { body, signature: bytesToHex(signDigestWith(key, activityDigest(body))) };
  rgbpp.events.push({ id: activityId(body), signed, receivedAt: Math.floor(Date.now() / 1000), authentic: true });
}

test.describe("activity", () => {
  test("an announcement reaches another browser through the index", async ({ page, app, sim, rgbpp, browser, ux }) => {
    await app.createBrowserKey();
    await announce(page, { symbol: "NEWS" });
    expect(rgbpp.events.filter((e) => e.signed.body.kind === "launch")).toHaveLength(1);

    const other = await secondVisitor(browser, sim, rgbpp);
    await browserKeyOn(other);
    await other.goto("/#/");
    await expect(other.locator(".tokencard").filter({ hasText: "NEWS" }).first()).toBeVisible({ timeout: 60_000 });
    await other.goto("/#/activity");
    await expect(other.getByText("NEWS").first()).toBeVisible();
    await other.context().close();
    ux.note("A launch announced in one browser appears in another's catalogue after the index poll.");
  });

  test("an announcement whose terms were altered in the index is dropped", async ({ page, app, sim, rgbpp, browser }) => {
    await app.createBrowserKey();
    await announce(page, { symbol: "EDIT" });
    const event = rgbpp.events.find((e) => e.signed.body.kind === "launch")!;
    const meta = JSON.parse(event.signed.body.meta!);
    event.signed.body.meta = JSON.stringify({ ...meta, h0: meta.h0 - 100 });

    const other = await secondVisitor(browser, sim, rgbpp);
    await other.goto("/#/");
    await expect(other.getByText("No launches have been announced yet.")).toBeVisible({ timeout: 60_000 });
    await other.context().close();
  });

  test("mints and transfers link to their Bitcoin transactions, and a mint to its proof", async ({ page, app, rgbpp }) => {
    await app.createBrowserKey();
    const launch = await announce(page, { symbol: "LINK" });
    const mintTx = "a1".repeat(32);
    const sendTx = "b2".repeat(32);
    publishAs(rgbpp, "mint", launch, 1_250_000_000n, mintTx);
    publishAs(rgbpp, "transfer", launch, 300_000_000n, sendTx);

    await app.goto("/activity");
    const mint = page.locator(".feedrow").filter({ hasText: "mined" });
    await expect(mint).toContainText("12.5 LINK");
    await expect(mint.getByRole("link", { name: /Bitcoin transaction a1a1a1…a1a1/ })).toHaveAttribute("href", `https://mempool.space/testnet/tx/${mintTx}`);
    await expect(mint.getByRole("link", { name: "proof" })).toHaveAttribute("href", `#/proof/${mintTx}`);

    const sent = page.locator(".feedrow").filter({ hasText: "3 LINK" });
    await expect(sent.getByRole("link", { name: /Bitcoin transaction b2b2b2…b2b2/ })).toHaveAttribute("href", `https://mempool.space/testnet/tx/${sendTx}`);
    await expect(sent.getByRole("link", { name: "proof" })).toHaveCount(0);
    // Linked, not proven: the row still makes no claim beyond its signature.
    await expect(mint.getByText("signature failed")).toHaveCount(0);

    await mint.getByRole("link", { name: "proof" }).click();
    await expect(page).toHaveURL(new RegExp(`#/proof/${mintTx}$`));
  });
});
