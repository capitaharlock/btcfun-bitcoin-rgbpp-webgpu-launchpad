/* Public activity: the shared, signed record of what people *say* they did.
 *
 * Everything else in this app is private to one browser. This is the one layer
 * that is meant to be shared, so it is the one layer that needs a server — and
 * the server's job is deliberately narrow: it is an *index*, never an authority.
 * It accepts a signed event, checks the signature, stores it, and hands it back.
 * It cannot forge an event or alter one, because every consumer re-verifies.
 * That is the same posture PROTOCOL.md §2 takes toward the admission queue: an
 * operator may publish, never decide.
 *
 * WHAT A SIGNATURE HERE PROVES, AND WHAT IT DOES NOT. It proves the stated
 * actor composed these bytes. It does not prove the mint, purchase or transfer
 * the bytes describe ever happened: an actor can sign a truthful statement or a
 * false one with equal ease, and this layer cannot tell them apart. It holds no
 * ledger to replay the mint against, no chain to confirm the payment on, and no
 * way to know whether the referenced record exists (AUD-06).
 *
 * So these events are *declared*, not verified, and the distinction is carried
 * in the vocabulary: an entry is `authentic`, never "verified" or "confirmed".
 * They are for discovery — seeing that other people exist and what they say
 * they are doing. They must never be totalled into a supply, a volume or a
 * trading history, because a single actor can sign as many as they like. The
 * ledger and the chain are where those numbers come from.
 *
 * An event does not restate what it refers to. It carries a reference digest —
 * the ledger record's id, the offer's id — so anyone holding the underlying
 * object can check the two agree. The worst a bad index can do is omit, and
 * omission is visible to anyone holding their own copy.
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
  /**
   * The stated actor's signature covers these bytes, checked on this client.
   *
   * Deliberately not called `verified`: it says the message is genuine, not
   * that the event it describes occurred. Nothing in this layer can say that.
   */
  authentic: boolean;
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
