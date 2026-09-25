/* A launch page's header: what the token is, and the one thing to do with it.
 *
 * Pressing MINE turns this same box into the mining wizard, so the loop
 * happens where the button was rather than somewhere down the page; the
 * token's picture and name stay in view as a one-line strip above it.
 */

import type { CSSProperties, ReactNode } from "react";

import { phaseTone, type Launch } from "../../data/launches";
import { useChainSynced } from "../../hooks/useLaunches";
import type { MiningLoop } from "../../hooks/useMiningLoop";
import { blocksAsTime, blocksLabel, group } from "../../lib/format";
import { TICKET_SATS } from "../../lib/standard";
import { useWallet } from "../../state/WalletProvider";
import { Chip } from "../../ui/primitives";
import { TokenImage } from "../../ui/TokenImage";
import { MineButton, MiningWizard, useWizardView } from "../mining/wizard";
import "./launch.css";

/**
 * Picture, name, where the schedule stands — and the one action, with what it
 * will do. Once the loop is engaged the same box holds the wizard, under a
 * one-line strip that keeps the token's name in view: the wizard's own bar
 * carries every action from then on.
 */
export function LaunchHeader({ launch, ml }: { launch: Launch; ml: MiningLoop }) {
  const synced = useChainSynced();
  const { vault } = useWallet();
  const { state } = ml.loop;
  const role = vault && vault.address === launch.promoter ? "You mine — and, as promoter, tickets pay you" : "You: miner";
  const wizard = ml.engaged && state.at !== "not-open";
  const view = useWizardView(launch.id, ml);

  if (wizard) {
    return (
      <section
        className={`lh wizard${synced ? "" : " syncing"}`}
        style={{ "--accent": launch.accent } as CSSProperties}
        aria-labelledby="lh-symbol"
        aria-busy={!synced}
      >
        <div className="lh-strip">
          <LaunchTitle launch={launch} />
          {ml.narration && (
            <p className="lh-next">
              <span className="lh-k">Next</span> {ml.narration.next}
            </p>
          )}
          <div className="lh-role">{role}</div>
        </div>
        <MiningWizard launch={launch} loop={ml} view={view} />
      </section>
    );
  }

  return (
    <section
      className={`lh${synced ? "" : " syncing"}`}
      style={{ "--accent": launch.accent } as CSSProperties}
      aria-labelledby="lh-symbol"
      aria-busy={!synced}
    >
      <LaunchTitle launch={launch}>
        <p className="lh-blurb">{launch.blurb}</p>
        <p className="lh-status">
          <Chip tone={phaseTone(launch.phase)} live={launch.phase === "minting"}>{launch.phase}</Chip>
          {!synced ? (
            <span>Reading the chain…</span>
          ) : launch.open ? (
            <>
              <Chip>halving {launch.halvings}</Chip>
              <span>
                Reward halves in {group(launch.blocksToHalving)} blocks · {blocksAsTime(launch.blocksToHalving)}
              </span>
            </>
          ) : (
            <span>
              Opens in {blocksLabel(launch.blocksToHalving)} ·{" "}
              {blocksAsTime(launch.blocksToHalving)}
            </span>
          )}
        </p>
      </LaunchTitle>

      <div className="lh-act">
        <div className="lh-role">{role}</div>
        <MineButton launch={launch} ml={ml} />
        {state.at === "not-open" ? (
          <div className="lh-say" role="status">
            <p>
              <span className="lh-k">When</span> Mining opens at block {group(launch.h0)}, in{" "}
              {blocksLabel(launch.blocksToHalving)} ({blocksAsTime(launch.blocksToHalving)}).
            </p>
            <div className="tiny faint">
              The mint script refuses tickets before that block, so nothing can be bought yet — by anyone, the creator
              included. This page unlocks by itself when the block arrives.
            </div>
          </div>
        ) : (
          <div className="lh-say">
            <p>
              <span className="lh-k">How</span> Wallet → ticket ({group(TICKET_SATS)} sats) → mine in your browser → mint.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/** The token's picture and name, the part both forms of the header share; anything more goes under the name. */
function LaunchTitle({ launch, children }: { launch: Launch; children?: ReactNode }) {
  return (
    <>
      <div className="lh-art">
        <TokenImage art={launch.art} seed={launch.id} accent={launch.accent} symbol={launch.symbol} size="xl" />
      </div>
      <div className="lh-title">
        <div className="eyebrow">{launch.name}</div>
        <h1 id="lh-symbol">{launch.symbol}</h1>
        {children}
      </div>
    </>
  );
}
