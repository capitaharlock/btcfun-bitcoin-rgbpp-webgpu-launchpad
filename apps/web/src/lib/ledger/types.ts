/* Token ledger: records, balances and the port behind them.
 *
 * WHAT THIS IS, PRECISELY. A hash-chained log of records, each signed by the
 * secp256k1 key that authorises it. Ownership and every transfer are real
 * cryptographic facts: nobody can move tokens they do not hold, and any third
 * party can replay the chain and reach the same balances.
 *
 * WHAT THIS IS NOT. Settlement. There is no consensus over which chain is *the*
 * chain, so two conflicting histories are equally valid to a verifier, and
 * nothing here is anchored to Bitcoin or CKB. PROTOCOL.md §2 lists trustless
 * settlement among the withdrawn claims; the Proof Explorer says so per record.
 *
 * The port exists because that boundary is the thing meant to move: an RGB++
 * adapter replaces `LocalLedger` without changing a caller, and the records
 * are already shaped to be what a Cell would carry.
 *
 * Amounts are token atoms as decimal strings. Strings, not bigint, because a
 * record is JSON that must survive localStorage, export, import and a signature
 * check byte-for-byte; `JSON.stringify` cannot represent a bigint at all.
 */

/** Fields every record carries, whatever its kind. */
export interface RecordEnvelope {
  /** Position in the chain, starting at 0. */
  seq: number;
  /** Digest of record `seq - 1`, or 64 zeros for the first. */
  prev: string;
  /** Wall clock at authoring. Informational: no rule may depend on it. */
  at: string;
  /** Launch this record belongs to. One chain per launch. */
  launch: string;
  /** Compressed public key of the signer, hex. */
  author: string;
}

/** Tokens minted by proof of work against an epoch challenge. */
export interface ClaimRecord extends RecordEnvelope {
  kind: "claim";
  epoch: number;
  /**
   * Hash of the Bitcoin block that opened this epoch.
   *
   * The challenge digest is *derived* from this plus the launch, epoch, ticket
   * and author rather than stored, so a record cannot carry a challenge that
   * contradicts the fields it claims to bind (PROTOCOL.md §4.2).
   */
  btcBlockHash: string;
  /** Winning nonce, decimal. */
  nonce: string;
  /** Leading zero bits of the candidate digest. */
  clz: number;
  /** Atoms minted, decimal. Must equal what the allocation rule computes. */
  amount: string;
  /** Bitcoin txid of the ticket payment that admitted this claim. */
  ticket: string;
  /** Satoshis that payment added to the reserve. */
  ticketSats: number;
}

/** Tokens moved from the author to another identity. */
export interface TransferRecord extends RecordEnvelope {
  kind: "transfer";
  /** Recipient's compressed public key, hex. */
  to: string;
  /** Atoms moved, decimal. */
  amount: string;
  /** Free-text note, at most 120 characters. Never affects validation. */
  memo?: string;
}

export type LedgerBody = ClaimRecord | TransferRecord;

/** A record plus its signature. The digest is derived, never stored. */
export interface SignedRecord<T extends LedgerBody = LedgerBody> {
  body: T;
  /** Compact 64-byte ECDSA signature over the record digest, hex. */
  signature: string;
}

export type RecordKind = LedgerBody["kind"];

/** Ledger state after replaying a chain. */
export interface LedgerState {
  launch: string;
  /** Atoms held, by identity (compressed public key hex). */
  balances: ReadonlyMap<string, bigint>;
  /** Total atoms ever minted on this chain. */
  supply: bigint;
  /** Satoshis contributed to the reserve by admitted tickets. */
  reserveSats: number;
  /** Digest of the last record, or 64 zeros for an empty chain. */
  head: string;
  /** Number of records replayed. */
  length: number;
  /** Ticket txids already spent, so one payment admits one claim. */
  spentTickets: ReadonlySet<string>;
}

/** Storage and append for one launch's chain. */
export interface Ledger {
  readonly launch: string;
  /** Every record, oldest first. */
  records(): SignedRecord[];
  /** Replay and validate from genesis. Throws `LedgerError` on the first fault. */
  state(): LedgerState;
  /** Validate and append. Rejects anything `state()` would later refuse. */
  append(record: SignedRecord): LedgerState;
  /** Remove every record for this launch. Used by "reset demo data". */
  clear(): void;
}

export class LedgerError extends Error {
  constructor(
    message: string,
    /** Position of the offending record, when one is identifiable. */
    readonly seq?: number,
  ) {
    super(message);
    this.name = "LedgerError";
  }
}

/** The `prev` of the first record in a chain. */
export const GENESIS_PREV = "0".repeat(64);

/** Token atoms are 8-decimal, matching the emission schedule's candidate. */
export const TOKEN_DECIMALS = 8;
