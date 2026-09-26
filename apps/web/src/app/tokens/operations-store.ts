/* Where a wallet's operations are kept: per address, on the device.
 *
 * Keyed by address rather than by vault, so the operations of a wallet that
 * is logged out and opened again are still there to guard its seals. The
 * newest hundred are kept; older ones are in the chain and the activity feed.
 */

import type { DeviceStore } from "@/ports";
import type { Operation } from "./operations";

const OPS_KEY = "btcfun:operations:v1";
const KEEP = 100;

export interface OperationsStore {
  /** The address's operations, newest first. Empty when none or unreadable. */
  read(address: string): Operation[];
  write(address: string, ops: readonly Operation[]): void;
}

export function operationsStore(store: DeviceStore): OperationsStore {
  const all = (): Record<string, Operation[]> => {
    try {
      const parsed: unknown = JSON.parse(store.read(OPS_KEY) ?? "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, Operation[]>) : {};
    } catch {
      return {};
    }
  };
  return {
    read(address) {
      const ops = all()[address];
      return Array.isArray(ops) ? ops : [];
    },
    write(address, ops) {
      // Storage blocked: operations still show for this session.
      store.write(OPS_KEY, JSON.stringify({ ...all(), [address]: ops.slice(0, KEEP) }));
    },
  };
}
