/* Creating, verifying and pricing offers.
 *
 * Pure functions over plain data. The only thing that touches a key is
 * `signOffer`, and it does so inside the vault's `use()` callback like
 * everything else that signs.
 */

import { canonicalDigest, canonicalId, IDENTITY_PATTERN, parseAtoms, TXID_PATTERN, type Field } from "../canonical";
import { identityOf, matchesNetwork, signDigest, verifyDigest, type Vault } from "../bitcoin";
import { bytesToHex, hexToBytes } from "../bytes";
import type { Settlement } from "./settle";
import {
  MarketError,
  OFFER_VERSION,
  type Fill,
  type Offer,
  type OfferStatus,
  type OfferView,
  type SignedOffer,
} from "./types";

function fieldsOf(offer: Offer): Field[] {
  return [
    ["v", offer.version],
    ["launch", offer.launch],
    ["maker", offer.maker],
    ["amount", offer.amount],
    ["priceSats", offer.priceSats],
    ["payTo", offer.payTo],
    ["expiresAt", String(offer.expiresAt)],
    ["salt", offer.salt],
    ["at", offer.at],
  ];
}

export function offerDigest(offer: Offer): Uint8Array {
  return canonicalDigest(fieldsOf(offer));
}

export function offerId(offer: Offer): string {
  return canonicalId(fieldsOf(offer));
}

export interface OfferDraft {
  launch: string;
  amount: bigint;
  priceSats: bigint;
  /** Height after which the offer is void. */
  expiresAt: number;
}

/**
 * Sign an offer.
 *
 * The payment address is the maker's own, taken from the vault rather than
 * supplied: an offer that directs payment somewhere the maker does not control
 * is either a mistake or a theft, and there is no legitimate case for it here.
 */
export async function signOffer(vault: Vault, draft: OfferDraft): Promise<SignedOffer> {
  if (draft.amount <= 0n) throw new MarketError("Offer an amount above zero.");
  if (draft.priceSats <= 0n) throw new MarketError("Set a price above zero.");

  const offer: Offer = {
    version: OFFER_VERSION,
    launch: draft.launch,
    maker: vault.identity,
    amount: draft.amount.toString(),
    priceSats: draft.priceSats.toString(),
    payTo: vault.address,
    expiresAt: draft.expiresAt,
    salt: bytesToHex(crypto.getRandomValues(new Uint8Array(8))),
    at: new Date().toISOString(),
  };

  return vault.use((key) => {
    // The vault's cached identity and the key it actually holds must agree, or
    // the offer would be signed by one identity while naming another.
    if (identityOf(key) !== offer.maker) {
      throw new MarketError("The wallet signed under a different identity than it reported.");
    }
    return { offer, signature: bytesToHex(signDigest(key, offerDigest(offer))) };
  });
}

/** Why an offer is unacceptable, or null when it is well-formed and signed. */
export function faultIn(signed: SignedOffer, launch: string): string | null {
  const { offer, signature } = signed;

  if (offer.version !== OFFER_VERSION) return `Unknown offer version "${offer.version}".`;
  if (offer.launch !== launch) return `This offer is for launch "${offer.launch}".`;
  if (!IDENTITY_PATTERN.test(offer.maker)) return "Malformed maker key.";
  if (!matchesNetwork(offer.payTo)) return "Payment address is for a different network.";
  if (!/^[0-9a-f]{16}$/.test(offer.salt)) return "Malformed salt.";

  try {
    if (parseAtoms(offer.amount) <= 0n) return "Offer has no amount.";
    if (parseAtoms(offer.priceSats, "price") <= 0n) return "Offer has no price.";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }

  if (!Number.isInteger(offer.expiresAt) || offer.expiresAt <= 0) return "Malformed expiry.";
  if (!/^[0-9a-f]{128}$/.test(signature)) return "Malformed signature.";

  if (!verifyDigest(hexToBytes(offer.maker), offerDigest(offer), hexToBytes(signature))) {
    return "Signature does not verify against the stated maker.";
  }
  return null;
}

/** Satoshis per whole token, for a comparable price column. */
export function unitPrice(offer: Offer, decimals: number): number {
  const amount = Number(BigInt(offer.amount)) / 10 ** decimals;
  return amount > 0 ? Number(BigInt(offer.priceSats)) / amount : 0;
}

export interface ViewContext {
  launch: string;
  decimals: number;
  /** Current Bitcoin height, for expiry. */
  tipHeight: number;
  /** Fills recorded locally, by offer id. */
  fills: ReadonlyMap<string, Fill>;
  /**
   * Completed sales, by offer id — payment and delivery both checked against
   * the offer. A set of ids would not be enough: "settled" is a claim about
   * evidence, so the evidence travels with it (AUD-11).
   */
  settled: ReadonlyMap<string, Settlement>;
}

/** Decide an offer's status. The ranking is by counterparty exposure. */
export function viewOffer(signed: SignedOffer, ctx: ViewContext): OfferView {
  const id = offerId(signed.offer);
  const fault = faultIn(signed, ctx.launch);
  const fill = ctx.fills.get(id);
  const settlement = ctx.settled.get(id);

  const status: OfferStatus = fault
    ? "invalid"
    : settlement
      ? "settled"
      : fill
        ? "awaiting-transfer"
        : signed.offer.expiresAt <= ctx.tipHeight
          ? "expired"
          : "open";

  return {
    signed,
    id,
    status,
    ...(fault ? { fault } : {}),
    ...(fill ? { fill } : {}),
    ...(settlement ? { settlement } : {}),
    unitPrice: unitPrice(signed.offer, ctx.decimals),
  };
}

/**
 * The OP_RETURN payload that binds a payment to an offer.
 *
 * Without it, a payment of the right size to the right address is only
 * circumstantial: it could be any transfer, and either side could point at
 * someone else's transaction. With it, the payment names the offer it settles.
 */
export function fillMemo(id: string): Uint8Array {
  const prefix = new TextEncoder().encode("btcfun:f1:");
  // Half the digest is 16 bytes, which fits comfortably and is far beyond what
  // anyone could grind a collision for in the life of an offer.
  const half = hexToBytes(id.slice(0, 32));
  const out = new Uint8Array(prefix.length + half.length);
  out.set(prefix, 0);
  out.set(half, prefix.length);
  return out;
}

/** Validate a fill against the offer it claims to settle. */
export function checkFill(fill: Fill, signed: SignedOffer): string | null {
  if (fill.offerId !== offerId(signed.offer)) return "This payment settles a different offer.";
  if (!TXID_PATTERN.test(fill.txid)) return "Malformed payment txid.";
  if (!IDENTITY_PATTERN.test(fill.taker)) return "Malformed taker key.";
  if (fill.taker === signed.offer.maker) return "The maker cannot fill their own offer.";
  if (BigInt(fill.paidSats) < BigInt(signed.offer.priceSats)) {
    return `Paid ${fill.paidSats} sats against a price of ${signed.offer.priceSats}.`;
  }
  return null;
}
