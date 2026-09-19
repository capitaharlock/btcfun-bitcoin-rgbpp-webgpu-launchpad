/* Open listings, each one buyable alone.
 *
 * A listing is a seller-signed half of a Bitcoin transaction (`lib/rgbpp/
 * sale.ts`). Buying completes it: one transaction pays the seller and moves
 * the tokens to the buyer, and the seller does not need to be online.
 */

import { useAction } from "../../hooks/useAction";
import { asOrder, type OpenListing } from "../../hooks/useMarket";
import type { MarketActions } from "../../hooks/useMarketActions";
import { atoms, group, satsPerToken, shortHash } from "../../lib/format";
import { unitPrice } from "../../lib/market/book";
import { DECIMALS } from "../../lib/standard";
import type { Operation } from "../../state/TokensProvider";
import { Chip, More, Panel } from "../../ui/primitives";
import { TokenImage } from "../../ui/TokenImage";

export function Listings({
  listings,
  loading,
  me,
  actions,
  onDone,
}: {
  listings: OpenListing[];
  loading: boolean;
  /** This wallet's identity, or null without one. */
  me: string | null;
  actions: MarketActions;
  onDone: (op: Operation) => void;
}) {
  return (
    <Panel eyebrow="open listings" title="Buy">
      {loading ? (
        <p className="faint clamp">Reading listings and checking each against the chain…</p>
      ) : listings.length === 0 ? (
        <p className="clamp">No open listings. Every listing here has been checked live on CKB and Bitcoin.</p>
      ) : (
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>token</th>
                <th>amount</th>
                <th>price</th>
                <th>per token</th>
                <th>seller</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {listings.map((item) => (
                <ListingRow
                  key={`${item.listing.outPoint.txHash}:${item.listing.outPoint.index}`}
                  item={item}
                  me={me}
                  actions={actions}
                  onDone={onDone}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <More>
        <p>
          Buying signs one Bitcoin transaction that pays the seller and moves the tokens to you. If someone buys first, your
          transaction is simply rejected and costs nothing.
        </p>
      </More>
    </Panel>
  );
}

function ListingRow({
  item,
  me,
  actions,
  onDone,
}: {
  item: OpenListing;
  me: string | null;
  actions: MarketActions;
  onDone: (op: Operation) => void;
}) {
  const { busy, error, run } = useAction();
  const { listing, launch } = item;
  const own = item.seller === me;
  const act = async (action: () => Promise<Operation>) => {
    const op = await run(action);
    if (op) onDone(op);
  };

  return (
    <tr>
      <td>
        <span className="row">
          <TokenImage art={launch.art} seed={launch.id} accent={launch.accent} symbol={launch.symbol} size="md" still />
          <a href={`#/launch/${launch.id}`}>{launch.symbol}</a>
          {listing.bid && <Chip tone="cyan">for a bid</Chip>}
        </span>
      </td>
      <td className="mono">{atoms(BigInt(listing.amount), DECIMALS, 2)}</td>
      <td className="mono">{group(listing.priceSats)} sats</td>
      <td className="mono">{satsPerToken(unitPrice(asOrder(listing)))} sats</td>
      <td className="mono">{shortHash(listing.seller, 8, 4)}</td>
      <td>
        {own ? (
          <button className="btn ghost" disabled={busy} onClick={() => void act(() => actions.cancelListing(item))}>
            {busy ? "…" : "Cancel"}
          </button>
        ) : (
          <button className="btn primary" disabled={busy || me === null} onClick={() => void act(() => actions.buy(item))}>
            {busy ? "Signing…" : "Buy"}
          </button>
        )}
        {error && <div className="error-text">{error}</div>}
      </td>
    </tr>
  );
}
