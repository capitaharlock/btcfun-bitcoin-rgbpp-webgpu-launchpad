/* What a launch earns, beside the income step's address.
 *
 * Every figure is a protocol constant (`lib/standard.ts`); the only thing the
 * creator picks is an illustrative pace of tickets, and the card says it is
 * illustrative.
 */

import { useState } from "react";

import { atoms, btc, group } from "../../lib/format";
import { REGISTRATION_SATS } from "../../lib/launches/certificate";
import { DECIMALS, HALVING_BLOCKS, MIN_CLZ, NEW_CELL, PLATFORM_PERCENT, REUSE, reward, TICKET_SATS } from "../../lib/standard";

const TICKET_PACES = [10, 50, 200, 1000] as const;

/**
 * The part creators care about most, in plain numbers: what one ticket pays
 * them, what a pace of tickets comes to, and the rules they do not choose.
 * The range is honest about the one variable: a miner's first two tickets on
 * a launch pay the promoter less, because they also pay for the miner's cell.
 */
export function Earnings() {
  const [pace, setPace] = useState<number>(50);
  const low = pace * NEW_CELL.promoter;
  const high = pace * REUSE.promoter;
  return (
    <section className="cr-earn" aria-label="What your launch earns">
      <h3>What your launch earns</h3>
      <div className="cr-earn-grid">
        <div className="cr-card big">
          <div className="k">you earn per ticket</div>
          <div className="v amber">{group(REUSE.promoter)} <span className="u">sats</span></div>
          <p className="tiny faint">
            {group(NEW_CELL.promoter)} sats on a miner's first two tickets, which also pay {group(NEW_CELL.paymaster)} for
            their cell. Straight to your address, in the ticket itself.
          </p>
        </div>

        <div className="cr-card calc">
          <div className="k">if miners buy</div>
          <div className="cr-paces" role="radiogroup" aria-label="Tickets a day">
            {TICKET_PACES.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={pace === n} className={pace === n ? "on" : ""} onClick={() => setPace(n)}>
                {group(n)}/day
              </button>
            ))}
          </div>
          <div className="v">{btc(low)}–{btc(high)} <span className="u">BTC/day</span></div>
          <p className="tiny faint">
            {btc(low * 7)}–{btc(high * 7)} BTC a week. Illustrative: income is only what miners choose to pay.
          </p>
        </div>
      </div>

      <dl className="cr-rules">
        <div>
          <dt>Registration</dt>
          <dd>{group(REGISTRATION_SATS)} sats, once</dd>
        </div>
        <div>
          <dt>Ticket</dt>
          <dd>{group(TICKET_SATS)} sats, fixed · {PLATFORM_PERCENT} % platform</dd>
        </div>
        <div>
          <dt>Reward</dt>
          <dd>1 token × clz² ÷ 2<sup>halvings</sup>, from {MIN_CLZ} zero bits; halving every {group(HALVING_BLOCKS)} blocks</dd>
        </div>
        <div>
          <dt>A 24-bit hash, first week</dt>
          <dd>{atoms(reward(24, 0, 0), DECIMALS, 0)} tokens</dd>
        </div>
      </dl>
    </section>
  );
}
