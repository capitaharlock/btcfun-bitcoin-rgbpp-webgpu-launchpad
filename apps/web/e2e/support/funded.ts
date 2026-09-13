/* The funded end-to-end wallet, as the browser suite needs it.
 *
 * The same key the command-line runner spends from (`.e2e-wallet.json`, or
 * `E2E_MNEMONIC`). The browser gets it the way a person would: its 32-byte
 * secret typed into "Restore from a secret" on the wallet page.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

const WALLET_PATH = fileURLToPath(new URL("../../.e2e-wallet.json", import.meta.url));

export const MEMPOOL = "https://mempool.space/testnet/api";

/** The funded wallet's secret as 64 hex characters, or null when absent. */
export function fundedSecret(): string | null {
  let mnemonic = process.env.E2E_MNEMONIC?.trim();
  if (!mnemonic) {
    try {
      mnemonic = (JSON.parse(readFileSync(WALLET_PATH, "utf8")) as { mnemonic?: string }).mnemonic;
    } catch {
      return null;
    }
  }
  if (!mnemonic || !validateMnemonic(mnemonic, wordlist)) return null;
  return Buffer.from(mnemonicToEntropy(mnemonic, wordlist)).toString("hex");
}

export interface ChainTx {
  txid: string;
  status: { confirmed: boolean; block_height?: number };
  vout: Array<{ scriptpubkey: string; scriptpubkey_type: string; value: number }>;
  fee: number;
  weight: number;
}

/** Fetch a transaction from the real network, retrying while it propagates. */
export async function fetchTx(txid: string, attempts = 20): Promise<ChainTx> {
  for (let i = 0; i < attempts; i++) {
    const response = await fetch(`${MEMPOOL}/tx/${txid}`);
    if (response.ok) return (await response.json()) as ChainTx;
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`transaction ${txid} never appeared on testnet3`);
}

export async function tipHeight(): Promise<number> {
  return Number(await (await fetch(`${MEMPOOL}/blocks/tip/height`)).text());
}

export interface AddressTx {
  txid: string;
  vout: Array<{ scriptpubkey: string; scriptpubkey_address?: string; value: number }>;
}

/**
 * The first transaction in an address's history that satisfies `match`,
 * retrying while the provider's address index catches up with a broadcast —
 * a payment can be accepted by the node a few seconds before it is listed.
 */
export async function findAddressTx(
  address: string,
  match: (tx: AddressTx) => boolean,
  attempts = 30,
): Promise<AddressTx> {
  for (let i = 0; i < attempts; i++) {
    const response = await fetch(`${MEMPOOL}/address/${address}/txs`);
    if (response.ok) {
      const found = ((await response.json()) as AddressTx[]).find(match);
      if (found) return found;
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`no matching transaction appeared for ${address} on testnet3`);
}
