/* advance: one pass over every launch — ticket, arm, mine and mint as its
 * cells allow, announcing each mint. The dispatcher repeats it for `--loop`. */

import { alice, certificate, cfg, creatingTx, launchCells, network, ops, provider, rgbpp, standard, submit, verify } from "../../kit.mjs";
import { publish } from "../publish.mjs";
import { launchTerms, ROUNDS, state, write } from "../state.mjs";

export async function advance() {
  const tip = await provider.getTipHeight(network.ACTIVE);
  const cells = await rgbpp.cells(alice.address);
  // Funding may chain on change that has not confirmed yet: the queue waits
  // for each operation's own confirmation anyway, and one coin would
  // otherwise allow one operation per block. Seals are never funding: they
  // are the 546-sat outputs, and anything that small is left alone.
  let last = null;
  const funding = async () => {
    // The next operation funds itself from the previous one's change, so wait
    // until the service lists that change rather than racing it.
    for (let i = 0; i < 20; i++) {
      const coins = (await provider.getUtxos(alice.address, network.ACTIVE)).filter((u) => u.value > 2 * ops.SEAL_SATS);
      if (!last || coins.some((u) => u.txid === last)) return coins;
      await new Promise((r) => setTimeout(r, 3_000));
    }
    return (await provider.getUtxos(alice.address, network.ACTIVE)).filter((u) => u.value > 2 * ops.SEAL_SATS);
  };

  for (const commitment of state.launches) {
    const id = commitment.id;
    const pending = state.pending[id];
    if (pending) {
      const s = await rgbpp.status(pending.btcTxid);
      if (s.state === "completed") {
        delete state.pending[id];
        if (pending.step.includes(" mint ")) state.rounds[id] = (state.rounds[id] ?? 0) + 1;
      } else if (s.state === "failed") {
        console.log(`${id}: ${pending.step} failed — ${s.failure}`);
        delete state.pending[id];
      } else {
        continue;
      }
      write();
      // The cells were read before this operation settled; acting on them
      // now would repeat it. The next pass reads them fresh.
      continue;
    }
    if ((state.rounds[id] ?? 0) >= ROUNDS) continue;
    if (tip < commitment.h0) continue;

    const terms = launchTerms(commitment);
    const { miners, tokens } = launchCells(cells, terms);
    const miner = miners[0];
    try {
      if (!miner) {
        const plan = ops.planTicket(cfg, terms, { idle: null, paymaster: await rgbpp.paymaster(), tip });
        state.pending[id] = await submit(`${id} ticket`, plan, alice, await funding());
      } else if (miner.data?.state === "paid") {
        const plan = ops.planArm(cfg, terms, miner, await creatingTx(miner.seal.txid), tip, certificate.admissionBytes(commitment.registration, commitment.certificate));
        state.pending[id] = await submit(`${id} arm`, plan, alice, await funding());
      } else if (miner.data?.state === "idle") {
        const plan = ops.planTicket(cfg, terms, { idle: miner, paymaster: null, tip });
        state.pending[id] = await submit(`${id} ticket`, plan, alice, await funding());
      } else if (miner.data?.state === "armed") {
        // Varied targets make the catalogue look like people mining, and
        // stay under a minute of CPU each.
        const target = 17 + Math.floor(Math.random() * 5);
        const { txid: ctxid, vout: cvout } = ops.challengeOutpoint(miner);
        const challenge = standard.ticketChallenge(ctxid, cvout);
        let best = { clz: -1 };
        for (let nonce = 0n; best.clz < target; nonce++) {
          const found = verify.recompute(challenge, nonce);
          if (found.clz > best.clz) best = found;
        }
        const atoms = standard.reward(best.clz, terms.h0, miner.data.anchor);
        const plan = ops.planMint(cfg, terms, {
          miner,
          held: tokens[0] ?? null,
          nonce: BigInt(best.nonce),
          reward: atoms,
        });
        const step = await submit(`${id} mint ${best.clz} bits`, plan, alice, await funding());
        state.pending[id] = step;
        await publish(alice, { kind: "mint", launch: id, amount: atoms, ref: step.btcTxid, txid: step.btcTxid });
      }
      last = state.pending[id]?.btcTxid ?? last;
      write();
    } catch (err) {
      console.log(`${id}: ${err.message}`);
      if (/confirmed balance|InsufficientFunds/i.test(err.message)) break;
    }
  }
  write();
}
