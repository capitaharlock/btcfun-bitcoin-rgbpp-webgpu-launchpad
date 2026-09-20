/* One launch: a header that says what you can do, the mining loop, and the terms.
 *
 * The page is split by what a person came for. The header names the token and
 * holds the one action — MINE — with a line saying what is happening now and
 * what comes next. Under it, the mining wizard, once it is started. Everything
 * about the token itself (supply, story, terms, schedule) sits below, in its
 * own section, so mining and reading never compete for the same place.
 *
 * Every figure on this page is either a protocol constant, a function of the
 * Bitcoin tip, or read from CKB. Supply, cells and your balance come from the
 * chain and can be recomputed by anyone with a CKB node; nothing here is a
 * fixture. The links and the story are the creator's signed words and are
 * labelled as such: nothing on chain enforces them. So is the picture, and
 * when the platform supplied it instead, the page says that too.
 */

import { navigate } from "../App";
import { phaseTone, type Launch } from "../data/launches";
import { useChainSynced, useLaunch, useLaunches, useTip } from "../hooks/useLaunches";
import { useImageCheck } from "../hooks/useImageCheck";
import { useLaunchStats } from "../hooks/useLaunchStats";
import { useMiningLoop, type MiningLoop } from "../hooks/useMiningLoop";
import { addressUrl } from "../lib/bitcoin/network";
import { featuredLaunch } from "../lib/launches/featured";
import { ckbMintScriptUrl, ckbTokenUrl } from "../lib/rgbpp/explorer";
import { atoms, blocksAsTime, group, shortHash } from "../lib/format";
import { DECIMALS, HALVING_BLOCKS, MIN_CLZ, PLATFORM_FEE_SATS, PROMOTER_SATS, reward, TICKET_SATS } from "../lib/standard";
import { MineButton, MiningWizard } from "../components/mining/MiningWizard";
import { useTokens } from "../state/TokensProvider";
import { useWallet } from "../state/WalletProvider";
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
  // Arriving from a MINE button (`/launch/<id>/mine`) opens the wizard; the
  // page still starts at the top, so the header — and its MINE — is what shows.
  const ml = useMiningLoop(launch, tip, focusMiner);
  const { state } = ml.loop;

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <button className="btn ghost sm" onClick={() => navigate("/")}>← Launches</button>
      </div>

      <LaunchHeader launch={launch} ml={ml} />

      {state.at === "closed" ? (
        <Notice>
          On this testnet showcase the site offers its miner on one launch, so everyone's tickets and hashes land in the
          same place. That is this site's choice, not a rule of the token: the mint script on CKB accepts a paid ticket and
          a valid hash for any launch.
        </Notice>
      ) : (
        ml.engaged && state.at !== "not-open" && <MiningWizard launch={launch} tip={tip} loop={ml} />
      )}

      <About launch={launch} />
    </div>
  );
}

/** Picture, name, where the schedule stands — and the one action, with what it will do. */
function LaunchHeader({ launch, ml }: { launch: Launch; ml: MiningLoop }) {
  const synced = useChainSynced();
  const { vault } = useWallet();
  const { state } = ml.loop;
  const role = vault && vault.address === launch.promoter ? "You mine — and, as promoter, tickets pay you" : "You: miner";
  const said = ml.engaged ? ml.narration : null;

  return (
    <section
      className={`lh${synced ? "" : " syncing"}`}
      style={{ "--accent": launch.accent } as React.CSSProperties}
      aria-labelledby="lh-symbol"
      aria-busy={!synced}
    >
      <div className="lh-art">
        <TokenImage art={launch.art} seed={launch.id} accent={launch.accent} symbol={launch.symbol} size="xl" />
      </div>
      <div className="lh-title">
        <div className="eyebrow">{launch.name}</div>
        <h1 id="lh-symbol">{launch.symbol}</h1>
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
              Opens in {group(launch.blocksToHalving)} blocks · {blocksAsTime(launch.blocksToHalving)}
            </span>
          )}
        </p>
      </div>

      <div className="lh-act">
        {state.at === "closed" ? (
          <MiningElsewhere />
        ) : (
          <>
            <div className="lh-role">{role}</div>
            <MineButton launch={launch} ml={ml} />
            {state.at === "not-open" ? (
              <p className="lh-say">Nothing to buy until block {group(launch.h0)}.</p>
            ) : said ? (
              <div className="lh-say" aria-live="polite">
                <p>
                  <span className="lh-k">Now</span> {said.now}
                </p>
                <p>
                  <span className="lh-k">Next</span> {said.next}
                </p>
              </div>
            ) : (
              <div className="lh-say">
                <p>
                  <span className="lh-k">How</span> Wallet → ticket ({group(TICKET_SATS)} sats) → mine in your browser → mint.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * The header's action on a launch this site does not offer mining on. Says
 * plainly where mining is open; the notice under the header says why.
 */
function MiningElsewhere() {
  const demo = featuredLaunch(useLaunches());
  return (
    <div className="stack-sm">
      <h2 className="lh-elsewhere">{demo ? `Mining is open on ${demo.symbol}` : "Mining is open on DEMO"}</h2>
      {demo ? (
        <a className="btn play xl lh-mine" href={`#/launch/${demo.id}/mine`}>▶ Mine {demo.symbol}</a>
      ) : (
        <p className="tiny faint">The DEMO launch has not reached this browser yet.</p>
      )}
    </div>
  );
}

/** Everything about the token itself: counters, story, terms, schedule. */
function About({ launch }: { launch: Launch }) {
  const tip = useTip();
  const synced = useChainSynced();
  const { stats, error } = useLaunchStats(launch);
  const tokens = useTokens();
  const mine = (tokens.holdings?.tokens.get(launch.tokenId) ?? []).reduce((n, c) => n + c.amount, 0n);
  const perTicket24 = launch.open ? reward(24, launch.h0, tip) : reward(24, launch.h0, launch.h0);
  const { why, plan } = launch.story;
  const imageCheck = useImageCheck(launch.art, launch.imageHash);

  return (
    <section className="stack-md lh-about" aria-labelledby="about-title" style={{ "--accent": launch.accent } as React.CSSProperties}>
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
          <Stat k="you hold" v={atoms(mine, DECIMALS, 2)} unit={launch.symbol} tone="cyan" />
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
    </section>
  );
}
