/* The RGB++ assets service: Bitcoin data, RGB++ cells, and the queue that
 * completes the CKB side of an operation.
 *
 * What the queue can and cannot do matters, so it is stated here. It waits for
 * the Bitcoin transaction to confirm, attaches the SPV proof, fills in the real
 * txid where the plan had the placeholder, adds a paymaster cell when the plan
 * asks for one, and submits. It cannot change what happens: the Bitcoin
 * transaction commits to the CKB transaction, and the RGB++ lock rejects any
 * CKB transaction that differs. If the service stops, anyone can complete the
 * same transaction with a proof from any SPV source; the tokens do not depend
 * on it.
 *
 * Testnet access tokens are issued to anyone who asks, per origin. On mainnet
 * the service requires a registered app, which is a deployment step.
 */

import { ccc } from "@ckb-ccc/core";

import type { Utxo } from "../bitcoin/provider";
import type { RgbppConfig } from "./config";
import type { Plan } from "./operations";

export class ServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface ServiceCell {
  outPoint: { txHash: ccc.Hex; index: ccc.Hex };
  cellOutput: {
    capacity: ccc.Hex;
    lock: { codeHash: ccc.Hex; hashType: ccc.HashType; args: ccc.Hex };
    type?: { codeHash: ccc.Hex; hashType: ccc.HashType; args: ccc.Hex } | null;
  };
  data: ccc.Hex;
  typeHash?: ccc.Hex;
}

export type QueueState = "waiting" | "delayed" | "active" | "completed" | "failed" | "unknown";

export interface QueueStatus {
  state: QueueState;
  /** The CKB transaction hash, once submitted. */
  ckbTxHash: ccc.Hex | null;
  failure: string | null;
}

export interface ServiceOptions {
  /** Sent as `Origin` when not running in a browser, which sets it itself. */
  origin?: string;
  fetch?: typeof fetch;
}

export class RgbppService {
  private token: Promise<string> | null = null;
  private readonly http: typeof fetch;

  constructor(
    private readonly config: RgbppConfig,
    private readonly options: ServiceOptions = {},
  ) {
    this.http = options.fetch ?? ((...args) => fetch(...args));
  }

  private origin(): string {
    if (this.options.origin) return this.options.origin;
    if (typeof location !== "undefined") return location.origin;
    throw new Error("the RGB++ service needs an origin outside a browser");
  }

  private async bearer(): Promise<string> {
    this.token ??= (async () => {
      const response = await this.http(`${this.config.service}/token/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app: "btcfun", domain: new URL(this.origin()).host }),
      });
      if (!response.ok) throw new ServiceError(response.status, "the RGB++ service refused an access token");
      return ((await response.json()) as { token: string }).token;
    })();
    return this.token;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await this.bearer()}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
    };
    if (this.options.origin) headers.origin = this.options.origin;
    const response = await this.http(`${this.config.service}${path}`, { ...init, headers });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new ServiceError(response.status, `${path}: ${response.status} ${detail.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  }

  async paymaster(): Promise<{ address: string; feeSats: number }> {
    const info = await this.call<{ btc_address: string; fee: number }>("/rgbpp/v1/paymaster/info");
    return { address: info.btc_address, feeSats: info.fee };
  }

  /** UTXOs that seal no RGB++ cell: the only ones safe to spend as plain funding. */
  async freeUtxos(address: string): Promise<Utxo[]> {
    const utxos = await this.call<Array<{ txid: string; vout: number; value: number; status: { confirmed: boolean } }>>(
      `/bitcoin/v1/address/${address}/unspent?only_non_rgbpp_utxos=true&no_cache=true`,
    );
    return utxos.map((u) => ({ txid: u.txid, vout: u.vout, value: u.value, confirmed: u.status.confirmed }));
  }

  /** Every RGB++ cell sealed to one of the address's UTXOs, of any type. */
  async cells(address: string): Promise<ServiceCell[]> {
    return this.call<ServiceCell[]>(`/rgbpp/v1/address/${address}/assets?no_cache=true`);
  }

  async broadcast(hex: string): Promise<string> {
    const { txid } = await this.call<{ txid: string }>("/bitcoin/v1/transaction", {
      method: "POST",
      body: JSON.stringify({ txhex: hex }),
    });
    return txid;
  }

  /** Hand the CKB side of `plan`, committed by `btcTxid`, to the queue. */
  async enqueue(plan: Plan, btcTxid: string): Promise<QueueState> {
    const { state } = await this.call<{ state: QueueState }>("/rgbpp/v1/transaction/ckb-tx", {
      method: "POST",
      body: JSON.stringify({ btc_txid: btcTxid, ckb_virtual_result: virtualResult(plan) }),
    });
    return state;
  }

  async status(btcTxid: string): Promise<QueueStatus> {
    const job = await this.call<{ state: QueueState; attempts?: number; failedReason?: string }>(
      `/rgbpp/v1/transaction/${btcTxid}/job`,
    ).catch((err: unknown) => {
      if (err instanceof ServiceError && err.status === 404) return null;
      throw err;
    });
    const done = await this.call<{ txhash: ccc.Hex }>(`/rgbpp/v1/transaction/${btcTxid}`).catch(
      (err: unknown) => {
        if (err instanceof ServiceError && err.status === 404) return null;
        throw err;
      },
    );
    return {
      state: done ? "completed" : (job?.state ?? "unknown"),
      ckbTxHash: done?.txhash ?? null,
      failure: job?.failedReason ?? null,
    };
  }
}

const RGBPP_WITNESS_PLACEHOLDER = "0xFF";

/** The CKB virtual transaction in the RGB++ SDK's shape, which the queue parses. */
export function virtualResult(plan: Plan) {
  const hex = (n: bigint | number) => ccc.numToHex(n);
  const script = (s: ccc.ScriptLike) => {
    const v = ccc.Script.from(s);
    return { codeHash: v.codeHash, hashType: v.hashType, args: v.args };
  };
  return {
    ckbRawTx: {
      version: "0x0",
      cellDeps: plan.cellDeps.map((d) => {
        const dep = ccc.CellDep.from(d);
        return { outPoint: { txHash: dep.outPoint.txHash, index: hex(dep.outPoint.index) }, depType: dep.depType };
      }),
      headerDeps: [],
      inputs: plan.virtualTx.inputs.map((i) => {
        const o = ccc.OutPoint.from(i);
        return { previousOutput: { txHash: o.txHash, index: hex(o.index) }, since: "0x0" };
      }),
      outputs: plan.virtualTx.outputs.map((o) => {
        const cell = ccc.CellOutput.from(o);
        return {
          capacity: hex(cell.capacity),
          lock: script(cell.lock),
          ...(cell.type ? { type: script(cell.type) } : {}),
        };
      }),
      outputsData: plan.virtualTx.outputsData.map((d) => ccc.hexFrom(d)),
      // Every input is sealed; the queue replaces each placeholder with the
      // RGB++ unlock once the Bitcoin transaction has a proof. The btc.fun
      // witness sits past them, where the queue leaves it as written — an
      // assumption about the queue that the live run on testnet confirms.
      witnesses: [
        ...plan.virtualTx.inputs.map(() => RGBPP_WITNESS_PLACEHOLDER),
        ...(plan.btcfunWitness ? [plan.btcfunWitness] : []),
      ],
    },
    commitment: plan.commitment.slice(2),
    needPaymasterCell: plan.needPaymasterCell,
    sumInputsCapacity: hex(plan.sumInputsCapacity),
  };
}
