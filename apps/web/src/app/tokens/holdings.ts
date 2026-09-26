/* What this wallet holds on chain, decoded from what the gateway reports.
 *
 * The gateway lists every RGB++ cell sealed to the wallet's outputs with raw
 * script fields; this sorts them into this app's two kinds by type script and
 * decodes their data. A cell of another type, or one whose lock is not an
 * RGB++ seal, is not the wallet's business here and is left out.
 */

import { decodeAmount, decodeMinerCell, sealFromArgs } from "@/domain/rgbpp";
import type { MinerCell, RgbppConfig, TokenCell } from "@/domain/rgbpp";
import type { RgbppCell } from "@/ports";

export interface Holdings {
  /** Miner cells, by mint script hash. */
  miners: Map<string, MinerCell[]>;
  /** Token cells, by xUDT type hash. */
  tokens: Map<string, TokenCell[]>;
}

export function groupCells(config: RgbppConfig, cells: readonly RgbppCell[]): Holdings {
  const holdings: Holdings = { miners: new Map(), tokens: new Map() };
  for (const cell of cells) {
    const type = cell.cellOutput.type;
    if (!type || !cell.typeHash) continue;
    let seal;
    try {
      seal = sealFromArgs(cell.cellOutput.lock.args);
    } catch {
      continue;
    }
    const base = {
      outPoint: { txHash: cell.outPoint.txHash, index: Number(cell.outPoint.index) },
      capacity: BigInt(cell.cellOutput.capacity),
      seal,
    };
    if (type.codeHash === config.mint.codeHash && type.hashType === config.mint.hashType) {
      const data = decodeMinerCell(cell.data);
      if (!data) continue;
      push(holdings.miners, cell.typeHash, { ...base, data });
    } else if (type.codeHash === config.xudt.codeHash && type.hashType === config.xudt.hashType) {
      push(holdings.tokens, cell.typeHash, { ...base, amount: decodeAmount(cell.data) });
    }
  }
  return holdings;
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  map.set(key, [...(map.get(key) ?? []), value]);
}
