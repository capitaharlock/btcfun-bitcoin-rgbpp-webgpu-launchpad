/* The offer book.
 *
 * Local storage, per launch, exactly like the ledger — and for the same reason:
 * there is no shared settlement layer to publish to, so an offer reaches a
 * counterparty by being handed over. The book takes pasted offers, verifies
 * them, and keeps the ones that hold up.
 *
 * That is a real limitation, not a placeholder to be quietly swapped for a
 * server. A matching service would be an operator everyone has to trust for
 * completeness — the same thing PROTOCOL.md §2 refused to accept for the
 * admission queue. The honest fix is settlement, task `V3`.
 */

import { MarketError, type Fill, type SignedOffer } from "./types";
import { faultIn, offerId } from "./offers";

const OFFERS_KEY = "btcfun:offers:v1:";
const FILLS_KEY = "btcfun:fills:v1:";

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export class OfferBook {
  constructor(private readonly launch: string) {}

  private get offersKey(): string {
    return `${OFFERS_KEY}${this.launch}`;
  }

  private get fillsKey(): string {
    return `${FILLS_KEY}${this.launch}`;
  }

  offers(): SignedOffer[] {
    return read<SignedOffer>(this.offersKey);
  }

  fills(): Map<string, Fill> {
    return new Map(read<Fill>(this.fillsKey).map((f) => [f.offerId, f]));
  }

  /** Add an offer, rejecting anything that does not verify. */
  add(signed: SignedOffer): void {
    const fault = faultIn(signed, this.launch);
    if (fault) throw new MarketError(fault);

    const id = offerId(signed.offer);
    const existing = this.offers();
    if (existing.some((o) => offerId(o.offer) === id)) {
      throw new MarketError("That offer is already in the book.");
    }
    write(this.offersKey, [...existing, signed]);
  }

  /** Import an offer someone pasted in. Same checks as `add`. */
  addFromJson(json: string): SignedOffer {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new MarketError("That is not valid JSON.");
    }
    const signed = parsed as SignedOffer;
    if (!signed?.offer || typeof signed.signature !== "string") {
      throw new MarketError("That JSON is not a signed offer.");
    }
    this.add(signed);
    return signed;
  }

  remove(id: string): void {
    write(
      this.offersKey,
      this.offers().filter((o) => offerId(o.offer) !== id),
    );
  }

  recordFill(fill: Fill): void {
    const existing = read<Fill>(this.fillsKey).filter((f) => f.offerId !== fill.offerId);
    write(this.fillsKey, [...existing, fill]);
  }

  clear(): void {
    localStorage.removeItem(this.offersKey);
    localStorage.removeItem(this.fillsKey);
  }
}

/** One offer as portable JSON, which is how it reaches a counterparty. */
export function exportOffer(signed: SignedOffer): string {
  return JSON.stringify(signed, null, 2);
}
