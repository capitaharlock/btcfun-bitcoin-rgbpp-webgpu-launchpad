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
 *
 * Unreadable storage is a *state*, not an absence. Swallowing a parse error and
 * returning `[]` made a corrupted chain indistinguishable from a new wallet:
 * the balance read zero, the head read genesis, and the next append would have
 * written a fresh chain over records the owner could not get back. So a fault is
 * carried, every read surfaces it, and nothing overwrites a chain that failed to
 * load until the raw bytes have been handed back for rescue.
 */

import { headOf, recordId } from "./codec";
import { decodeChain } from "./decode";
import { replay, type LaunchRules } from "./rules";
import { LedgerError, type Ledger, type LedgerState, type SignedRecord } from "./types";

const PREFIX = "btcfun:ledger:v1:";

function keyFor(launch: string): string {
  return `${PREFIX}${launch}`;
}

/** What storage held: nothing, a readable chain, or bytes that are not one. */
export type StoredChain =
  | { status: "empty" }
  | { status: "ok"; records: SignedRecord[] }
  | { status: "corrupt"; reason: string; raw: string };

/** Raised when a caller asks for records that could not be read. */
export class CorruptLedger extends LedgerError {
  constructor(
    readonly launch: string,
    readonly reason: string,
    /** Exactly what was in storage, so it can be exported before anything
     *  replaces it. */
    readonly raw: string,
  ) {
    super(
      `The stored chain for "${launch}" could not be read: ${reason}. ` +
        `Export it before resetting — the records may still be recoverable.`,
    );
    this.name = "CorruptLedger";
  }
}

export class LocalLedger implements Ledger {
  constructor(private readonly rules: LaunchRules) {}

  get launch(): string {
    return this.rules.launch;
  }

  /** What is in storage, including the case where it is not a chain. */
  stored(): StoredChain {
    let raw: string | null;
    try {
      raw = localStorage.getItem(keyFor(this.launch));
    } catch (err) {
      // Storage itself can be unavailable — private windows, blocked cookies.
      // That is not corruption, but it is not an empty chain either.
      return { status: "corrupt", reason: describe(err), raw: "" };
    }
    if (raw === null || raw === "") return { status: "empty" };

    try {
      return { status: "ok", records: decodeChain(JSON.parse(raw)) };
    } catch (err) {
      return { status: "corrupt", reason: describe(err), raw };
    }
  }

  /**
   * Every record, oldest first.
   *
   * Throws `CorruptLedger` when storage holds something that is not a chain.
   * Callers that must keep rendering catch it and say so; none of them may
   * quietly treat it as zero.
   */
  records(): SignedRecord[] {
    const stored = this.stored();
    if (stored.status === "corrupt") {
      throw new CorruptLedger(this.launch, stored.reason, stored.raw);
    }
    return stored.status === "ok" ? stored.records : [];
  }

  state(): LedgerState {
    return replay(this.records(), this.rules);
  }

  append(record: SignedRecord): LedgerState {
    // `records()` throws on corruption, so an append can never be the write
    // that destroys an unreadable-but-present chain.
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
   * Exactly what is in storage, readable or not.
   *
   * This is the rescue path: a chain that fails to decode still has bytes, and
   * the owner is entitled to them before anything suggests resetting.
   */
  exportRaw(): string {
    const stored = this.stored();
    if (stored.status === "corrupt") return stored.raw;
    return this.export();
  }

  /**
   * Store an imported chain, if it validates.
   *
   * Never a merge: merging two signed histories needs a rule for which one
   * wins, and that rule is consensus — the thing this layer explicitly does not
   * have. `replace` is for restoring your own backup; `extend` is for receiving
   * from someone else, and accepts only a chain that contains yours.
   */
  import(json: string, policy: ImportPolicy = "replace"): LedgerState {
    const records = decodeChain(parseExport(json, this.launch).records);
    const state = replay(records, this.rules);

    if (policy === "extend") {
      // Receiving is not restoring. Someone handing you a chain can only add to
      // what you hold; a chain that diverges from yours would silently discard
      // your own records, and choosing between two signed histories is
      // consensus — which this layer does not have.
      const mine = this.records();
      const theirs = records.map((r) => recordId(r.body));
      const diverges = mine.some((r, i) => theirs[i] !== recordId(r.body));
      if (diverges || records.length < mine.length) {
        throw new LedgerError(
          `That chain does not extend the one this browser holds for "${this.launch}" — ` +
            `accepting it would discard ${mine.length} of your records. Ask the sender ` +
            `for a chain that includes them.`,
        );
      }
    }

    localStorage.setItem(keyFor(this.launch), JSON.stringify(records));
    return state;
  }
}

/**
 * How an import treats the chain already stored.
 *
 *   replace  restore from your own backup: the file is the truth
 *   extend   receive from someone else: only additions to what you hold
 */
export type ImportPolicy = "replace" | "extend";

/** The launch an exported chain says it belongs to, without trusting the rest. */
export function launchOfExport(json: string): string {
  return parseExport(json).launch;
}

function parseExport(json: string, expected?: string): { launch: string; records: unknown } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new LedgerError("That is not valid JSON.");
  }
  const payload = parsed as { launch?: unknown; records?: unknown };
  if (typeof payload?.launch !== "string" || !Array.isArray(payload.records)) {
    throw new LedgerError("That is not an exported chain — it needs a launch and its records.");
  }
  if (expected !== undefined && payload.launch !== expected) {
    throw new LedgerError(`That chain belongs to launch "${payload.launch}".`);
  }
  return { launch: payload.launch, records: payload.records };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
