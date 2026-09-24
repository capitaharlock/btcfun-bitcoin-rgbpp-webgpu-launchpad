/* market: Alice lists token cells and Bob bids, both signed and published;
 * nothing is spent until a buyer or seller completes a trade. */

import { activity, alice, bid, bob, cellsOf, sale, sealedUtxos, standard } from "../../kit.mjs";
import { publish } from "../publish.mjs";
import { launchTerms, state } from "../state.mjs";

export async function market() {
  const prices = [18_000, 24_000, 31_000, 45_000];
  let listed = 0;
  for (const commitment of state.launches) {
    const terms = launchTerms(commitment);
    const { tokens } = await cellsOf(alice.address, terms);
    const cell = tokens[0];
    if (!cell || listed >= prices.length) continue;
    const [utxo] = await sealedUtxos(alice.address, [cell.seal]);
    const listing = sale.signListing(alice, { launchId: commitment.id, tokenId: commitment.tokenId }, cell, utxo.value, prices[listed]);
    const meta = JSON.stringify(listing);
    await publish(alice, { kind: "offer", launch: commitment.id, amount: cell.amount, sats: listing.priceSats, ref: activity.payloadRef(meta), meta });
    console.log(`${commitment.id}: listed ${cell.amount} atoms for ${listing.priceSats} sats`);
    listed++;
  }
  for (const [i, commitment] of state.launches.entries()) {
    if (i % 2 === 1) continue;
    const amount = BigInt(100 + i * 25) * standard.UNIT;
    const b = bid.composeBid({ launchId: commitment.id, tokenId: commitment.tokenId, amount, priceSats: 6_000 + i * 1_500 }, bob.address);
    await publish(bob, bid.bidDraft(b));
    console.log(`${commitment.id}: bid ${amount} atoms for ${b.priceSats} sats`);
  }
}
