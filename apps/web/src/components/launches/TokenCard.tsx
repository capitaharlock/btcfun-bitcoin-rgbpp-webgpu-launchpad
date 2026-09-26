/* A launch, as a box in the catalogue.
 *
 * The box leads with the token's picture, then what you can *do* — mine it
 * now, wait for it to open, or look at a finished one — and the one button on
 * it does that. Under the name, the halving bar says where the launch is in
 * its schedule and what happens next. The frame is the launch's own accent, so
 * the grid is scannable by colour before any word is read.
 *
 * A real launch links to its page, its project and the explorers that show it
 * on chain; supply and miner cells are read from CKB (`useLaunchesStats`) and
 * show a dash until they arrive. A simulated example (`data/showcase.ts`) is
 * badged as such, carries its own illustrative figures, and has every link and
 * its MINE button switched off: there is nothing on chain behind it.
 */

import { memo } from "react";

import type { CatalogueEntry } from "../../data/showcase";
import type { LaunchStats } from "../../hooks/useLaunchStats";
import { atoms, compact, group } from "../../lib/format";
import { DECIMALS, reward } from "../../lib/standard";
import { HalvingBar } from "../launch/HalvingBar";
import { ExplorerLinks, launchExplorers, offExplorers, ProjectLinks } from "../launch/Links";
import { Chip } from "../../ui/primitives";
import { TokenImage } from "../../ui/TokenImage";
import "./launches.css";

export type CardAction = "mine" | "soon" | "view";

const ACTION: Record<CardAction, { label: string; tone: "amber" | "cyan" | undefined }> = {
  mine: { label: "mining now", tone: "amber" },
  soon: { label: "opens soon", tone: "cyan" },
  view: { label: "spent", tone: undefined },
};

export interface TokenCardProps {
  entry: CatalogueEntry;
  /** Current chain height, for the rate and the countdowns. */
  tip: number;
  /** False while `tip` is still a placeholder. Examples are placed relative to it, so they need no real tip. */
  synced: boolean;
  /** What CKB says about a real launch, once read. */
  stats?: LaunchStats;
  /** Top of the "hot" ordering: the busiest launch in the public feed. */
  hot?: boolean;
  /** The launch a newcomer should start with: drawn larger, first, with a lit MINE. */
  featured?: boolean;
  /** What a simulated box points to instead of itself: the featured launch's symbol, when there is one. */
  mintInstead?: string;
}

export function actionFor(entry: Pick<CatalogueEntry, "phase">): CardAction {
  if (entry.phase === "announced") return "soon";
  if (entry.phase === "minting") return "mine";
  return "view";
}

export const TokenCard = memo(function TokenCard({ entry, tip, synced, stats, hot, featured, mintInstead }: TokenCardProps) {
  const action = actionFor(entry);
  const meta = ACTION[action];
  const simulated = entry.source === "simulated";
  const placed = simulated || synced;
  const rate24 = entry.open ? reward(24, entry.h0, tip) : reward(24, entry.h0, entry.h0);
  const supply = simulated ? entry.supply : stats?.supply;
  const minerCells = simulated ? entry.minerCells : stats?.minerCells;
  const href = `#/launch/${entry.id}`;
  const exampleNote = `Example data — mint ${mintInstead ? `the ${mintInstead} token` : "a live launch"}`;

  return (
    <article
      className={`tokencard ${action}${simulated ? " simulated" : ""}${featured ? " featured" : ""}`}
      style={{ "--accent": entry.accent } as React.CSSProperties}
    >
      <div className="tc-hero">
        <TokenImage art={entry.art} seed={entry.id} accent={entry.accent} symbol={entry.symbol} size="xl" />
        {featured && <span className="tc-ribbon">Start here</span>}
        {simulated && (
          <span className="tc-ribbon sim" title="An example of a launch further along. Not on chain.">
            Simulated
          </span>
        )}
      </div>

      <div className="tc-body">
        <header className="tc-head">
          <div className="tc-id">
            <h3 className="tc-sym">
              {simulated ? entry.symbol : <a className="tc-link" href={href}>{entry.symbol}</a>}
            </h3>
            <div className="tc-name">{entry.name}</div>
          </div>
          <div className="tc-badges">
            {placed ? (
              <Chip tone={meta.tone} live={action === "mine" && !simulated}>{meta.label}</Chip>
            ) : (
              <Chip live>reading chain</Chip>
            )}
            {hot && <Chip tone="danger">hot</Chip>}
          </div>
        </header>

        <p className="tc-blurb" title={entry.blurb}>{entry.blurb}</p>

        <HalvingBar position={placed ? entry.position : null} accent={entry.accent} symbol={entry.symbol} />

        <dl className="tc-stats">
          <div>
            <dt>24-bit hash</dt>
            <dd className="big" title={`What a 24-bit hash mints on a ticket bought ${entry.open ? "now" : "at opening"}`}>
              {atoms(rate24, DECIMALS, rate24 < 10n ** BigInt(DECIMALS) ? 2 : 0)}
            </dd>
          </div>
          <div>
            <dt>minted</dt>
            <dd title={simulated ? "Illustrative: the sum of this example's mints at the standard reward" : "Sum of every live cell of this token on CKB"}>
              {supply === undefined ? "—" : compact(supply, DECIMALS)}
            </dd>
          </div>
          <div>
            <dt>miner cells</dt>
            <dd title={simulated ? "Illustrative" : "Miner cells on CKB: cells, not people"}>
              {minerCells === undefined ? "—" : group(minerCells)}
            </dd>
          </div>
        </dl>

        <footer className="tc-foot">
          {simulated ? (
            <ExplorerLinks links={offExplorers(entry.symbol, "Example data: nothing on chain")} label={`${entry.symbol} explorers`} small />
          ) : (
            <>
              <ExplorerLinks links={launchExplorers(entry).slice(0, 2)} label={`${entry.symbol} on chain`} small />
              <ProjectLinks links={entry.links} symbol={entry.symbol} small />
            </>
          )}
          {simulated ? (
            <span className="tc-off" title={exampleNote}>
              <button type="button" className="btn" disabled aria-label={`Mine ${entry.symbol} — ${exampleNote}`}>
                ▶ Mine
              </button>
            </span>
          ) : action === "mine" ? (
            <a className="btn play soft" href={`${href}/mine`} aria-label={`Mine ${entry.symbol}`}>
              ▶ Mine
            </a>
          ) : (
            <a className="btn" href={href} aria-label={`View ${entry.symbol}`}>
              {action === "soon" ? "Preview" : "View"}
            </a>
          )}
        </footer>
        {simulated && <p className="tc-note">{exampleNote}.</p>}
      </div>
    </article>
  );
});
