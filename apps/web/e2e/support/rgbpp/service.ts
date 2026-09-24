/* The RGB++ service and its queue, simulated.
 *
 * It answers the endpoints the app calls on the public service, and completes
 * queued operations the way the real queue does: once the Bitcoin transaction
 * has a block, it writes the real txid into the sealed outputs, adds a
 * paymaster cell when asked, and commits the CKB transaction — refusing a
 * Bitcoin transaction whose OP_RETURN does not commit to the CKB side or that
 * does not spend the seals of the cells it moves, inputs that are not live,
 * outputs worth more than the inputs, and anything the mint script refuses.
 *
 * Like the real queue it replaces only the placeholder witnesses of sealed
 * inputs and keeps the btc.fun witness past them as the client wrote it.
 */

import type { Route } from "@playwright/test";
import { ccc } from "@ckb-ccc/core";
import { Transaction } from "@scure/btc-signer";

import type { ChainSim } from "../chain";
import { PAYMASTER_ADDRESS, PAYMASTER_CELL, PAYMASTER_FEE, SECP256K1_DEP_GROUP, type Job, type LiveCell } from "./constants";
import type { RgbppSim } from "./index";
import { checkMintRules } from "./mint-rules";
import { sealOf, withSeal } from "./oracle";

export async function answerService(sim: RgbppSim, route: Route): Promise<void> {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  const body = () => JSON.parse(request.postData() ?? "{}");

  if (path === "/token/generate") return route.fulfill({ json: { id: "sim", token: "sim-token" } });
  if (path === "/rgbpp/v1/paymaster/info") {
    return route.fulfill({ json: { btc_address: PAYMASTER_ADDRESS, ckb_address: "ckt1sim", fee: PAYMASTER_FEE } });
  }
  const unspent = /^\/bitcoin\/v1\/address\/([a-z0-9]+)\/unspent$/.exec(path);
  if (unspent) {
    // Like the real service: seals of settled cells, and of queued jobs.
    const sealed = new Set([...sim.cells.values()].filter((c) => c.live).map((c) => sealOf(c.output.lock)).filter(Boolean).map((s) => `${s!.txid}:${s!.vout}`));
    for (const job of sim.jobs.values()) {
      if (job.state !== "waiting") continue;
      for (const o of job.virtual.ckbRawTx.outputs) {
        const seal = sealOf(ccc.Script.from(o.lock as ccc.ScriptLike));
        if (seal) sealed.add(`${job.btcTxid}:${seal.vout}`);
      }
    }
    const utxos = (sim.chain.utxos.get(unspent[1]) ?? [])
      .filter((u) => url.searchParams.get("only_non_rgbpp_utxos") !== "true" || !sealed.has(`${u.txid}:${u.vout}`))
      .map((u) => ({ txid: u.txid, vout: u.vout, value: u.value, status: { confirmed: u.confirmed } }));
    return route.fulfill({ json: utxos });
  }
  const assets = /^\/rgbpp\/v1\/address\/([a-z0-9]+)\/assets$/.exec(path);
  if (assets) {
    const mine = new Set((sim.chain.utxos.get(assets[1]) ?? []).map((u) => `${u.txid}:${u.vout}`));
    const cells = [...sim.cells.values()].filter((c) => {
      const seal = c.live ? sealOf(c.output.lock) : null;
      return seal && mine.has(`${seal.txid}:${seal.vout}`);
    });
    return route.fulfill({ json: cells.map((c) => asServiceCell(c)) });
  }
  if (path === "/bitcoin/v1/transaction" && request.method() === "POST") {
    const result = sim.chain.accept(body().txhex);
    return "error" in result
      ? route.fulfill({ status: 400, json: { message: result.error } })
      : route.fulfill({ json: { txid: result.txid } });
  }
  if (path === "/rgbpp/v1/transaction/ckb-tx" && request.method() === "POST") {
    const { btc_txid, ckb_virtual_result } = body();
    sim.jobs.set(btc_txid, { btcTxid: btc_txid, virtual: ckb_virtual_result, state: "waiting", ckbTxHash: null, failure: null });
    return route.fulfill({ json: { state: "waiting" } });
  }
  const job = /^\/rgbpp\/v1\/transaction\/([0-9a-f]{64})\/job$/.exec(path);
  if (job) {
    const found = sim.jobs.get(job[1]);
    return found
      ? route.fulfill({ json: { state: found.state, ...(found.failure ? { failedReason: found.failure } : {}) } })
      : route.fulfill({ status: 404, json: { message: "not found" } });
  }
  const done = /^\/rgbpp\/v1\/transaction\/([0-9a-f]{64})$/.exec(path);
  if (done) {
    const found = sim.jobs.get(done[1]);
    return found?.ckbTxHash
      ? route.fulfill({ json: { txhash: found.ckbTxHash } })
      : route.fulfill({ status: 404, json: { message: "not found" } });
  }
  sim.unexpected.push(`service ${request.method()} ${path}`);
  return route.fulfill({ status: 501, body: `rgbpp simulator: no handler for ${path}` });
}

function asServiceCell(c: LiveCell) {
  const script = (s: ccc.Script) => ({ codeHash: s.codeHash, hashType: s.hashType, args: s.args });
  return {
    outPoint: { txHash: c.outPoint.txHash, index: ccc.numToHex(c.outPoint.index) },
    cellOutput: {
      capacity: ccc.numToHex(c.output.capacity),
      lock: script(c.output.lock),
      ...(c.output.type ? { type: script(c.output.type) } : {}),
    },
    data: c.data,
    ...(c.output.type ? { typeHash: c.output.type.hash() } : {}),
  };
}

/** Complete every waiting job whose Bitcoin transaction now has a block. */
export function settle(sim: RgbppSim): void {
  if (sim.stalled) return;
  for (const job of sim.jobs.values()) {
    if (job.state !== "waiting") continue;
    const btc = sim.chain.broadcasts.find((b) => b.txid === job.btcTxid);
    if (!btc?.confirmed) continue;
    try {
      job.ckbTxHash = commit(sim, job, btc);
      job.state = "completed";
    } catch (err) {
      job.state = "failed";
      job.failure = err instanceof Error ? err.message : String(err);
    }
  }
}

function commit(sim: RgbppSim, job: Job, btc: ChainSim["broadcasts"][number]): string {
  const raw = job.virtual.ckbRawTx;
  const opReturn = btc.outputs.find((o) => o.script.startsWith("6a"));
  if (!opReturn || opReturn.script !== `6a20${job.virtual.commitment}`) throw new Error("commitment mismatch");

  const inputs = raw.inputs.map((i) => {
    const key = `${i.previousOutput.txHash}:${Number(i.previousOutput.index)}`;
    const cell = sim.cells.get(key);
    if (!cell || !cell.live) throw new Error(`input ${key} is not live`);
    return cell;
  });
  // Every sealed input's Bitcoin output must be spent by this transaction.
  const btcTx = Transaction.fromRaw(ccc.bytesFrom(btc.hex), { allowUnknownOutputs: true });
  const spends = new Set<string>();
  for (let i = 0; i < btcTx.inputsLength; i++) {
    const input = btcTx.getInput(i);
    spends.add(`${ccc.hexFrom(input.txid!).slice(2)}:${input.index}`);
  }
  for (const cell of inputs) {
    const seal = sealOf(cell.output.lock);
    if (seal && !spends.has(`${seal.txid}:${seal.vout}`)) throw new Error("a sealed input's UTXO is not spent");
  }

  const outputs = raw.outputs.map((o) =>
    ccc.CellOutput.from({
      capacity: BigInt(o.capacity),
      lock: withSeal(ccc.Script.from(o.lock as ccc.ScriptLike), job.btcTxid),
      type: o.type ? ccc.Script.from(o.type as ccc.ScriptLike) : undefined,
    }),
  );
  const outputsData = raw.outputsData.map((d) => ccc.hexFrom(d));
  outputs.forEach((o, i) => {
    if (o.capacity < ccc.fixedPointFrom(o.occupiedSize + ccc.bytesFrom(outputsData[i]).length)) {
      throw new Error(`output ${i} holds less capacity than it occupies`);
    }
  });
  const inCapacity = inputs.reduce((n, c) => n + c.output.capacity, 0n) + (job.virtual.needPaymasterCell ? PAYMASTER_CELL : 0n);
  const outCapacity = outputs.reduce((n, o) => n + o.capacity, 0n);
  if (outCapacity > inCapacity) throw new Error("outputs exceed inputs");
  if (job.virtual.needPaymasterCell && !btc.outputs.some((o) => o.address === PAYMASTER_ADDRESS && Number(o.amount) >= PAYMASTER_FEE)) {
    throw new Error("Paymaster receives UTXO not found");
  }
  // CKB fails a transaction whose paymaster input's secp256k1 lock has no dep.
  if (job.virtual.needPaymasterCell && !raw.cellDeps.some((d) => d.outPoint.txHash === SECP256K1_DEP_GROUP && d.depType === "depGroup")) {
    throw new Error("TransactionFailedToVerify: Inputs[0].Lock ScriptNotFound (secp256k1)");
  }

  // The queue fills each sealed input's placeholder with its RGB++ unlock and
  // leaves every other witness as written.
  const witnesses = raw.witnesses.map((w) => (w === "0xFF" ? "0x" : ccc.hexFrom(w)));
  checkMintRules(inputs, outputs, outputsData, witnesses, btc, sim.chain.tip);

  const tx = ccc.Transaction.from({
    inputs: raw.inputs.map((i) => ({ previousOutput: { txHash: i.previousOutput.txHash, index: Number(i.previousOutput.index) } })),
    outputs,
    outputsData,
    witnesses,
  });
  const hash = tx.hash();
  for (const cell of inputs) cell.live = false;
  sim.blockNumber++;
  outputs.forEach((output, index) => {
    sim.cells.set(`${hash}:${index}`, { outPoint: { txHash: hash, index }, output, data: outputsData[index], live: true, blockNumber: sim.blockNumber });
  });
  sim.transactions.set(hash, tx);
  return hash;
}
