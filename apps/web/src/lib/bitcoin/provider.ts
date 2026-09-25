/* Chain access over the mempool.space REST API.
 *
 * A narrow, typed surface — UTXOs, balance, tip height, fee rate, broadcast —
 * rather than a general client, so the wallet never depends on the shape of a
 * third-party response. Every function validates what it got back: a provider
 * returning something unexpected must fail here, not three layers later inside
 * transaction construction.
 *
 * The provider is *not* trusted for protocol truth. It reports what it sees;
 * PROTOCOL.md §3 requires that anything consequential be independently
 * checkable, which is why balances are derived from UTXOs the caller can look
 * up rather than from a summary field.
 */

import { ACTIVE, FALLBACK_FEE_RATE, type NetworkConfig } from "./network";
import { TXID_PATTERN } from "./txid";

export interface Utxo {
  txid: string;
  vout: number;
  /** Value in satoshis. */
  value: number;
  confirmed: boolean;
  /** Height of the confirming block, absent while unconfirmed. */
  height?: number;
}

export interface AddressBalance {
  utxos: Utxo[];
  /** Total spendable, in satoshis. */
  total: number;
  /** Portion of `total` still unconfirmed. */
  pending: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

async function request(path: string, network: NetworkConfig, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${network.api}${path}`, init);
  } catch (cause) {
    throw new ProviderError(`Cannot reach ${network.label}: ${(cause as Error).message}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ProviderError(
      `${network.label} API ${response.status}: ${body.slice(0, 180) || response.statusText}`,
      response.status,
    );
  }
  return response;
}

function toUtxo(raw: unknown): Utxo {
  const u = raw as Record<string, unknown>;
  const status = (u.status ?? {}) as Record<string, unknown>;
  const txid = typeof u.txid === "string" ? u.txid : null;
  const vout = Number(u.vout);
  const value = Number(u.value);
  if (!txid || !Number.isInteger(vout) || !Number.isFinite(value)) {
    throw new ProviderError("Malformed UTXO in provider response");
  }
  return {
    txid,
    vout,
    value,
    confirmed: status.confirmed === true,
    height: typeof status.block_height === "number" ? status.block_height : undefined,
  };
}

export async function getUtxos(address: string, network: NetworkConfig = ACTIVE): Promise<Utxo[]> {
  const response = await request(`/address/${address}/utxo`, network);
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new ProviderError("Expected an array of UTXOs");
  // Largest first: coin selection wants the fewest inputs, and a stable order
  // makes a transaction reproducible from the same UTXO set.
  return body.map(toUtxo).sort((a, b) => b.value - a.value || a.txid.localeCompare(b.txid));
}

/** Balance derived from the UTXO set, so every satoshi is traceable to an output. */
export async function getBalance(
  address: string,
  network: NetworkConfig = ACTIVE,
): Promise<AddressBalance> {
  const utxos = await getUtxos(address, network);
  let total = 0;
  let pending = 0;
  for (const u of utxos) {
    total += u.value;
    if (!u.confirmed) pending += u.value;
  }
  return { utxos, total, pending };
}

/** Current chain tip. This is the clock the emission schedule runs on (§6). */
export async function getTipHeight(network: NetworkConfig = ACTIVE): Promise<number> {
  const response = await request("/blocks/tip/height", network);
  const height = Number((await response.text()).trim());
  if (!Number.isInteger(height) || height <= 0) {
    throw new ProviderError("Provider returned a nonsensical tip height");
  }
  return height;
}

/** Hash of a block by height — the per-epoch binding in a canonical challenge. */
export async function getBlockHash(height: number, network: NetworkConfig = ACTIVE): Promise<string> {
  const response = await request(`/block-height/${height}`, network);
  const hash = (await response.text()).trim();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new ProviderError("Provider returned a malformed block hash");
  return hash;
}

/** Recommended fee rate in sat/vB. Falls back rather than blocking a send. */
export async function getFeeRate(network: NetworkConfig = ACTIVE): Promise<number> {
  try {
    const response = await request("/v1/fees/recommended", network);
    const fees = (await response.json()) as Record<string, unknown>;
    const rate = Number(fees.halfHourFee ?? fees.fastestFee);
    return Number.isFinite(rate) && rate > 0 ? Math.ceil(rate) : FALLBACK_FEE_RATE;
  } catch {
    return FALLBACK_FEE_RATE;
  }
}

/** The floor of the mining fee rate: testnet's "fastest" can read 1 sat/vB and still wait. */
export const MIN_FAST_FEE_RATE = 3;

/**
 * The fee rate mining transactions pay: the larger of `MIN_FAST_FEE_RATE` and
 * mempool.space's "fastest". A ticket or a mint that waits in the mempool
 * holds the whole round up, so these pay to get into the next block.
 */
export async function fastFeeRate(network: NetworkConfig = ACTIVE): Promise<number> {
  try {
    const response = await request("/v1/fees/recommended", network);
    const fees = (await response.json()) as Record<string, unknown>;
    return fastFrom(Number(fees.fastestFee));
  } catch {
    return MIN_FAST_FEE_RATE;
  }
}

/** `fastFeeRate`'s rule, on a quoted "fastest" rate. */
export function fastFrom(fastest: number): number {
  return Number.isFinite(fastest) && fastest > 0 ? Math.max(MIN_FAST_FEE_RATE, Math.ceil(fastest)) : MIN_FAST_FEE_RATE;
}

/** A transaction's full serialization, witness included, as hex. */
export async function getTxHex(txid: string, network: NetworkConfig = ACTIVE): Promise<string> {
  const response = await request(`/tx/${txid}/hex`, network);
  const hex = (await response.text()).trim();
  if (!/^([0-9a-f]{2})+$/.test(hex)) throw new ProviderError("Provider returned a malformed transaction");
  return hex;
}

/** Publish a signed transaction. Returns its txid as the network computed it. */
export async function broadcast(rawHex: string, network: NetworkConfig = ACTIVE): Promise<string> {
  const response = await request("/tx", network, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: rawHex,
  });
  const txid = (await response.text()).trim();
  if (!TXID_PATTERN.test(txid)) throw new ProviderError(`Unexpected broadcast reply: ${txid}`);
  return txid;
}

export interface TxStatus {
  confirmed: boolean;
  height?: number;
  /** Seconds since epoch of the confirming block. */
  time?: number;
}

export async function getTxStatus(txid: string, network: NetworkConfig = ACTIVE): Promise<TxStatus> {
  const response = await request(`/tx/${txid}/status`, network);
  const status = (await response.json()) as Record<string, unknown>;
  return {
    confirmed: status.confirmed === true,
    height: typeof status.block_height === "number" ? status.block_height : undefined,
    time: typeof status.block_time === "number" ? status.block_time : undefined,
  };
}

/** One output of a transaction, as the chain recorded it. */
export interface ChainOutput {
  /** The address it pays, or null for a script with no address form (OP_RETURN). */
  address: string | null;
  /** scriptPubKey, hex. */
  script: string;
  value: number;
}

/** An outpoint a transaction spends. */
export interface ChainInput {
  txid: string;
  vout: number;
}

/** A transaction as the market needs it: what it spent, who was paid what, and whether it stuck. */
export interface ChainTx {
  txid: string;
  confirmed: boolean;
  inputs: ChainInput[];
  outputs: ChainOutput[];
}

function toChainTx(raw: unknown): ChainTx {
  const tx = raw as Record<string, unknown>;
  const status = (tx.status ?? {}) as Record<string, unknown>;
  if (typeof tx.txid !== "string" || !TXID_PATTERN.test(tx.txid) || !Array.isArray(tx.vout) || !Array.isArray(tx.vin)) {
    throw new ProviderError("Malformed transaction in provider response");
  }
  return {
    txid: tx.txid,
    confirmed: status.confirmed === true,
    inputs: tx.vin.map((i) => {
      const input = i as Record<string, unknown>;
      if (typeof input.txid !== "string" || !Number.isInteger(input.vout)) {
        throw new ProviderError("Malformed input in provider response");
      }
      return { txid: input.txid, vout: input.vout as number };
    }),
    outputs: tx.vout.map((o) => {
      const out = o as Record<string, unknown>;
      const value = Number(out.value);
      if (typeof out.scriptpubkey !== "string" || !Number.isFinite(value)) {
        throw new ProviderError("Malformed output in provider response");
      }
      return {
        address: typeof out.scriptpubkey_address === "string" ? out.scriptpubkey_address : null,
        script: out.scriptpubkey,
        value,
      };
    }),
  };
}

export async function getTx(txid: string, network: NetworkConfig = ACTIVE): Promise<ChainTx> {
  const response = await request(`/tx/${txid}`, network);
  return toChainTx(await response.json());
}

/**
 * Recent transactions touching an address, newest first — mempool included.
 *
 * The provider returns a bounded page (fifty on mempool.space). That is enough
 * for a seller watching for payments to open offers; a busier address would
 * need pagination, which is deliberately not pretended here.
 */
export async function getAddressTxs(address: string, network: NetworkConfig = ACTIVE): Promise<ChainTx[]> {
  const response = await request(`/address/${address}/txs`, network);
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) throw new ProviderError("Malformed address history in provider response");
  return body.map(toChainTx);
}

/**
 * Whether an output has been spent, confirmed or not. A listed cell's seal
 * that is already spent means a sale or a cancellation is landing, and a
 * second buyer's transaction would only be rejected as a double spend.
 */
export async function isSpent(txid: string, vout: number, network: NetworkConfig = ACTIVE): Promise<boolean> {
  const response = await fetch(`${network.api}/tx/${txid}/outspend/${vout}`);
  if (!response.ok) throw new ProviderError(`outspend lookup failed: HTTP ${response.status}`);
  return ((await response.json()) as { spent: boolean }).spent;
}

