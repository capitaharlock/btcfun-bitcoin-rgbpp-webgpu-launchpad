/* transfers: send a fifth of each settled balance to the shared demo wallet,
 * announcing each transfer. */

import { alice, cfg, demo, launchCells, ops, rgbpp, submit } from "../../kit.mjs";
import { publish } from "../publish.mjs";
import { launchTerms, state, write } from "../state.mjs";

export async function transfers() {
  const cells = await rgbpp.cells(alice.address);
  for (const commitment of state.launches) {
    if (state.pending[commitment.id]) continue;
    const terms = launchTerms(commitment);
    const { tokens } = launchCells(cells, terms);
    const balance = tokens.reduce((n, t) => n + t.amount, 0n);
    if (balance === 0n) continue;
    const amount = balance / 5n;
    try {
      const plan = ops.planTransfer(cfg, terms, { from: tokens, amount, to: demo.address, paymaster: await rgbpp.paymaster() });
      const step = await submit(`${commitment.id} transfer`, plan, alice);
      state.pending[commitment.id] = step;
      write();
      await publish(alice, { kind: "transfer", launch: commitment.id, amount, ref: step.btcTxid, txid: step.btcTxid });
    } catch (err) {
      console.log(`${commitment.id}: ${err.message}`);
      if (/confirmed balance|InsufficientFunds/i.test(err.message)) break;
    }
  }
}
