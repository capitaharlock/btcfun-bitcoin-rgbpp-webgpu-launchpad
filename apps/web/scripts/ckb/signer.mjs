/* The CKB side of the end-to-end wallet.
 *
 * Same mnemonic as the Bitcoin test wallet (`../local.mjs`), on CKB's BIP44
 * coin type 309, so one secret funds both chains and any CKB wallet can import it. Testnet only: the client is the
 * public testnet, and nothing here can be pointed at mainnet.
 */

import { ccc } from "@ckb-ccc/core";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "@scure/bip32";
import { requireMnemonic } from "../local.mjs";

export const client = new ccc.ClientPublicTestnet();

/** Account 0 is the funded wallet; account 1 is the second party in tests. */
export function signer(account = 0) {
  const node = HDKey.fromMasterSeed(mnemonicToSeedSync(requireMnemonic())).derive(`m/44'/309'/${account}'/0/0`);
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
