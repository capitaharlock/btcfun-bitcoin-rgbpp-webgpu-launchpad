/* A launch, as a box in the catalogue.
 *
 * The box leads with what you can *do* — mine it now, wait for it to open, or
 * look at a finished one — and the one button on it does that. Its frame is
 * the launch's own accent, so the grid is scannable by colour before any word
 * is read. The rate and the countdown are protocol arithmetic on the Bitcoin
 * tip; supply and miner cells are read from CKB (`useLaunchesStats`) and show
 * a dash until they arrive.
 */

import { memo } from "react";

import type { Launch } from "../data/launches";
import type { LaunchStats } from "../hooks/useLaunchStats";
import { atoms, blocksAsTime, compact, group, shortHash } from "../lib/format";
import { DECIMALS, HALVING_BLOCKS, reward } from "../lib/standard";
import { ProjectLinks } from "./PixelIcon";
import { Chip, Meter } from "./primitives";
import { Sigil } from "./Sigil";

export type CardAction = "mine" | "soon" | "view";

const ACTION: Record<CardAction, { label: string; tone: "amber" | "cyan" | undefined }> = {
  mine: { label: "mining now", tone: "amber" },
  soon: { label: "opens soon", tone: "cyan" },
  view: { label: "spent", tone: undefined },
};

export interface TokenCardProps {
  launch: Launch;
  /** Current chain height, for the rate and the countdowns. */
  tip: number;
  /** What CKB says about it, once read. */
  stats?: LaunchStats;
  /** Top of the "hot" ordering: the busiest launch in the public feed. */
  hot?: boolean;
}

export function actionFor(launch: Launch): CardAction {
  if (launch.phase === "announced") return "soon";
  if (launch.phase === "minting") return "mine";
  return "view";
}

export const TokenCard = memo(function TokenCard({ launch, tip, stats, hot }: TokenCardProps) {
  const action = actionFor(launch);
  const meta = ACTION[action];
  const rate24 = launch.open ? reward(24, launch.h0, tip) : reward(24, launch.h0, launch.h0);
  const href = `#/launch/${launch.id}`;
  // How far through the current halving the launch is: the bar empties toward
  // the next halving the way a timer does in a round.
  const epoch = action === "mine" ? launch.blocksToHalving / HALVING_BLOCKS : null;

  return (
    <article className={`tokencard ${action}`} style={{ "--accent": launch.accent } as React.CSSProperties}>
      <header className="tc-head">
        <Sigil seed={launch.id} accent={launch.accent} size="lg" />
        <div className="tc-id">
          <h3 className="tc-sym">
            <a className="tc-link" href={href}>{launch.symbol}</a>
          </h3>
          <div className="tc-name">{launch.name}</div>
        </div>
        <div className="tc-badges">
          <Chip tone={meta.tone} live={action === "mine"}>{meta.label}</Chip>
          {hot && <Chip tone="danger">hot</Chip>}
        </div>
      </header>

      <p className="tc-blurb" title={launch.blurb}>{launch.blurb}</p>

      <dl className="tc-stats">
        <div>
          <dt>24-bit hash</dt>
          <dd className="big" title={`What a 24-bit hash mints on a ticket bought ${launch.open ? "now" : "at opening"}`}>
            {atoms(rate24, DECIMALS, 0)}
          </dd>
        </div>
        <div>
          <dt>{action === "soon" ? "opens in" : action === "mine" ? "halves in" : "halvings"}</dt>
          <dd>
            {action === "view" ? String(launch.halvings ?? 0) : `${group(launch.blocksToHalving)} blk`}
            {action !== "view" && <span className="u">{blocksAsTime(launch.blocksToHalving)}</span>}
          </dd>
        </div>
        <div>
          <dt>minted</dt>
          <dd title="Sum of every live cell of this token on CKB">
            {stats ? compact(stats.supply, DECIMALS) : "—"}
          </dd>
        </div>
        <div>
          <dt>miner cells</dt>
          <dd title="Miner cells on CKB: cells, not people">{stats ? group(stats.minerCells) : "—"}</dd>
        </div>
      </dl>

      {epoch !== null && (
        <Meter value={epoch} color={launch.accent} label={`Blocks left until ${launch.symbol} halves`} />
      )}

      <footer className="tc-foot">
        {Object.keys(launch.links).length > 0 ? (
          <ProjectLinks links={launch.links} symbol={launch.symbol} small />
        ) : (
          <span className="promoter" title={`Promoter: ${launch.promoter}`}>
            promoter {shortHash(launch.promoter, 6, 4)}
          </span>
        )}
        {action === "mine" ? (
          <a className="btn play" href={`${href}/mine`} aria-label={`Mine ${launch.symbol}`}>
            ▶ Mine
          </a>
        ) : (
          <a className="btn" href={href} aria-label={`View ${launch.symbol}`}>
            {action === "soon" ? "Preview" : "View"}
          </a>
        )}
      </footer>
    </article>
  );
});
