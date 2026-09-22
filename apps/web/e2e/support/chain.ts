/* A simulated Bitcoin provider, for the deterministic project.
 *
 * The app treats block height as its clock: the emission schedule, epochs and
 * whether a launch is open all derive from the tip the provider reports. So
 * controlling the provider is how a test moves time — a day is 144 blocks, a
 * week 1008 — without waiting for a real chain.
 *
 * Only the mempool.space endpoints the app actually calls are answered, and
 * anything else is refused loudly. A simulator that silently passed unknown
 * requests through would let a test reach the real network by accident.
 */

import { createHash } from "node:crypto";
import type { Page, Route } from "@playwright/test";
import { Address, OutScript, TEST_NETWORK, Transaction } from "@scure/btc-signer";

const hex = {
  decode: (s: string) => Uint8Array.from(Buffer.from(s, "hex")),
  encode: (b: Uint8Array) => Buffer.from(b).toString("hex"),
};

export const API = "https://mempool.space/testnet/api";

export interface SimUtxo {
  txid: string;
  vout: number;
  value: number;
  confirmed: boolean;
}

/** A deterministic, well-formed block hash for any height. */
export function blockHashAt(height: number): string {
  return createHash("sha256").update(`sim-block-${height}`).digest("hex");
}

/** The address a script pays, or null for OP_RETURN and other address-less scripts. */
function addressOf(script: string): string | null {
  try {
    return Address(TEST_NETWORK).encode(OutScript.decode(hex.decode(script)));
  } catch {
    return null;
  }
}

const SIMS = new WeakMap<Page, ChainSim>();

export class ChainSim {
  tip: number;
  /** UTXOs per address. Absent means an empty wallet. */
  readonly utxos = new Map<string, SimUtxo[]>();
  /** Every transaction the app broadcast, parsed, in order. */
  readonly broadcasts: Array<{
    txid: string;
    hex: string;
    inputs: Array<{ txid: string; vout: number }>;
    outputs: Array<{ script: string; amount: bigint; address: string | null }>;
    confirmed: boolean;
  }> = [];
  /** Unhandled provider paths — a test should end with this empty. */
  readonly unexpected: string[] = [];
  /** When set, every provider call fails with this status. */
  outage: number | null = null;
  /** Heights the provider answers 404 for this many more times — a tip that
   *  is announced before its block can be fetched by height. */
  readonly unindexed = new Map<number, number>();
  /** Every outpoint any broadcast has spent, as `txid:vout`. */
  readonly spent = new Set<string>();
  /** Called after each block, so other simulators can settle what confirmed. */
  readonly onBlock: Array<(height: number) => void> = [];

  constructor(tip = 150_000) {
    this.tip = tip;
  }

  /** Move the clock forward. 144 blocks is a day; 1008 a week. Mining a
   *  block also confirms whatever was waiting in the mempool. */
  advance(blocks: number): number {
    this.tip += blocks;
    if (blocks > 0) {
      for (const list of this.utxos.values()) for (const u of list) u.confirmed = true;
      for (const tx of this.broadcasts) tx.confirmed = true;
      for (const listener of this.onBlock) listener(this.tip);
    }
    return this.tip;
  }

  private funded = 0;

  fund(address: string, ...values: number[]): void {
    const list = this.utxos.get(address) ?? [];
    for (const value of values) {
      // A counter, not the list's length: spent coins leave the list, and a
      // second coin must never reuse the txid of one already spent.
      const txid = createHash("sha256").update(`fund-${address}-${this.funded++}-${value}`).digest("hex");
      list.push({ txid, vout: 0, value, confirmed: true });
    }
    this.utxos.set(address, list);
  }

  async install(page: Page): Promise<void> {
    SIMS.set(page, this);
    await page.route(`${API}/**`, (route) => this.answer(route));
  }

  /** The simulator installed on `page`, for flows that must fund what they spend. */
  static of(page: Page): ChainSim {
    const sim = SIMS.get(page);
    if (!sim) throw new Error("no chain simulator on this page");
    return sim;
  }

  /** Accept a raw transaction as a node would. Returns its txid, or an error. */
  accept(raw: string): { txid: string } | { error: string } {
    let tx: Transaction;
    try {
      tx = Transaction.fromRaw(hex.decode(raw.trim()), { allowUnknownOutputs: true });
    } catch (err) {
      return { error: `sendrawtransaction RPC error: ${String(err)}` };
    }
    const inputs: string[] = [];
    for (let i = 0; i < tx.inputsLength; i++) {
      const input = tx.getInput(i);
      if (input.txid) inputs.push(`${hex.encode(input.txid)}:${input.index}`);
    }
    const conflict = inputs.find((key) => this.spent.has(key));
    if (conflict) return { error: `sendrawtransaction RPC error: bad-txns-inputs-missingorspent (${conflict})` };

    const txid = tx.id;
    const outputs: Array<{ script: string; amount: bigint; address: string | null }> = [];
    for (let i = 0; i < tx.outputsLength; i++) {
      const out = tx.getOutput(i);
      const script = hex.encode(out.script ?? new Uint8Array());
      outputs.push({ script, amount: out.amount ?? 0n, address: addressOf(script) });
    }
    const spends = inputs.map((key) => {
      const [txid, vout] = key.split(":");
      return { txid, vout: Number(vout) };
    });
    this.broadcasts.push({ txid, hex: raw.trim(), inputs: spends, outputs, confirmed: false });
    for (const key of inputs) this.spent.add(key);
    for (const [address, list] of this.utxos) {
      this.utxos.set(address, list.filter((u) => !this.spent.has(`${u.txid}:${u.vout}`)));
    }
    // Credit every output that pays an address we track — change, or a
    // payment to another simulated wallet — as unconfirmed, as a node would.
    outputs.forEach((out, vout) => {
      const list = out.address ? this.utxos.get(out.address) : undefined;
      if (list) list.push({ txid, vout, value: Number(out.amount), confirmed: false });
    });
    return { txid };
  }

  /** Start tracking an address, so outputs paying it become spendable UTXOs. */
  track(address: string): void {
    if (!this.utxos.has(address)) this.utxos.set(address, []);
  }

  private async answer(route: Route): Promise<void> {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/testnet\/api/, "");

    if (this.outage) {
      return route.fulfill({ status: this.outage, body: "simulated outage" });
    }

    if (path === "/blocks/tip/height") return route.fulfill({ body: String(this.tip) });

    const height = /^\/block-height\/(\d+)$/.exec(path);
    if (height) {
      const h = Number(height[1]);
      const pending = this.unindexed.get(h) ?? 0;
      if (pending > 0) {
        this.unindexed.set(h, pending - 1);
        return route.fulfill({ status: 404, body: "Block not found" });
      }
      if (h > this.tip) return route.fulfill({ status: 404, body: "Block height out of range" });
      return route.fulfill({ body: blockHashAt(h) });
    }

    const utxo = /^\/address\/([a-z0-9]+)\/utxo$/.exec(path);
    if (utxo) {
      const list = (this.utxos.get(utxo[1]) ?? []).map((u) => ({
        txid: u.txid,
        vout: u.vout,
        value: u.value,
        status: { confirmed: u.confirmed, block_height: u.confirmed ? this.tip - 1 : undefined },
      }));
      return route.fulfill({ json: list });
    }

    if (path === "/v1/fees/recommended") {
      return route.fulfill({
        json: { fastestFee: 2, halfHourFee: 1, hourFee: 1, economyFee: 1, minimumFee: 1 },
      });
    }

    if (path === "/tx" && request.method() === "POST") return this.broadcast(route, request.postData() ?? "");

    const status = /^\/tx\/([0-9a-f]{64})\/status$/.exec(path);
    if (status) return route.fulfill({ json: { confirmed: true, block_height: this.tip } });

    const tx = /^\/tx\/([0-9a-f]{64})$/.exec(path);
    if (tx) {
      const found = this.broadcasts.find((b) => b.txid === tx[1]);
      return found
        ? route.fulfill({ json: this.asMempoolTx(found) })
        : route.fulfill({ status: 404, body: "Transaction not found" });
    }

    const hex = /^\/tx\/([0-9a-f]{64})\/hex$/.exec(path);
    if (hex) {
      const found = this.broadcasts.find((b) => b.txid === hex[1]);
      return found ? route.fulfill({ body: found.hex }) : route.fulfill({ status: 404, body: "Transaction not found" });
    }

    const outspend = /^\/tx\/([0-9a-f]{64})\/outspend\/(\d+)$/.exec(path);
    if (outspend) return route.fulfill({ json: { spent: this.spent.has(`${outspend[1]}:${outspend[2]}`) } });

    const history = /^\/address\/([a-z0-9]+)\/txs$/.exec(path);
    if (history) {
      const touching = this.broadcasts.filter((b) => b.outputs.some((o) => o.address === history[1]));
      return route.fulfill({ json: [...touching].reverse().map((b) => this.asMempoolTx(b)) });
    }

    this.unexpected.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 501, body: `simulator: no handler for ${path}` });
  }

  private async broadcast(route: Route, raw: string): Promise<void> {
    const result = this.accept(raw);
    return "error" in result
      ? route.fulfill({ status: 400, body: result.error })
      : route.fulfill({ body: result.txid });
  }

  /** A broadcast transaction in the shape mempool.space returns. */
  private asMempoolTx(b: ChainSim["broadcasts"][number]) {
    return {
      txid: b.txid,
      status: { confirmed: b.confirmed, ...(b.confirmed ? { block_height: this.tip } : {}) },
      vin: b.inputs.map((i) => ({ txid: i.txid, vout: i.vout })),
      vout: b.outputs.map((o) => ({
        scriptpubkey: o.script,
        scriptpubkey_type: o.script.startsWith("6a") ? "op_return" : "v0_p2wpkh",
        ...(o.address ? { scriptpubkey_address: o.address } : {}),
        value: Number(o.amount),
      })),
    };
  }
}
