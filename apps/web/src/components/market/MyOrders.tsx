/* This wallet's orders across every token: its listings, and its bids with
 * whatever has become of them.
 *
 * An accepted bid is where the bidder's part begins, so it leads, with the
 * purchase one button away. The purchase is the ordinary one: the listing a
 * holder signed for the bid is completed exactly as any listing is.
 */

import { useAction } from "../../hooks/useAction";
import type { OpenListing, PublishedBid } from "../../hooks/useMarket";
import type { MarketActions } from "../../hooks/useMarketActions";
import { atoms, group } from "../../lib/format";
import { DECIMALS } from "../../lib/standard";
import type { Operation } from "../../state/TokensProvider";
import { Chip, Notice, Panel } from "../../ui/primitives";

/** Finished bids kept on screen, newest first. */
const HISTORY = 8;

export function MyOrders({
  listings,
  bids,
  actions,
  onDone,
  onPublished,
}: {
  /** Listings this wallet signed. */
  listings: OpenListing[];
  /** Bids this wallet signed. */
  bids: PublishedBid[];
  actions: MarketActions;
  onDone: (op: Operation) => void;
  onPublished: () => void;
}) {
  const live = bids.filter((b) => b.status.state === "open" || b.status.state === "accepted");
  const accepted = live.filter((b) => b.status.state === "accepted");
  const finished = bids
    .filter((b) => b.status.state === "filled" || b.status.state === "cancelled")
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, HISTORY);

  return (
    <Panel eyebrow="my orders" title="Your listings and bids">
      {accepted.length > 0 && (
        <Notice tone="cyan">
          A seller accepted your bid — complete the purchase below. Until you do, nothing has moved, and anyone else
          could buy that listing first.
        </Notice>
      )}
      {listings.length === 0 && live.length === 0 && finished.length === 0 ? (
        <p className="faint clamp">You have no open listings or bids.</p>
      ) : (
        <div className={`orders${accepted.length > 0 ? " after-notice" : ""}`}>
          {[...accepted, ...live.filter((b) => b.status.state === "open"), ...finished].map((item) => (
            <BidOrder key={item.id} item={item} actions={actions} onDone={onDone} onPublished={onPublished} />
          ))}
          {listings.map((item) => (
            <AskOrder key={item.offerId} item={item} actions={actions} onDone={onDone} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function Terms({ side, symbol, amount, sats }: { side: "bid" | "ask"; symbol: string; amount: bigint; sats: number }) {
  return (
    <>
      <Chip tone={side === "bid" ? "cyan" : "violet"}>{side}</Chip>
      <span className="what">
        {atoms(amount, DECIMALS, 2)} {symbol} for {group(sats)} sats
      </span>
      <span className="spacer" />
    </>
  );
}

function BidOrder({
  item,
  actions,
  onDone,
  onPublished,
}: {
  item: PublishedBid;
  actions: MarketActions;
  onDone: (op: Operation) => void;
  onPublished: () => void;
}) {
  const { busy, error, run } = useAction();
  const { bid, launch, status } = item;

  const complete = async (listing: OpenListing) => {
    const op = await run(() => actions.buy(listing));
    if (op) onDone(op);
  };
  const withdraw = async () => {
    if ((await run(() => actions.cancelBid(item))) !== null) onPublished();
  };

  return (
    <div className="order-row" role="group" aria-label={`Your bid for ${launch.symbol}`}>
      <Terms side="bid" symbol={launch.symbol} amount={BigInt(bid.amount)} sats={bid.priceSats} />
      {status.state === "filled" && <Chip tone="ok">filled{status.trade.confirmed ? "" : " · confirming"}</Chip>}
      {status.state === "cancelled" && <Chip>withdrawn</Chip>}
      {status.state === "open" && <Chip>waiting for a seller</Chip>}
      {status.state === "accepted" && (
        <button className="btn primary" disabled={busy} onClick={() => void complete(status.listing)}>
          {busy ? "Signing…" : "Complete purchase"}
        </button>
      )}
      {(status.state === "open" || status.state === "accepted") && (
        <button className="btn ghost" disabled={busy} onClick={() => void withdraw()}>Withdraw bid</button>
      )}
      {error && <div className="error-text full">{error}</div>}
    </div>
  );
}

function AskOrder({ item, actions, onDone }: { item: OpenListing; actions: MarketActions; onDone: (op: Operation) => void }) {
  const { busy, error, run } = useAction();
  const { listing, launch } = item;

  const cancel = async () => {
    const op = await run(() => actions.cancelListing(item));
    if (op) onDone(op);
  };

  return (
    <div className="order-row" role="group" aria-label={`Your listing of ${launch.symbol}`}>
      <Terms side="ask" symbol={launch.symbol} amount={BigInt(listing.amount)} sats={listing.priceSats} />
      {listing.bid && <Chip tone="cyan">for a bid</Chip>}
      <button className="btn ghost" disabled={busy} onClick={() => void cancel()}>{busy ? "…" : "Cancel listing"}</button>
      {error && <div className="error-text full">{error}</div>}
    </div>
  );
}
