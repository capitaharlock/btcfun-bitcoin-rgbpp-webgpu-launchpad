/* CKB reads through CCC's client, as the `CkbCells` port.
 *
 * Plain JSON-RPC over HTTP to a node with the indexer enabled. One instance
 * for the whole app, so its cache is shared, and one configurable URL, so a
 * reader can point it at a node they run — the figures on a launch page and
 * the verdicts on the proof page are only as independent as this endpoint.
 */

import { ccc } from "@ckb-ccc/core";

import type { CkbCells } from "@/ports";

export class CkbClient implements CkbCells {
  private readonly client: ccc.Client;

  constructor(rpcUrl: string) {
    this.client = new ccc.ClientPublicTestnet({ url: rpcUrl, fallbacks: [rpcUrl] });
  }

  async liveCell(outPoint: ccc.OutPointLike): Promise<ccc.Cell | null> {
    return (await this.client.getCellLive(outPoint, true)) ?? null;
  }

  async cell(outPoint: ccc.OutPointLike): Promise<ccc.Cell | null> {
    return (await this.client.getCell(outPoint)) ?? null;
  }

  cellsByType(type: ccc.ScriptLike): AsyncIterable<ccc.Cell> {
    return this.client.findCellsByType(type, true);
  }

  async transaction(hash: ccc.HexLike): Promise<ccc.Transaction | null> {
    return (await this.client.getTransaction(hash))?.transaction ?? null;
  }
}

export function ckbCells(rpcUrl: string): CkbCells {
  return new CkbClient(rpcUrl);
}
