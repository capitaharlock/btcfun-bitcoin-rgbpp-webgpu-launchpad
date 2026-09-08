/* What counts as an offer having been settled.
 *
 * "Settled" is the only status in this module that tells a taker their exposure
 * ended, so it is the one that has to be earned. It used to be inferred from a
 * memo alone: any transfer whose memo started with an offer id marked that offer
 * settled, whatever it moved and to whom. A one-atom transfer closed a
 * hundred-atom sale, and no payment had to exist at all.
 *
 * A settlement is a join across both legs, and every field of both has to agree:
 *
 *   the offer     — who owes what, to which launch, at what price
 *   the fill      — the Bitcoin payment, naming the taker and the amount paid
 *   the transfer  — the ledger record, from the maker, to that taker, for at
 *                   least the offered quantity, on that launch, memo-bound to
 *                   the offer's full id
 *
 * The memo carries the whole 64-character digest rather than a prefix. A prefix
 * is a truncated commitment: it invites exactly the class of confusion this
 * finding is about, and at 70 characters the full id is well inside the memo
 * budget, so there was never anything to gain from shortening it.
 *
 * None of this makes the swap atomic. The taker still pays before the maker
 * signs, and a maker who never signs keeps both sides — that is PROTOCOL.md §5.1
 * and task V3, and no amount of checking here substitutes for it. What this does
 * guarantee is that the word "settled" is never shown for something that did not
 * happen.
 */

import { MAX_MEMO_CHARS, type SignedRecord, type TransferRecord } from "../ledger/types";
import { checkFill, offerId } from "./offers";
import type { Fill, SignedOffer } from "./types";

const MEMO_PREFIX = "offer:";

/** The memo a maker puts on the settling transfer, so anyone can match it. */
export function settlementMemo(id: string): string {
  const memo = `${MEMO_PREFIX}${id}`;
  if (memo.length > MAX_MEMO_CHARS) {
    throw new RangeError(`settlement memo does not fit in ${MAX_MEMO_CHARS} characters`);
  }
  return memo;
}

/** The offer id a memo names, or null when it names none. */
export function offerIdInMemo(memo: string | undefined): string | null {
  if (!memo?.startsWith(MEMO_PREFIX)) return null;
  const id = memo.slice(MEMO_PREFIX.length);
  return /^[0-9a-f]{64}$/.test(id) ? id : null;
}

/** Both legs of a completed sale, kept together so a UI can show the evidence. */
export interface Settlement {
  offerId: string;
  /** The Bitcoin payment that admitted it. */
  fill: Fill;
  /** The ledger record that delivered the tokens. */
  record: SignedRecord<TransferRecord>;
}

/**
 * Why this transfer does not settle this offer, or null when it does.
 *
 * Returns a reason rather than a boolean: a near-miss — right offer, wrong
 * amount — is something the maker and the taker both need to be told, not
 * something to hide behind a status that stays "awaiting".
 */
export function settlementFault(
  record: SignedRecord<TransferRecord>,
  signed: SignedOffer,
  fill: Fill | undefined,
): string | null {
  const { offer } = signed;
  const id = offerId(offer);
  const transfer = record.body;

  if (offerIdInMemo(transfer.memo) !== id) return "This transfer does not name that offer.";
  if (transfer.launch !== offer.launch) return "This transfer is on a different launch.";
  if (transfer.author !== offer.maker) return "This transfer is not from the maker.";

  if (!fill) return "No payment has been recorded for this offer.";
  const fault = checkFill(fill, signed);
  if (fault) return fault;

  if (transfer.to !== fill.taker) return "This transfer does not go to the taker who paid.";

  const delivered = BigInt(transfer.amount);
  const owed = BigInt(offer.amount);
  if (delivered < owed) {
    return `This transfer delivers ${delivered} atoms against ${owed} offered.`;
  }

  return null;
}

/**
 * Every offer in `offers` that a record in `records` actually settled.
 *
 * Scans the memos once and checks only the offer each one names, so the cost is
 * linear in records rather than records × offers.
 */
export function settlementsIn(
  records: readonly SignedRecord[],
  offers: readonly SignedOffer[],
  fills: ReadonlyMap<string, Fill>,
): Map<string, Settlement> {
  const byId = new Map<string, SignedOffer>();
  for (const signed of offers) byId.set(offerId(signed.offer), signed);

  const settled = new Map<string, Settlement>();
  for (const record of records) {
    if (record.body.kind !== "transfer") continue;
    const transfer = record as SignedRecord<TransferRecord>;

    const id = offerIdInMemo(transfer.body.memo);
    if (id === null || settled.has(id)) continue;

    const signed = byId.get(id);
    if (!signed) continue;

    const fill = fills.get(id);
    if (settlementFault(transfer, signed, fill) !== null) continue;

    // `fill` is defined: `settlementFault` returns a reason when it is not.
    settled.set(id, { offerId: id, fill: fill as Fill, record: transfer });
  }
  return settled;
}
