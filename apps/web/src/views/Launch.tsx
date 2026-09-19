/* One launch: its marquee, the mining loop, and the terms it runs on.
 *
 * Every figure on this page is either a protocol constant, a function of the
 * Bitcoin tip, or read from CKB. Supply, cells and your balance come from the
 * chain and can be recomputed by anyone with a CKB node; nothing here is a
 * fixture. The links and the story are the creator's signed words and are
 * labelled as such: nothing on chain enforces them. So is the picture, and
 * when the platform supplied it instead, the page says that too.
 */

import { useEffect, useRef } from "react";

import { navigate } from "../App";
import { phaseTone, type Launch } from "../data/launches";
import { useChainSynced, useLaunch, useTip } from "../hooks/useLaunches";
import { useImageCheck } from "../hooks/useImageCheck";
import { useLaunchStats } from "../hooks/useLaunchStats";
import { addressUrl } from "../lib/bitcoin/network";
import { ckbMintScriptUrl, ckbTokenUrl } from "../lib/rgbpp/explorer";
import { atoms, blocksAsTime, group, shortHash } from "../lib/format";
import { DECIMALS, HALVING_BLOCKS, MIN_CLZ, PLATFORM_FEE_SATS, PROMOTER_SATS, reward, TICKET_SATS } from "../lib/standard";
import { MinerSteps } from "../components/mining/MinerSteps";
import { useTokens } from "../state/TokensProvider";
import { HalvingBar } from "../ui/HalvingBar";
import { ExplorerLinks, launchExplorers, ProjectLinks } from "../ui/PixelIcon";
import { RewardChart } from "../ui/RewardChart";
import { Chip, Clamp, KV, More, Notice, Panel, Stat } from "../ui/primitives";
import { TokenImage } from "../ui/TokenImage";

export function LaunchView({ id, focusMiner = false }: { id: string; focusMiner?: boolean }) {
  const launch = useLaunch(id);
  if (!launch) {
    return (
      <Panel title="Launch not found">
        <p>No announcement with this id has reached this browser, or its terms do not match its id.</p>
        <button className="btn" onClick={() => navigate("/")}>Back to launches</button>
      </Panel>
    );
  }
  return <LaunchBody launch={launch} focusMiner={focusMiner} />;
}

function LaunchBody({ launch, focusMiner }: { launch: Launch; focusMiner: boolean }) {
  const tip = useTip();
  const synced = useChainSynced();
  const { stats, error } = useLaunchStats(launch);
  const tokens = useTokens();
  const mine = (tokens.holdings?.tokens.get(launch.tokenId) ?? []).reduce((n, c) => n + c.amount, 0n);
  const perTicket24 = launch.open ? reward(24, launch.h0, tip) : reward(24, launch.h0, launch.h0);
  const miner = useRef<HTMLElement>(null);
  const { why, plan } = launch.story;
  const imageCheck = useImageCheck(launch.art, launch.imageHash);

  // Arrived from a MINE button: open on the miner rather than the marquee.
  useEffect(() => {
    if (!focusMiner) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    miner.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [focusMiner, launch.id]);

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <button className="btn ghost sm" onClick={() => navigate("/")}>← Launches</button>
        <span className="spacer" />
        <Chip tone={phaseTone(launch.phase)} live={launch.phase === "minting"}>{launch.phase}</Chip>
        {synced ? (
          launch.open ? (
            <>
              <Chip>halving {launch.halvings}</Chip>
              <Chip tone="cyan">{group(launch.blocksToHalving)} blk · {blocksAsTime(launch.blocksToHalving)} to the next</Chip>
            </>
          ) : (
            <Chip tone="cyan">opens in {group(launch.blocksToHalving)} blk</Chip>
          )
        ) : (
          <Chip live>reading the chain…</Chip>
        )}
      </div>

      <section
        className={`marquee${synced ? "" : " syncing"}`}
        style={{ "--accent": launch.accent } as React.CSSProperties}
        aria-busy={!synced}
      >
        <figure className="marquee-art">
          <TokenImage art={launch.art} seed={launch.id} accent={launch.accent} symbol={launch.symbol} size="xl" />
          {launch.art && (
            <figcaption className="tiny faint">
              {launch.art.by === "platform" ? "Image supplied by the platform" : "Image chosen by the creator"}
              {imageCheck === "verified" && <Chip tone="ok">image verified</Chip>}
              {imageCheck === "mismatch" && <Chip tone="warn" title="The picture's bytes do not hash to the image hash in the token's terms">image ≠ terms</Chip>}
            </figcaption>
          )}
        </figure>
        <div className="stack-sm">
          <div className="eyebrow">{launch.name}</div>
          <h1>{launch.symbol}</h1>
          <p className="lede">{launch.blurb}</p>
          <div className="row wrapped">
            <ProjectLinks links={launch.links} symbol={launch.symbol} />
            <ExplorerLinks links={launchExplorers(launch)} label={`${launch.symbol} on chain`} />
          </div>
          {synced && <HalvingBar position={launch.position} accent={launch.accent} symbol={launch.symbol} />}
        </div>

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
          <Stat k="you hold" v={atoms(mine, DECIMALS, 2)} unit={launch.symbol} tone="cyan" />
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
          <p className="tiny faint story-note">
            {launch.art?.by === "creator" ? "Links, story and picture are" : "Links and story are"} signed by the creator, not
            enforced on chain.
          </p>
        )}
      </section>
      {stats?.truncated && <p className="tiny faint">Counts stop at 2,000 cells; figures are lower bounds.</p>}
      {error && <Notice tone="warn">Could not read CKB: {error}</Notice>}

      <section ref={miner} className="miner-anchor" aria-label="Mine">
        <MinerSteps launch={launch} tip={tip} />
      </section>

      <section className="grid g2">
        <Panel eyebrow="the standard" title="Terms">
          <KV
            rows={[
              ["Ticket", `${group(TICKET_SATS)} sats`],
              ["Now, for a 24-bit hash", `${atoms(perTicket24, DECIMALS, 0)} ${launch.symbol}`],
              ["Halving", `every ${group(HALVING_BLOCKS)} blocks from ${group(launch.h0)}`],
              ["Promoter · ticket payments", <a href={addressUrl(launch.promoter)} target="_blank" rel="noopener noreferrer">{shortHash(launch.promoter, 10, 6)}</a>],
              [
                "Token id",
                <a className="mono" href={ckbTokenUrl(launch.tokenId)} target="_blank" rel="noopener noreferrer" title={launch.tokenId}>
                  {shortHash(launch.tokenId, 10, 6)}
                </a>,
              ],
              ["Mint script", <a href={ckbMintScriptUrl()} target="_blank" rel="noopener noreferrer">on the CKB explorer</a>],
            ]}
          />
          <More>
            <p>
              A ticket pays {group(PROMOTER_SATS)} sats to the promoter and {group(PLATFORM_FEE_SATS)} to the platform. A hash
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
    </div>
  );
}
