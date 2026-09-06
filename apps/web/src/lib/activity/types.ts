/* Public activity: the shared, signed record of what people did.
 *
 * Everything else in this app is private to one browser. This is the one layer
 * that is meant to be shared, so it is the one layer that needs a server — and
 * the server's job is deliberately narrow: it is an *index*, never an authority.
 * It accepts a signed event, checks the signature, stores it, and hands it back.
 * It cannot forge an event, alter one, or make an invalid claim look valid,
 * because every consumer re-verifies. That is the same posture PROTOCOL.md §2
 * takes toward the admission queue: an operator may publish, never decide.
 *
 * An event does not restate what it refers to. It carries a reference digest —
 * the ledger record's id, the offer's id — so the feed can never disagree with
 * the thing it is reporting. The worst a bad index can do is omit, and omission
 * is visible to anyone holding their own copy.
 */

export const ACTIVITY_VERSION = "btcfun/activity/1";

export type ActivityKind = "launch" | "mint" | "offer" | "fill" | "transfer";

export interface ActivityBody {
  v: typeof ACTIVITY_VERSION;
  kind: ActivityKind;
  /** Launch this concerns. */
  launch: string;
  /** Who did it: compressed public key hex. */
  actor: string;
  /** Token atoms involved, decimal. "0" where the event is not about tokens. */
  amount: string;
  /** Satoshis involved. 0 where the event is not about money. */
  sats: number;
  /** Digest of the record, offer or fill this reports. Never restated inline. */
  ref: string;
  /** Bitcoin txid, when the event has one. */
  txid?: string;
  /**
   * Canonical JSON payload, for events that *are* the record rather than
   * reporting one.
   *
   * Only `launch` uses it. A mint or a transfer points at a ledger record that
   * already exists, so restating it here could only create a disagreement; a
   * launch has no prior record — its creation is the record — so the spec is
   * carried inline, signed with everything else. Capped, because the index
   * should never become a general-purpose store.
   */
  meta?: string;
  /** Author's clock. Display only — the index keeps its own arrival time. */
  at: string;
}

export interface SignedActivity {
  body: ActivityBody;
  /** Compact 64-byte ECDSA over the event digest, hex. */
  signature: string;
}

/** An event as the index returns it: the signed object plus arrival time. */
export interface ActivityEntry {
  id: string;
  signed: SignedActivity;
  /** Unix seconds when the index accepted it. Not authoritative, just ordering. */
  receivedAt: number;
  /** False when the signature did not verify on this client. */
  verified: boolean;
}

export class ActivityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivityError";
  }
}

/** Human phrasing per kind. One place, so the feed and the toasts agree. */
export const KIND_LABEL: Record<ActivityKind, string> = {
  launch: "launched",
  mint: "mined",
  offer: "listed",
  fill: "bought",
  transfer: "sent",
};
