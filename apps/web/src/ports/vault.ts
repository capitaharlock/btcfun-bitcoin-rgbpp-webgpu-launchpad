/* A wallet as the rest of the app sees it: an address, an identity, and a way
 * to sign once.
 *
 * Three adapters serve it today (`adapters/vault`): a passkey, a browser-kept
 * key and the shared demo key. The testnet scripts serve it with a key in
 * memory, and a test with a fixed key. None of them leak entropy through this
 * interface: `use()` derives the key for one callback and wipes it, so a key
 * never outlives the operation it signed.
 */

import type { WalletKey } from "@/domain/bitcoin";

export type VaultKind = "passkey" | "local" | "demo";

export interface Vault {
  readonly kind: VaultKind;
  readonly address: string;
  /** Compressed public key hex. The identity ledger records are signed under. */
  readonly identity: string;
  /** Short description of how this wallet is protected, for the UI. */
  readonly label: string;
  /**
   * Derive the key, run `fn`, wipe. The passkey adapter prompts for user
   * verification here, so call it once per operation, not once per render.
   */
  use<T>(fn: (key: WalletKey) => T | Promise<T>): Promise<T>;
}
