/* A launch page's "About" section: everything about the token itself.
 *
 * Counters, story, terms and schedule sit apart from the header so mining and
 * reading never compete for the same place. Supply, cells and the balance are
 * read from the chain; the links and the story are the creator's signed words
 * and are labelled as such, as is who supplied the picture.
 */

import type { CSSProperties } from "react";

import type { Launch } from "../../data/launches";
import { useImageCheck } from "../../hooks/useImageCheck";
import { useChainSynced, useTip } from "../../hooks/useLaunches";
import { useLaunchStats } from "../../hooks/useLaunchStats";
import { atoms, group, shortHash } from "../../lib/format";
import { landingMints } from "../../lib/holdings";
import { ckbMintScriptUrl, ckbTokenUrl } from "../../lib/rgbpp/explorer";
import { DECIMALS, HALVING_BLOCKS, MIN_CLZ, NEW_CELL, PLATFORM_PERCENT, REUSE, reward, TICKET_SATS } from "../../lib/standard";
import { useTokens } from "../../state/TokensProvider";
import { Chip, Clamp, KV, More, Notice, Panel, Stat } from "../../ui/primitives";
import { ExternalLink, TxLink } from "../../ui/TxLink";
import { HalvingBar } from "./HalvingBar";
import "./launch.css";
import { ExplorerLinks, launchExplorers, ProjectLinks } from "./Links";
import { RewardChart } from "./RewardChart";

/** Everything about the token itself: counters, story, terms, schedule. */
export function About({ launch }: { launch: Launch }) {
  const tip = useTip();
  const synced = useChainSynced();
  const { stats, error } = useLaunchStats(launch);
  const tokens = useTokens();
  const mine = (tokens.holdings?.tokens.get(launch.tokenId) ?? []).reduce((n, c) => n + c.amount, 0n);
  const landing = landingMints(tokens.operations).get(launch.tokenId) ?? 0n;
  const perTicket24 = launch.open ? reward(24, launch.h0, tip) : reward(24, launch.h0, launch.h0);
  const { why, plan } = launch.story;
  const imageCheck = useImageCheck(launch.art, launch.imageHash);

  return (
    <section className="stack-md lh-about" aria-labelledby="about-title" style={{ "--accent": launch.accent } as CSSProperties}>
      <h2 id="about-title" className="lh-about-title">About {launch.symbol}</h2>

      <div className="lh-about-box">
        <div className="scoreboard">
          <Stat
            k="minted"
            v={stats ? atoms(stats.supply, DECIMALS, 0) : "—"}
            unit={launch.symbol}
            tone="amber"
            hint="Sum of every live cell of this token on CKB"
          />
          <Stat k="24-bit hash now" v={atoms(perTicket24, DECIMALS, 0)} unit={launch.symbol} hint="What a 24-bit hash mints on a ticket bought now" />
          <Stat k="miner cells" v={stats ? group(stats.minerCells) : "—"} hint="Cells, not people" />
          <Stat
            k={landing > 0n ? `you hold · +${atoms(landing, DECIMALS, 2)} landing` : "you hold"}
            v={atoms(mine, DECIMALS, 2)}
            unit={launch.symbol}
            tone="cyan"
            hint={landing > 0n ? "Minted and in the mempool; added once one Bitcoin block confirms it" : undefined}
          />
        </div>
        {stats?.truncated && <p className="tiny faint">Counts stop at 2,000 cells; figures are lower bounds.</p>}
        {error && <Notice tone="warn">Could not read CKB: {error}</Notice>}

        {synced && <HalvingBar position={launch.position} accent={launch.accent} symbol={launch.symbol} />}

        <div className="row wrapped">
          <ProjectLinks links={launch.links} symbol={launch.symbol} />
          <ExplorerLinks links={launchExplorers(launch)} label={`${launch.symbol} on chain`} />
          {launch.art && (
            <span className="tiny faint row wrapped">
              {launch.art.by === "platform" ? "Image supplied by the platform" : "Image chosen by the creator"}
              {imageCheck === "verified" && <Chip tone="ok">image verified</Chip>}
              {imageCheck === "mismatch" && <Chip tone="warn" title="The picture's bytes do not hash to the image hash in the token's terms">image ≠ terms</Chip>}
            </span>
          )}
        </div>

        {(why || plan) && (
          <div className="story">
            {why && (
              <section aria-label="Why">
                <div className="eyebrow">Why</div>
                <Clamp text={why} />
              </section>
            )}
            {plan && (
              <section aria-label="The plan">
                <div className="eyebrow">The plan</div>
                <Clamp text={plan} />
              </section>
            )}
          </div>
        )}
        {(why || plan || Object.keys(launch.links).length > 0 || launch.art?.by === "creator") && (
          <p className="tiny faint">
            {launch.art?.by === "creator" ? "Links, story and picture are" : "Links and story are"} signed by the creator, not
            enforced on chain.
          </p>
        )}
      </div>

      <section className="grid g2">
        <Panel eyebrow="the standard" title="Terms">
          <KV
            rows={[
              ["Ticket", `${group(TICKET_SATS)} sats`],
              ["Now, for a 24-bit hash", `${atoms(perTicket24, DECIMALS, 0)} ${launch.symbol}`],
              ["Halving", `every ${group(HALVING_BLOCKS)} blocks from ${group(launch.h0)}`],
              ["Promoter · ticket payments", <TxLink kind="address" id={launch.promoter}>{shortHash(launch.promoter, 10, 6)}</TxLink>],
              [
                "Token id",
                <ExternalLink className="mono" href={ckbTokenUrl(launch.tokenId)} title={launch.tokenId}>
                  {shortHash(launch.tokenId, 10, 6)}
                </ExternalLink>,
              ],
              ["Mint script", <ExternalLink href={ckbMintScriptUrl()}>on the CKB explorer</ExternalLink>],
            ]}
          />
          <More>
            <p>
              A ticket costs {group(TICKET_SATS)} sats plus network fees. When the round needs a new miner cell,{" "}
              {group(NEW_CELL.paymaster)} of it pays the RGB++ paymaster; the platform takes {PLATFORM_PERCENT} % of the rest
              ({group(NEW_CELL.platform)} or {group(REUSE.platform)} sats) and the promoter the remainder ({group(NEW_CELL.promoter)}{" "}
              or {group(REUSE.promoter)}). A hash
              with <i>n</i> leading zero bits mints <i>n²</i> tokens, halved once per {group(HALVING_BLOCKS)} blocks; below{" "}
              {MIN_CLZ} bits it mints nothing.
            </p>
            <p>
              The token is an xUDT on CKB bound to Bitcoin outputs by RGB++. Only the mint script can issue it, and only for
              a paid ticket and a valid hash. <a href="#/lab">How the standard works</a>.
            </p>
          </More>
        </Panel>

        <Panel eyebrow="schedule" title="By halving">
          <RewardChart h0={launch.h0} tip={synced ? tip : null} symbol={launch.symbol} height={120} />
        </Panel>
      </section>
    </section>
  );
}
