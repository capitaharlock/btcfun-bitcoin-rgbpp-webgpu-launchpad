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

export const MEMPOOL = "https://mempool.space/testnet4/api";

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
  throw new Error(`transaction ${txid} never appeared on testnet4`);
}

export async function tipHeight(): Promise<number> {
  return Number(await (await fetch(`${MEMPOOL}/blocks/tip/height`)).text());
}
