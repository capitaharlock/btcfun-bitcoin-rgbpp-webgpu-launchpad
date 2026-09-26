/* The mint script's rules, checked on every transaction the simulated queue
 * commits, per launch present in it.
 *
 * Restated from `contracts/`, not imported from the app (see `oracle.ts`): an
 * unpaid ticket, an anchor outside its bounds, a paid cell created beside an
 * RGB++ input or moved, a mint with too little work or the wrong amount, a
 * mint that re-arms, a balance that grows without a mint — each is refused
 * here as the chain would refuse it.
 */

import { ccc } from "@ckb-ccc/core";
import { TEST_CERT_KEY, admitted } from "../../../src/domain/launches/certificate";

import { reverse, sha256 } from "../bytes";
import type { ChainSim } from "../chain";
import { CONFIG, type LiveCell } from "./constants";
import { amountOf, clzOf, GRACE, minerData, NEW_CELL, outputsOf, OWNER_BY_INPUT_TYPE, PLATFORM_SCRIPT, REUSE, sealOf, standardReward } from "./oracle";

/** Throws with the script's reason when the transaction breaks a mint rule; `tip` is the Bitcoin tip anchors are checked against. */
export function checkMintRules(
  inputs: LiveCell[],
  outputs: ccc.CellOutput[],
  data: ccc.Hex[],
  witnesses: ccc.Hex[],
  btc: ChainSim["broadcasts"][number],
  tip: number,
): void {
  const isMint = (t?: ccc.Script) => !!t && t.codeHash === CONFIG.mint.codeHash && t.hashType === CONFIG.mint.hashType;
  const launches = new Map<string, ccc.Script>();
  for (const c of inputs) if (isMint(c.output.type)) launches.set(c.output.type!.hash(), c.output.type!);
  outputs.forEach((o) => isMint(o.type) && launches.set(o.type!.hash(), o.type!));
  const btcfun = witnesses[inputs.length] ?? null;
  const rgbppInput = inputs.some((c) => sealOf(c.output.lock) !== null);

  // Each arming: whose promoter, at which price, paid by which transaction's outputs.
  const armings: Array<{ promoter: string; price: typeof REUSE; paidBy: Array<{ script: string; amount: number }> }> = [];
  const armingOutputs = btc.outputs.map((o) => ({ script: o.script, amount: Number(o.amount) }));

  for (const [hash, type] of launches) {
    const args = ccc.bytesFrom(type.args);
    const h0 = Number(ccc.numLeFromBytes(args.slice(1, 5)));
    const promoter = ccc.hexFrom(args.slice(38)).slice(2);
    const before = inputs.filter((c) => c.output.type?.hash() === hash);
    const afterIdx = outputs.map((o, i) => (o.type?.hash() === hash ? i : -1)).filter((i) => i >= 0);
    if (before.length > 1 || afterIdx.length > 1) throw new Error("two miner cells of one launch");
    const was = before[0] ? minerData(before[0].data) : null;
    const now = afterIdx.length ? minerData(data[afterIdx[0]]) : null;
    if (afterIdx.length && sealOf(outputs[afterIdx[0]].lock) === null) throw new Error("miner cell not bound to Bitcoin");

    const token = ccc.Script.from({ ...CONFIG.xudt, args: ccc.bytesConcat(ccc.bytesFrom(hash), ccc.numLeToBytes(OWNER_BY_INPUT_TYPE, 4)) });
    const sum = (cells: Array<{ type?: ccc.Script; data: ccc.Hex }>) =>
      cells.filter((c) => c.type?.eq(token)).reduce((n, c) => n + amountOf(c.data), 0n);
    const minted = sum(outputs.map((o, i) => ({ type: o.type, data: data[i] }))) - sum(inputs.map((c) => ({ type: c.output.type, data: c.data })));

    if (!was && now?.state === "armed") throw new Error("armed without a ticket");
    if (!was && now?.state === "idle") throw new Error("nobody opens an idle cell");
    if (!was && now?.state === "paid" && rgbppInput) throw new Error("a paid cell beside an RGB++ input");
    if (was?.state === "paid" && now && now.state !== "armed") throw new Error("a paid cell cannot move");
    if (was && was.state !== "paid" && now?.state === "paid") throw new Error("nothing becomes paid");
    if (was?.state === "armed" && now?.state === "armed") throw new Error("a mint must disarm");

    if (was && now?.state === "armed") {
      if (now.anchor < h0 || now.anchor > tip || tip - now.anchor > GRACE) throw new Error("bad anchor");
      if (was.state === "idle") {
        if (now.ticket !== null) throw new Error("a re-armed cell names no ticket");
        armings.push({ promoter, price: REUSE, paidBy: armingOutputs });
      } else {
        // Armed from paid: the admission, then the creating ticket, ride in the btc.fun witness.
        const seal = sealOf(before[0].output.lock)!;
        if (seal.vout !== 1 || !btcfun) throw new Error("no creating ticket");
        const witness = ccc.bytesFrom(btcfun);
        const registration = Buffer.from(witness.slice(0, 32)).reverse().toString("hex");
        const certificate = Buffer.from(witness.slice(32, 96)).toString("hex");
        const args = ccc.bytesFrom(before[0].output.type!.args);
        if (!admitted(args, registration, certificate, TEST_CERT_KEY)) throw new Error("not certified");
        const creating = witness.slice(96);
        if (reverse(ccc.hexFrom(sha256(sha256(creating))).slice(2)) !== seal.txid) throw new Error("not the creating ticket");
        if (now.ticket !== seal.txid) throw new Error("an armed paid cell names its ticket");
        if (inputs.some((c) => { const m = minerData(c.data); return m !== null && m.state !== "paid"; })) {
          throw new Error("a paid cell is armed alone");
        }
        armings.push({ promoter, price: NEW_CELL, paidBy: outputsOf(creating) });
      }
    }

    const mints = was?.state === "armed" && (now ? now.state === "idle" : minted !== 0n);
    if (mints) {
      const nonce = now ? now.nonce : btcfun && ccc.bytesFrom(btcfun).length === 8 ? ccc.numLeFromBytes(ccc.bytesFrom(btcfun)) : null;
      if (nonce === null) throw new Error("a dissolving mint without its nonce");
      const sealed = sealOf(before[0].output.lock)!;
      const seal = was!.ticket ? { txid: was!.ticket, vout: 1 } : sealed;
      const challenge = sha256(Buffer.concat([Buffer.from(reverse(seal.txid), "hex"), Buffer.from(ccc.numLeToBytes(seal.vout, 4))]));
      const preimage = Buffer.concat([challenge, Buffer.from(ccc.numLeToBytes(nonce, 8))]);
      const clz = clzOf(sha256(sha256(preimage)));
      const expected = standardReward(clz, h0, was!.anchor);
      if (expected === null) throw new Error("work too weak");
      if (minted !== expected) throw new Error(`wrong amount: ${minted} minted, ${expected} allowed`);
    } else if (minted > 0n) {
      throw new Error("balance increased without a mint");
    }
  }

  // Every arming pays its ticket, counted per paying transaction: a payment
  // is never counted for two cells.
  const bySource = new Map<Array<{ script: string; amount: number }>, typeof armings>();
  for (const a of armings) bySource.set(a.paidBy, [...(bySource.get(a.paidBy) ?? []), a]);
  for (const [paidBy, group] of bySource) {
    const paidTo = (script: string) => paidBy.filter((o) => o.script === script).reduce((n, o) => n + o.amount, 0);
    const owed = new Map<string, number>();
    for (const a of group) {
      owed.set(a.promoter, (owed.get(a.promoter) ?? 0) + a.price.promoter);
      owed.set(PLATFORM_SCRIPT, (owed.get(PLATFORM_SCRIPT) ?? 0) + a.price.platform);
    }
    for (const [script, due] of owed) if (paidTo(script) < due) throw new Error(script === PLATFORM_SCRIPT ? "platform fee unpaid" : "ticket unpaid");
  }
}
