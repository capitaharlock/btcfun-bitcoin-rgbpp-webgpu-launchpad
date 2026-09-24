/* status: where every launch stands. Reads only — nothing is signed or sent. */

import { alice, launchCells, network, provider, rgbpp } from "../../kit.mjs";
import { launchTerms, ROUNDS, state } from "../state.mjs";

export async function status() {
  const tip = await provider.getTipHeight(network.ACTIVE);
  const cells = await rgbpp.cells(alice.address);
  for (const c of state.launches) {
    const { miners, tokens } = launchCells(cells, launchTerms(c));
    const balance = tokens.reduce((n, t) => n + t.amount, 0n);
    console.log(
      `${c.id.padEnd(24)} opens ${c.h0}${tip < c.h0 ? " (not yet)" : ""}  miner ${miners[0]?.data?.state ?? "none"}  ` +
        `rounds ${state.rounds[c.id] ?? 0}/${ROUNDS}  balance ${balance}  ${state.pending[c.id] ? `pending ${state.pending[c.id].step}` : ""}`,
    );
  }
  const free = (await rgbpp.freeUtxos(alice.address)).filter((u) => u.confirmed).reduce((n, u) => n + u.value, 0);
  console.log(`tip ${tip}; Alice has ${free} confirmed sats free`);
}
