/* A simulated RGB++ service, CKB node and activity index, for the
 * deterministic project.
 *
 * It completes RGB++ operations the way the real queue does — once the Bitcoin
 * transaction has a block, it writes the real txid into the sealed outputs,
 * adds a paymaster cell when asked, and commits the CKB transaction — and it
 * refuses what the chain would refuse:
 *
 *   - a Bitcoin transaction whose OP_RETURN does not commit to the CKB side,
 *     or that does not spend the seals of the cells it moves;
 *   - inputs that are not live, or outputs worth more than the inputs;
 *   - anything the mint script refuses: an unpaid ticket, an anchor outside
 *     its bounds, a mint with too little work or the wrong amount, a mint that
 *     re-arms, a balance that grows without a mint.
 *
 * Those mint rules are restated here as a test oracle, not imported from the
 * app, so a client that built the wrong transaction fails here instead of
 * passing because both sides share its mistake. The Rust script is the
 * authority; `contracts/tests` checks it, and this mirrors it.
 */

import { createHash } from "node:crypto";
import type { Page, Route } from "@playwright/test";
import { ccc } from "@ckb-ccc/core";
import { Address, OutScript, TEST_NETWORK, Transaction } from "@scure/btc-signer";

import { activityId, faultIn } from "../../src/lib/activity/verify";
import type { SignedActivity } from "../../src/lib/activity/types";
import { readFileSync } from "node:fs";
import type { ChainSim } from "./chain";

// Restated rather than imported from the app's config, which reads
// `import.meta.env` and so only loads under Vite. They are the defaults the
// app uses when no override is set.
export const SERVICE = "https://api.testnet.rgbpp.io";
export const CKB_RPC = "https://testnet.ckb.dev/";
const deployment = JSON.parse(
  readFileSync(new URL("../../../../contracts/deployments/testnet.json", import.meta.url), "utf8"),
) as { codeHash: string; hashType: string };
const CONFIG = {
  rgbppLock: { codeHash: "0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248" as ccc.Hex, hashType: "type" as ccc.HashType },
  xudt: { codeHash: "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb" as ccc.Hex, hashType: "type" as ccc.HashType },
  mint: { codeHash: deployment.codeHash as ccc.Hex, hashType: deployment.hashType as ccc.HashType },
};
export const PAYMASTER_ADDRESS = "tb1qt5r7g40j93s46c3mdnycc2qsz2t57xqfjddukj";
export const PAYMASTER_FEE = 7000;
export const PLATFORM_ADDRESS = "tb1q7hq7fdm88ewl4g6g7l865ltnau9f0ga76e6gye";
const PAYMASTER_CELL = ccc.fixedPointFrom(316);
const PLACEHOLDER = "0".repeat(64);
const OWNER_BY_INPUT_TYPE = 0x8000_0000;

// The standard, restated (PROTOCOL.md §4).
const UNIT = 100_000_000n;
const HALVING = 1008;
const MIN_CLZ = 16;
const PROMOTER_SHARE = 9500;
const PLATFORM_FEE = 500;
const PLATFORM_SCRIPT = "0014f5c1e4b7673e5dfaa348f7cfaa7d73ef0a97a3be";
const GRACE = 144;

interface LiveCell {
  outPoint: { txHash: ccc.Hex; index: number };
  output: ccc.CellOutput;
  data: ccc.Hex;
  live: boolean;
  blockNumber: number;
}

interface Job {
  btcTxid: string;
  virtual: VirtualResult;
  state: "waiting" | "completed" | "failed";
  ckbTxHash: string | null;
  failure: string | null;
}

interface VirtualResult {
  ckbRawTx: {
    cellDeps: unknown[];
    inputs: Array<{ previousOutput: { txHash: string; index: string } }>;
    outputs: Array<{ capacity: string; lock: RpcScriptCamel; type?: RpcScriptCamel }>;
    outputsData: string[];
    witnesses: string[];
  };
  commitment: string;
  needPaymasterCell: boolean;
  sumInputsCapacity: string;
}

interface RpcScriptCamel {
  codeHash: string;
  hashType: string;
  args: string;
}

const reverse = (h: string) => h.match(/../g)!.reverse().join("");
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest();

function sealOf(lock: ccc.Script): { txid: string; vout: number } | null {
  if (lock.codeHash !== CONFIG.rgbppLock.codeHash || lock.hashType !== CONFIG.rgbppLock.hashType) return null;
  const bytes = ccc.bytesFrom(lock.args);
  return { vout: Number(ccc.numLeFromBytes(bytes.slice(0, 4))), txid: reverse(ccc.hexFrom(bytes.slice(4)).slice(2)) };
}

function withSeal(lock: ccc.Script, txid: string): ccc.Script {
  const seal = sealOf(lock);
  if (!seal || seal.txid !== PLACEHOLDER) return lock;
  return ccc.Script.from({
    ...CONFIG.rgbppLock,
    args: ccc.bytesConcat(ccc.numLeToBytes(seal.vout, 4), ccc.bytesFrom(reverse(txid), "hex")),
  });
}

function clzOf(digest: Uint8Array): number {
  let n = 0;
  for (const byte of digest) {
    if (byte === 0) n += 8;
    else return n + Math.clz32(byte) - 24;
  }
  return n;
}

function standardReward(clz: number, h0: number, anchor: number): bigint | null {
  if (clz < MIN_CLZ || anchor < h0) return null;
  return (UNIT * BigInt(clz * clz)) >> BigInt(Math.floor((anchor - h0) / HALVING));
}

function minerData(data: ccc.Hex): { armed: boolean; nonce: bigint; anchor: number } | null {
  const b = ccc.bytesFrom(data);
  if (b.length !== 13 || b[0] > 1) return null;
  return { armed: b[0] === 1, nonce: ccc.numLeFromBytes(b.slice(1, 9)), anchor: Number(ccc.numLeFromBytes(b.slice(9))) };
}

const amountOf = (data: ccc.Hex) => ccc.numLeFromBytes(ccc.bytesFrom(data).slice(0, 16));

export class RgbppSim {
  readonly cells = new Map<string, LiveCell>();
  readonly transactions = new Map<string, ccc.Transaction>();
  readonly jobs = new Map<string, Job>();
  readonly events: Array<{ id: string; signed: SignedActivity; receivedAt: number; authentic: true }> = [];
  readonly unexpected: string[] = [];
  /** When true, the queue leaves every job waiting. */
  stalled = false;
  private blockNumber = 1;

  constructor(private readonly chain: ChainSim) {
    chain.onBlock.push(() => this.settle());
  }

  async install(page: Page): Promise<void> {
    await page.route(`${SERVICE}/**`, (route) => this.service(route));
    await page.route(`${CKB_RPC}**`, (route) => this.rpc(route));
    await page.route("**/api/activity**", (route) => this.index(route));
  }

  // ── service ────────────────────────────────────────────────────────────

  private async service(route: Route): Promise<void> {
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
      const sealed = new Set([...this.cells.values()].filter((c) => c.live).map((c) => sealOf(c.output.lock)).filter(Boolean).map((s) => `${s!.txid}:${s!.vout}`));
      for (const job of this.jobs.values()) {
        if (job.state !== "waiting") continue;
        for (const o of job.virtual.ckbRawTx.outputs) {
          const seal = sealOf(ccc.Script.from(o.lock as ccc.ScriptLike));
          if (seal) sealed.add(`${job.btcTxid}:${seal.vout}`);
        }
      }
      const utxos = (this.chain.utxos.get(unspent[1]) ?? [])
        .filter((u) => url.searchParams.get("only_non_rgbpp_utxos") !== "true" || !sealed.has(`${u.txid}:${u.vout}`))
        .map((u) => ({ txid: u.txid, vout: u.vout, value: u.value, status: { confirmed: u.confirmed } }));
      return route.fulfill({ json: utxos });
    }
    const assets = /^\/rgbpp\/v1\/address\/([a-z0-9]+)\/assets$/.exec(path);
    if (assets) {
      const mine = new Set((this.chain.utxos.get(assets[1]) ?? []).map((u) => `${u.txid}:${u.vout}`));
      const cells = [...this.cells.values()].filter((c) => {
        const seal = c.live ? sealOf(c.output.lock) : null;
        return seal && mine.has(`${seal.txid}:${seal.vout}`);
      });
      return route.fulfill({ json: cells.map((c) => this.asServiceCell(c)) });
    }
    if (path === "/bitcoin/v1/transaction" && request.method() === "POST") {
      const result = this.chain.accept(body().txhex);
      return "error" in result
        ? route.fulfill({ status: 400, json: { message: result.error } })
        : route.fulfill({ json: { txid: result.txid } });
    }
    if (path === "/rgbpp/v1/transaction/ckb-tx" && request.method() === "POST") {
      const { btc_txid, ckb_virtual_result } = body();
      this.jobs.set(btc_txid, { btcTxid: btc_txid, virtual: ckb_virtual_result, state: "waiting", ckbTxHash: null, failure: null });
      return route.fulfill({ json: { state: "waiting" } });
    }
    const job = /^\/rgbpp\/v1\/transaction\/([0-9a-f]{64})\/job$/.exec(path);
    if (job) {
      const found = this.jobs.get(job[1]);
      return found
        ? route.fulfill({ json: { state: found.state, ...(found.failure ? { failedReason: found.failure } : {}) } })
        : route.fulfill({ status: 404, json: { message: "not found" } });
    }
    const done = /^\/rgbpp\/v1\/transaction\/([0-9a-f]{64})$/.exec(path);
    if (done) {
      const found = this.jobs.get(done[1]);
      return found?.ckbTxHash
        ? route.fulfill({ json: { txhash: found.ckbTxHash } })
        : route.fulfill({ status: 404, json: { message: "not found" } });
    }
    this.unexpected.push(`service ${request.method()} ${path}`);
    return route.fulfill({ status: 501, body: `rgbpp simulator: no handler for ${path}` });
  }

  private asServiceCell(c: LiveCell) {
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
  settle(): void {
    if (this.stalled) return;
    for (const job of this.jobs.values()) {
      if (job.state !== "waiting") continue;
      const btc = this.chain.broadcasts.find((b) => b.txid === job.btcTxid);
      if (!btc?.confirmed) continue;
      try {
        job.ckbTxHash = this.commit(job, btc);
        job.state = "completed";
      } catch (err) {
        job.state = "failed";
        job.failure = err instanceof Error ? err.message : String(err);
      }
    }
  }

  private commit(job: Job, btc: ChainSim["broadcasts"][number]): string {
    const raw = job.virtual.ckbRawTx;
    const opReturn = btc.outputs.find((o) => o.script.startsWith("6a"));
    if (!opReturn || opReturn.script !== `6a20${job.virtual.commitment}`) throw new Error("commitment mismatch");

    const inputs = raw.inputs.map((i) => {
      const key = `${i.previousOutput.txHash}:${Number(i.previousOutput.index)}`;
      const cell = this.cells.get(key);
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

    this.checkMintRules(inputs, outputs, outputsData, btc);

    const tx = ccc.Transaction.from({
      inputs: raw.inputs.map((i) => ({ previousOutput: { txHash: i.previousOutput.txHash, index: Number(i.previousOutput.index) } })),
      outputs,
      outputsData,
    });
    const hash = tx.hash();
    for (const cell of inputs) cell.live = false;
    this.blockNumber++;
    outputs.forEach((output, index) => {
      this.cells.set(`${hash}:${index}`, { outPoint: { txHash: hash, index }, output, data: outputsData[index], live: true, blockNumber: this.blockNumber });
    });
    this.transactions.set(hash, tx);
    return hash;
  }

  /** The mint script's rules, per launch present in the transaction. */
  private checkMintRules(inputs: LiveCell[], outputs: ccc.CellOutput[], data: ccc.Hex[], btc: ChainSim["broadcasts"][number]): void {
    const isMint = (t?: ccc.Script) => !!t && t.codeHash === CONFIG.mint.codeHash && t.hashType === CONFIG.mint.hashType;
    const launches = new Map<string, ccc.Script>();
    for (const c of inputs) if (isMint(c.output.type)) launches.set(c.output.type!.hash(), c.output.type!);
    outputs.forEach((o) => isMint(o.type) && launches.set(o.type!.hash(), o.type!));

    let armedByPromoter = new Map<string, number>();
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

      if (!was && now?.armed) throw new Error("armed without a ticket");
      if (was && now?.armed && was.armed) throw new Error("a mint must disarm");
      if (now?.armed) {
        const tip = this.chain.tip;
        if (now.anchor < h0 || now.anchor > tip || tip - now.anchor > GRACE) throw new Error("bad anchor");
        armedByPromoter.set(promoter, (armedByPromoter.get(promoter) ?? 0) + 1);
      }
      if (was?.armed && now && !now.armed) {
        const seal = sealOf(before[0].output.lock)!;
        const challenge = sha256(Buffer.concat([Buffer.from(reverse(seal.txid), "hex"), Buffer.from(ccc.numLeToBytes(seal.vout, 4))]));
        const preimage = Buffer.concat([challenge, Buffer.from(ccc.numLeToBytes(now.nonce, 8))]);
        const clz = clzOf(sha256(sha256(preimage)));
        const expected = standardReward(clz, h0, was.anchor);
        if (expected === null) throw new Error("work too weak");
        if (minted !== expected) throw new Error(`wrong amount: ${minted} minted, ${expected} allowed`);
      } else if (minted > 0n) {
        throw new Error("balance increased without a mint");
      }
    }
    const paidTo = (script: string) => btc.outputs.filter((o) => o.script === script).reduce((n, o) => n + Number(o.amount), 0);
    const allArmed = [...armedByPromoter.values()].reduce((n, c) => n + c, 0);
    for (const [promoter, count] of armedByPromoter) {
      const owed = count * PROMOTER_SHARE + (promoter === PLATFORM_SCRIPT ? allArmed * PLATFORM_FEE : 0);
      if (paidTo(promoter) < owed) throw new Error("ticket unpaid");
    }
    if (allArmed > 0 && paidTo(PLATFORM_SCRIPT) < allArmed * PLATFORM_FEE) throw new Error("platform fee unpaid");
    armedByPromoter = new Map();
  }

  // ── CKB node ───────────────────────────────────────────────────────────

  private async rpc(route: Route): Promise<void> {
    const payload = JSON.parse(route.request().postData() ?? "null");
    const one = (call: { id: number; method: string; params: unknown[] }) => ({ jsonrpc: "2.0", id: call.id, result: this.call(call.method, call.params) });
    return route.fulfill({ json: Array.isArray(payload) ? payload.map(one) : one(payload) });
  }

  private call(method: string, params: unknown[]): unknown {
    const rpcScript = (s: ccc.Script) => ({ code_hash: s.codeHash, hash_type: s.hashType, args: s.args });
    const rpcOutput = (o: ccc.CellOutput) => ({ capacity: ccc.numToHex(o.capacity), lock: rpcScript(o.lock), type: o.type ? rpcScript(o.type) : null });
    switch (method) {
      case "get_cells": {
        const [key, , limit, after] = params as [{ script: { code_hash: string; hash_type: string; args: string }; script_type: string }, string, string, string | null];
        const wanted = ccc.Script.from({ codeHash: key.script.code_hash, hashType: key.script.hash_type as ccc.HashType, args: key.script.args });
        const matches = [...this.cells.values()].filter((c) => c.live && (key.script_type === "type" ? c.output.type?.eq(wanted) : c.output.lock.eq(wanted)));
        const start = after ? Number(after) : 0;
        const page = matches.slice(start, start + Number(limit));
        return {
          objects: page.map((c) => ({
            output: rpcOutput(c.output),
            output_data: c.data,
            out_point: { tx_hash: c.outPoint.txHash, index: ccc.numToHex(c.outPoint.index) },
            block_number: ccc.numToHex(c.blockNumber),
            tx_index: "0x0",
          })),
          last_cursor: ccc.numToHex(start + page.length),
        };
      }
      case "get_live_cell": {
        const [outPoint] = params as [{ tx_hash: string; index: string }];
        const cell = this.cells.get(`${outPoint.tx_hash}:${Number(outPoint.index)}`);
        if (!cell || !cell.live) return { cell: null, status: "unknown" };
        return { cell: { output: rpcOutput(cell.output), data: { content: cell.data, hash: ccc.hashCkb(cell.data) } }, status: "live" };
      }
      case "get_transaction": {
        const [hash] = params as [string];
        const tx = this.transactions.get(hash);
        if (!tx) return null;
        return {
          transaction: {
            version: "0x0",
            cell_deps: [],
            header_deps: [],
            inputs: tx.inputs.map((i) => ({ previous_output: { tx_hash: i.previousOutput.txHash, index: ccc.numToHex(i.previousOutput.index) }, since: "0x0" })),
            outputs: tx.outputs.map(rpcOutput),
            outputs_data: tx.outputsData,
            witnesses: [],
            hash,
          },
          tx_status: { status: "committed", block_hash: "0x" + "00".repeat(32), block_number: "0x1", reason: null },
          cycles: null,
        };
      }
      case "get_tip_header":
        return { number: ccc.numToHex(this.blockNumber), hash: "0x" + "00".repeat(32), epoch: "0x0", timestamp: "0x0", parent_hash: "0x" + "00".repeat(32), compact_target: "0x0", nonce: "0x0", transactions_root: "0x" + "00".repeat(32), proposals_hash: "0x" + "00".repeat(32), extra_hash: "0x" + "00".repeat(32), dao: "0x" + "00".repeat(32), version: "0x0" };
      default:
        this.unexpected.push(`ckb ${method}`);
        return null;
    }
  }

  /** Seed a transaction's outputs as if it were already on chain (for fixtures). */
  seedTransaction(tx: ccc.Transaction): string {
    const hash = tx.hash();
    this.transactions.set(hash, tx);
    tx.outputs.forEach((output, index) => {
      this.cells.set(`${hash}:${index}`, { outPoint: { txHash: hash, index }, output, data: tx.outputsData[index], live: true, blockNumber: 1 });
    });
    return hash;
  }

  // ── activity index ─────────────────────────────────────────────────────

  private async index(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST") {
      const signed = JSON.parse(request.postData() ?? "{}") as SignedActivity;
      const fault = faultIn(signed);
      if (fault) return route.fulfill({ status: 400, json: { error: fault } });
      const id = activityId(signed.body);
      if (!this.events.some((e) => e.id === id)) {
        this.events.push({ id, signed, receivedAt: Math.floor(Date.now() / 1000) + this.events.length, authentic: true });
      }
      return route.fulfill({ status: 201, json: { id } });
    }
    const kind = url.searchParams.get("kind");
    const launch = url.searchParams.get("launch");
    const limit = Number(url.searchParams.get("limit") ?? 60);
    const events = this.events
      .filter((e) => (!kind || e.signed.body.kind === kind) && (!launch || e.signed.body.launch === launch))
      .sort((a, b) => b.receivedAt - a.receivedAt)
      .slice(0, limit);
    return route.fulfill({ json: { events } });
  }
}

/** The address a scriptPubKey pays, for assertions. */
export function addressOfScript(script: Uint8Array): string {
  return Address(TEST_NETWORK).encode(OutScript.decode(script));
}
