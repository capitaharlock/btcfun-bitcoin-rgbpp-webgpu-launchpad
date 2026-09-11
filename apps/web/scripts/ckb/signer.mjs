/* The CKB side of the end-to-end wallet.
 *
 * Same mnemonic as the Bitcoin test wallet (`.e2e-wallet.json` or
 * `E2E_MNEMONIC`), on CKB's BIP44 coin type 309, so one secret funds both
 * chains and any CKB wallet can import it. Testnet only: the client is the
 * public testnet, and nothing here can be pointed at mainnet.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ccc } from "@ckb-ccc/core";
import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";

const WALLET = fileURLToPath(new URL("../../.e2e-wallet.json", import.meta.url));

export const client = new ccc.ClientPublicTestnet();

function mnemonic() {
  const phrase = process.env.E2E_MNEMONIC?.trim() || JSON.parse(readFileSync(WALLET, "utf8")).mnemonic;
  if (!validateMnemonic(phrase, wordlist)) throw new Error("the end-to-end mnemonic is not valid BIP39");
  return phrase;
}

/** Account 0 is the funded wallet; account 1 is the second party in tests. */
export function signer(account = 0) {
  const node = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic())).derive(`m/44'/309'/${account}'/0/0`);
  return new ccc.SignerCkbPrivateKey(client, ccc.hexFrom(node.privateKey));
}

/** Resolve once `txHash` is committed, or throw after `timeoutMs`. */
export async function committed(txHash, timeoutMs = 180_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const tx = await client.getTransaction(txHash);
    if (tx?.status === "committed") return tx;
    if (tx?.status === "rejected") throw new Error(`transaction ${txHash} was rejected`);
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`transaction ${txHash} not committed after ${timeoutMs / 1000}s`);
}
