/* Local ledger storage.
 *
 * One chain per launch in localStorage. This is the adapter the RGB++ one will
 * replace: it satisfies the `Ledger` port and nothing above it knows where the
 * records live.
 *
 * `append` validates by replaying the whole chain including the new record,
 * which is O(n) per append and entirely fine for a chain a person built by
 * hand. Correctness first: an incremental check would be a second
 * implementation of the rules, and the two would drift.
 */

import { headOf } from "./codec";
import { replay, type LaunchRules } from "./rules";
import { LedgerError, type Ledger, type LedgerState, type SignedRecord } from "./types";

const PREFIX = "btcfun:ledger:v1:";

function keyFor(launch: string): string {
  return `${PREFIX}${launch}`;
}

export class LocalLedger implements Ledger {
  constructor(private readonly rules: LaunchRules) {}

  get launch(): string {
    return this.rules.launch;
  }

  records(): SignedRecord[] {
    try {
      const raw = localStorage.getItem(keyFor(this.launch));
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as SignedRecord[]) : [];
    } catch {
      // Unreadable storage is treated as an empty chain rather than a crash:
      // the records are recoverable from an export, and a corrupt blob must not
      // make the whole app unopenable.
      return [];
    }
  }

  state(): LedgerState {
    return replay(this.records(), this.rules);
  }

  append(record: SignedRecord): LedgerState {
    const next = [...this.records(), record];
    const state = replay(next, this.rules); // throws before anything is written
    localStorage.setItem(keyFor(this.launch), JSON.stringify(next));
    return state;
  }

  clear(): void {
    localStorage.removeItem(keyFor(this.launch));
  }

  /** `prev` for the next record. */
  head(): string {
    return headOf(this.records());
  }

  /** The chain as portable JSON, for handing to someone else. */
  export(): string {
    return JSON.stringify({ launch: this.launch, records: this.records() }, null, 2);
  }

  /**
   * Replace this chain with an imported one, if it validates.
   *
   * Whole-chain replacement rather than a merge: merging two signed histories
   * needs a rule for which one wins, and that rule is consensus — the thing
   * this layer explicitly does not have. The UI says as much.
   */
  import(json: string): LedgerState {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new LedgerError("That is not valid JSON.");
    }
    const payload = parsed as { launch?: unknown; records?: unknown };
    if (payload.launch !== this.launch) {
      throw new LedgerError(`That chain belongs to launch "${String(payload.launch)}".`);
    }
    if (!Array.isArray(payload.records)) {
      throw new LedgerError("That file carries no records array.");
    }
    const records = payload.records as SignedRecord[];
    const state = replay(records, this.rules);
    localStorage.setItem(keyFor(this.launch), JSON.stringify(records));
    return state;
  }
}
