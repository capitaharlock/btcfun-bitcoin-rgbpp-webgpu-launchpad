/* history: publish the live run's launch (`rgbpp:live`) with the mint,
 * transfer and sale it completed, so the index shows the first real round. */

import { activity, alice, bob, launches, network, stateFile, vaultOf } from "../../kit.mjs";
import { publish } from "../publish.mjs";

export async function history() {
  const live = stateFile("rgbpp-live", null).state;
  if (!live?.launch) throw new Error("no live run to publish");
  const t = live.launch;
  const commitment = {
    v: "btcfun/launch/2",
    symbol: t.meta.symbol,
    name: t.meta.name,
    blurb: t.meta.description,
    imageHash: t.meta.imageHash,
    h0: t.terms.h0,
    promoter: bob.address,
    accent: "var(--magenta)",
    tokenId: t.tokenId,
    creator: vaultOf(bob).identity,
    at: live.steps[0]?.at ?? new Date().toISOString(),
  };
  commitment.id = launches.launchIdFor(commitment.symbol, commitment.tokenId);
  if (!launches.idMatches(commitment, network.ACTIVE)) throw new Error("the live launch does not reproduce its token id");
  await publish(bob, { kind: "launch", launch: commitment.id, ref: launches.commitmentId(commitment), meta: JSON.stringify(commitment) });
  const done = (name) => live.steps.find((s) => s.step === name && s.queue === "completed" || s.step === name && s.ckbTxHash);
  const mint = done("mint");
  if (mint) await publish(alice, { kind: "mint", launch: commitment.id, amount: BigInt(live.mined.atoms), ref: mint.btcTxid, txid: mint.btcTxid });
  const transfer = done("transfer");
  if (transfer) await publish(alice, { kind: "transfer", launch: commitment.id, amount: BigInt(live.mined.atoms) / 4n, ref: transfer.btcTxid, txid: transfer.btcTxid });
  const buy = done("buy");
  if (buy && live.listing) {
    const offerRef = activity.payloadRef(JSON.stringify(live.listing));
    await publish(alice, { kind: "fill", launch: commitment.id, amount: BigInt(live.listing.amount), sats: live.listing.priceSats, ref: offerRef, txid: buy.btcTxid });
  }
  console.log(`published ${commitment.id} with its history`);
}
