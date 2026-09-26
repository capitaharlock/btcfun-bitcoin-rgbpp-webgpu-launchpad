/* Recent trades for one token: sales whose Bitcoin transaction was checked.
 *
 * Each row is a transaction that spent a listed output and paid its seller
 * the listed price (`domain/market/trades.ts`). One not yet in a block is shown as
 * pending, because until then a double spend could still replace it.
 */

import type { MarketTrade } from "@/app/hooks/useMarket";
import { atoms, group, satsPerToken } from "@/ui/format";
import { unitPrice } from "@/domain/market";
import { DECIMALS } from "@/domain/protocol";
import { Chip, More, Panel } from "@/ui/primitives";
import { TxLink } from "@/ui/TxLink";

const SHOWN = 12;

export function Trades({ trades, symbol }: { trades: MarketTrade[]; symbol: string }) {
  return (
    <Panel eyebrow="recent trades" title={`${symbol} sales`}>
      {trades.length === 0 ? (
        <p className="faint clamp">No sales found yet.</p>
      ) : (
        <table className="table" aria-label="Recent trades">
          <thead>
            <tr>
              <th>price</th>
              <th>size</th>
              <th>paid</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trades.slice(0, SHOWN).map((trade) => (
              <tr key={trade.txid}>
                <td className="mono">{satsPerToken(unitPrice(trade))}</td>
                <td className="mono">{atoms(trade.amount, DECIMALS, 2)}</td>
                <td className="mono">{group(trade.priceSats)} sats</td>
                <td>
                  {!trade.confirmed && <Chip tone="warn">pending</Chip>}{" "}
                  <TxLink kind="btc" id={trade.txid} className="tiny">tx ↗</TxLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <More>
        <p>
          A sale is listed here only after its Bitcoin transaction is read and found to pay the seller the listed price for
          the listed output. Sales nobody reported to the index are not found.
        </p>
      </More>
    </Panel>
  );
}
