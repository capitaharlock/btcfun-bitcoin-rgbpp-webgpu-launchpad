/* Signing activity events.
 *
 * The half that needs a wallet. Verification lives in `verify.ts` so the index
 * worker can run the identical check without importing a key derivation stack.
 */

import { identityOf, signDigest, type WalletKey } from "@/domain/bitcoin";
import { bytesToHex } from "@/domain/codec";
import { activityDigest } from "./verify";
import { ACTIVITY_VERSION, ActivityError, type ActivityBody, type ActivityKind, type SignedActivity } from "./types";

/**
 * What signing needs from a wallet: the identity it claims and one scoped use
 * of its key. Structural on purpose — the app's `Vault` port satisfies it, and
 * so does a script's key in memory — so the domain signs without knowing where
 * a key lives.
 */
export interface ActivitySigner {
  readonly identity: string;
  use<T>(fn: (key: WalletKey) => T | Promise<T>): Promise<T>;
}

export interface ActivityDraft {
  kind: ActivityKind;
  launch: string;
  amount?: bigint;
  sats?: number;
  /** Digest of the record, offer or fill this reports. */
  ref: string;
  txid?: string;
  /** Inline payload. Only valid on `launch`, `offer` and `bid` events — see `ActivityBody`. */
  meta?: string;
}

export async function signActivity(vault: ActivitySigner, draft: ActivityDraft): Promise<SignedActivity> {
  const body: ActivityBody = {
    v: ACTIVITY_VERSION,
    kind: draft.kind,
    launch: draft.launch,
    actor: vault.identity,
    amount: (draft.amount ?? 0n).toString(),
    sats: draft.sats ?? 0,
    ref: draft.ref,
    ...(draft.txid ? { txid: draft.txid } : {}),
    ...(draft.meta ? { meta: draft.meta } : {}),
    at: new Date().toISOString(),
  };

  return vault.use((key) => {
    // The vault's cached identity and the key it holds must agree, or the event
    // would be signed by one identity while naming another.
    if (identityOf(key) !== body.actor) {
      throw new ActivityError("The wallet signed under a different identity than it reported.");
    }
    return { body, signature: bytesToHex(signDigest(key, activityDigest(body))) };
  });
}
