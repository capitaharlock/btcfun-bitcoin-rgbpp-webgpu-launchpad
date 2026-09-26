/* The one CKB client the app reads through.
 *
 * Plain JSON-RPC over HTTP to a node with the indexer enabled. One instance for
 * the whole app, so its cache is shared, and one configurable URL, so a reader
 * can point it at a node they run — the figures on a launch page and the
 * verdicts on the proof page are only as independent as this endpoint.
 */

import { ccc } from "@ckb-ccc/core";

import { ACTIVE_RGBPP } from "@/domain/rgbpp";

let client: ccc.Client | null = null;

export function ckbClient(): ccc.Client {
  client ??= new ccc.ClientPublicTestnet({ url: ACTIVE_RGBPP.ckbRpc, fallbacks: [ACTIVE_RGBPP.ckbRpc] });
  return client;
}
