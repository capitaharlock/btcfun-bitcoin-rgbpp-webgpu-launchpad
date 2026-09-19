/* Where a feed row's claim can be checked.
 *
 * A signed event is a statement, not a receipt (`types.ts`). What makes it
 * checkable is the Bitcoin transaction it names: anyone can open it on the
 * explorer, and a mint's can be re-verified rule by rule on the Proof page.
 * The links never upgrade the event itself — a row stays "signed", whatever
 * the transaction turns out to say.
 */

import { txUrl, type NetworkConfig } from "../bitcoin/network";
import { shortHash } from "../format";
import type { ActivityBody } from "./types";

export interface Evidence {
  /** The Bitcoin transaction the event names, on the explorer. */
  tx: { txid: string; short: string; href: string } | null;
  /** The route that re-checks a mint from both chains; only mints have one. */
  proof: string | null;
}

export function evidenceFor(body: Pick<ActivityBody, "kind" | "txid">, network?: NetworkConfig): Evidence {
  if (!body.txid) return { tx: null, proof: null };
  const txid = body.txid;
  return {
    tx: { txid, short: shortHash(txid, 6, 4), href: txUrl(txid, network) },
    proof: body.kind === "mint" ? `#/proof/${txid}` : null,
  };
}
