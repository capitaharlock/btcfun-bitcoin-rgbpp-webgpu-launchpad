/* A launch, as something to choose rather than something to read.
 *
 * The card leads with what you can *do* — mine it now, wait for it to open, or
 * look at a finished one — because that is the question someone arriving has.
 * The accent comes from the launch, so the grid is scannable by colour before
 * any word is read. Every figure is a protocol constant or a function of the
 * Bitcoin tip; supply lives on the launch page, where it is read from CKB.
 */

import { memo } from "react";

import type { Launch } from "../data/launches";
import { atoms, blocksAsTime, group } from "../lib/format";
import { DECIMALS, reward } from "../lib/standard";
import { Chip } from "./primitives";
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
  /** Promote the card with a gradient edge. Use for the few, not the many. */
  featured?: boolean;
  /** Events in the public feed, as a crude interest signal. */
  activity?: number;
  onOpen: () => void;
}

export function actionFor(launch: Launch): CardAction {
  if (launch.phase === "announced") return "soon";
  if (launch.phase === "minting") return "mine";
  return "view";
}

export const TokenCard = memo(function TokenCard({ launch, tip, featured, activity, onOpen }: TokenCardProps) {
  const action = actionFor(launch);
  const meta = ACTION[action];
  const rate24 = launch.open ? reward(24, launch.h0, tip) : reward(24, launch.h0, launch.h0);

  return (
    <button
      type="button"
      className={`tokencard${featured ? " featured" : ""}`}
      style={{ "--accent": launch.accent } as React.CSSProperties}
      onClick={onOpen}
    >
      <div className="top">
        <Sigil symbol={launch.symbol} accent={launch.accent} />
        <div style={{ minWidth: 0 }}>
          <div className="sym">{launch.symbol}</div>
          <div className="name">{launch.name}</div>
        </div>
        <span className="spacer" />
        <Chip tone={meta.tone} live={action === "mine"}>{meta.label}</Chip>
      </div>

      <p className="blurb" style={{ margin: 0 }}>{launch.blurb}</p>

      <div className="foot">
        {action === "mine" && (
          <>
            <Metric k="24-bit hash" v={atoms(rate24, DECIMALS, 0)} accent />
            <Metric k="halves in" v={`${group(launch.blocksToHalving)} blk`} />
            <Metric k="which is" v={blocksAsTime(launch.blocksToHalving)} />
          </>
        )}
        {action === "soon" && (
          <>
            <Metric k="opens in" v={`${group(launch.blocksToHalving)} blk`} accent />
            <Metric k="which is" v={blocksAsTime(launch.blocksToHalving)} />
            <Metric k="24-bit hash" v={atoms(rate24, DECIMALS, 0)} />
          </>
        )}
        {action === "view" && (
          <>
            <Metric k="halvings" v={String(launch.halvings ?? 0)} />
            <Metric k="mints" v="nothing now" />
          </>
        )}
        <span className="spacer" />
        {activity !== undefined && activity > 0 && <Metric k="events" v={group(activity)} />}
      </div>
    </button>
  );
});

function Metric({
  k,
  v,
  unit,
  accent,
}: {
  k: string;
  v: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <span className="metric">
      <span className="k">{k}</span>
      <span className={`v${accent ? " accent" : ""}`}>
        {v}
        {unit && <span style={{ fontSize: 10, color: "var(--ink-faint)", marginLeft: 3 }}>{unit}</span>}
      </span>
    </span>
  );
}
