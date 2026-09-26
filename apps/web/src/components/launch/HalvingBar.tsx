/* Where a launch is in its halving schedule: a label, the segmented bar, a
 * ladder of the first halvings and one sentence.
 *
 * The bar is the current halving period filling up, block by block, so every
 * bar in the catalogue means the same thing: how close this launch is to
 * minting half as much. Everything is protocol arithmetic on the tip
 * (`lib/launches/progress.ts`).
 */

import { group } from "../../lib/format";
import { divisorLabel, halvingLabel, ladder, LADDER_RUNGS, periodShare, whereNow, type HalvingPosition } from "../../lib/launches/progress";
import { Meter } from "../../ui/primitives";
import "./halving-bar.css";

export function HalvingBar({
  position,
  accent,
  symbol,
}: {
  /** Null until the Bitcoin tip is known: a position against a placeholder tip would be fiction. */
  position: HalvingPosition | null;
  accent: string;
  symbol: string;
}) {
  if (!position) {
    return (
      <div className="halvingbar" aria-busy="true">
        <span className="hb-label">Halving · reading the Bitcoin tip…</span>
        <div className="hb-track">
          <Meter value={0} color={accent} />
        </div>
        <p className="hb-where">Where {symbol} stands appears once the chain answers.</p>
      </div>
    );
  }
  const rungs = ladder(position);
  const beyond = position.state !== "announced" && position.halving >= LADDER_RUNGS ? position.halving : null;
  return (
    <div className="halvingbar">
      <span className="hb-label">{halvingLabel(position)}</span>
      <div className="hb-track">
        <Meter value={periodShare(position)} color={accent} label={`${symbol}: share of the current halving period behind it`} />
        <ol className="ladder" aria-label={position.state === "announced" ? "Not open yet" : `Halving ${position.halving}`}>
          {rungs.map((rung, k) => (
            <li key={k} className={rung} title={`Halving ${k}: rate ${divisorLabel(k)}`} aria-hidden="true">
              {k}
            </li>
          ))}
          {beyond !== null && (
            <li className="now beyond" title={`Halving ${beyond}: rate ${divisorLabel(beyond)}`} aria-hidden="true">
              {group(beyond)}
            </li>
          )}
        </ol>
      </div>
      <p className="hb-where">{whereNow(position)}</p>
    </div>
  );
}
