/* A launch, as something to choose rather than something to read.
 *
 * The card leads with what you can *do* — mine it, buy it, or neither — because
 * that is the question someone arriving has. The accent comes from the launch,
 * so the grid is scannable by colour before any word is read, and the two
 * metrics are chosen per state: a live launch shows what is left this epoch, a
 * tradable one shows the best price, a finished one shows what it ended at.
 */

import { memo } from "react";

import type { Launch } from "../data/launches";
import { cumulative, maxAtoms } from "../lib/emission";
import { blocksAsTime, compact, group, pct } from "../lib/format";
import { Chip } from "./primitives";
import { Sigil } from "./Sigil";

export type CardAction = "mine" | "buy" | "soon" | "view";

const ACTION: Record<CardAction, { label: string; tone: "amber" | "violet" | "cyan" | undefined }> = {
  mine: { label: "mining now", tone: "amber" },
  buy: { label: "on the market", tone: "violet" },
  soon: { label: "opens soon", tone: "cyan" },
  view: { label: "closed", tone: undefined },
};

export interface TokenCardProps {
  launch: Launch;
  action: CardAction;
  /** Current chain height. A committed launch's countdown needs it. */
  tip: number;
  /** Promote the card with a gradient edge. Use for the few, not the many. */
  featured?: boolean;
  /** Offers currently open against this launch, when there are any. */
  offers?: number;
  /** Cheapest open offer, in satoshis per whole token. */
  floorPrice?: number;
  /** Events in the public feed, as a crude interest signal. */
  activity?: number;
  onOpen: () => void;
}

export const TokenCard = memo(function TokenCard({
  launch,
  action,
  tip,
  featured,
  offers,
  floorPrice,
  activity,
  onOpen,
}: TokenCardProps) {
  const max = maxAtoms(launch.schedule);
  const scheduled = cumulative(launch.schedule, BigInt(launch.elapsed));
  const share = Number((scheduled * 10000n) / max) / 10000;
  const blocksLeft = launch.epochBlocks - (launch.elapsed % launch.epochBlocks);
  const meta = ACTION[action];

  return (
    <button
      type="button"
      className={`tokencard${featured ? " featured" : ""}${featured && action === "buy" ? " neon" : ""}`}
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
        <Chip tone={meta.tone} live={action === "mine"}>
          {meta.label}
        </Chip>
      </div>

      <p className="blurb" style={{ margin: 0 }}>{launch.blurb}</p>

      <div className="foot">
        {action === "mine" && (
          <>
            <Metric k="scheduled" v={pct(share, 0)} accent />
            <Metric k="epoch ends" v={`${blocksLeft} blk`} />
            <Metric k="in" v={blocksAsTime(blocksLeft)} />
          </>
        )}

        {action === "buy" && (
          <>
            <Metric k="floor" v={floorPrice ? `${group(Math.round(floorPrice))}` : "—"} unit="sats" accent />
            <Metric k="offers" v={String(offers ?? 0)} />
            <Metric k="scheduled" v={pct(share, 0)} />
          </>
        )}

        {action === "soon" && (
          <>
            <Metric k="opens in" v={`${group(Math.max(0, launch.h0 - tip))} blk`} accent />
            <Metric k="which is" v={blocksAsTime(Math.max(0, launch.h0 - tip))} />
            <Metric k="ticket" v={group(launch.ticketSats)} unit="sats" />
          </>
        )}

        {action === "view" && (
          <>
            <Metric k="scheduled" v={pct(share, 0)} />
            <Metric k="reserve" v={compact(launch.reserve, 8)} accent />
            <Metric k="addresses" v={group(launch.addresses)} />
          </>
        )}

        <span className="spacer" />
        {activity !== undefined && activity > 0 && (
          <Metric k="events" v={group(activity)} />
        )}
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
