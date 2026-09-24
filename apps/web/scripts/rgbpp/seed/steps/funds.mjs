/* fund and gather: plain Bitcoin payments between the test wallets.
 *
 * Alice pays for the runs; `gather` sweeps Bob's free coins back to her and
 * `fund` tops up the shared demo wallet. Seals are never moved: only coins
 * well above the 546-sat seal value are spent.
 */

import { alice, bob, demo, network, ops, payment, provider } from "../../kit.mjs";

export async function fund() {
  const amountSats = Number(process.env.FUND ?? 60_000);
  const coins = (await provider.getUtxos(alice.address, network.ACTIVE)).filter((u) => u.value > 2 * ops.SEAL_SATS);
  const feeRate = Math.max(await provider.getFeeRate(network.ACTIVE), 1);
  const signed = payment.buildPayment(alice, { to: demo.address, amountSats, feeRate, utxos: coins }, network.ACTIVE);
  const txid = await provider.broadcast(signed.hex, network.ACTIVE);
  console.log(`funded the demo wallet with ${amountSats} sats: ${network.txUrl(txid, network.ACTIVE)}`);
}

export async function gather() {
  // Seals are never swept: only coins well above the 546-sat seal value.
  const coins = (await provider.getUtxos(bob.address, network.ACTIVE)).filter((u) => u.value > 2 * ops.SEAL_SATS);
  const total = coins.reduce((n, u) => n + u.value, 0);
  if (total === 0) return console.log("Bob has nothing to move");
  const feeRate = Math.max(await provider.getFeeRate(network.ACTIVE), 1);
  // The builder adds change when it clears dust and otherwise leaves the
  // remainder to the fee; asking for everything but a two-output fee fits both.
  const fee = Math.ceil(payment.estimateVsize(coins.length, [payment.P2WPKH_SCRIPT_BYTES, payment.P2WPKH_SCRIPT_BYTES]) * feeRate) + 1;
  const signed = payment.buildPayment(bob, { to: alice.address, amountSats: total - fee, feeRate, utxos: coins }, network.ACTIVE);
  const txid = await provider.broadcast(signed.hex, network.ACTIVE);
  console.log(`moved ${total - fee} sats from Bob to Alice: ${network.txUrl(txid, network.ACTIVE)}`);
}
