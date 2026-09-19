/* The mining loop for one launch: open, ticket, mine, mint.
 *
 * Which step is shown is decided by the chain, not by what this page last did:
 * the miner cells and token cells sealed to this wallet, plus any operation
 * still landing. So a reload, a second tab or a mint made elsewhere all show
 * the same state.
 *
 * Mining starts the moment a ticket is broadcast — its output is the challenge
 * and exists as soon as the transaction does. Minting waits until the ticket's
 * armed cell has settled on CKB, because the mint spends that cell. The search
 * is keyed by the ticket's outpoint, which is the same before and after it
 * settles, so the ticket settling never interrupts or resets a run.
 *
 * During the testnet showcase this site offers the loop only on the featured
 * launch (`canMine`). On any other launch a wallet that already holds a ticket
 * can still mine and mint it: the showcase closing a launch must never strand a
 * ticket someone paid for.
 */

import { useMemo, useState } from "react";

import type { Launch } from "../../data/launches";
import { useAnnounce } from "../../hooks/useAnnounce";
import { useLaunches } from "../../hooks/useLaunches";
import { useMiningSession, type MiningTarget } from "../../hooks/useMiningSession";
import { txUrl } from "../../lib/bitcoin/network";
import { atoms, blocksAsTime, group } from "../../lib/format";
import { featuredLaunch, minerAccess } from "../../lib/launches/featured";
import { ticketKey, type Candidate } from "../../lib/mining";
import { ACTIVE_RGBPP } from "../../lib/rgbpp/config";
import { mintScript } from "../../lib/rgbpp/launch";
import { planMint, planOpen, planTicket, SEAL_SATS, type MinerCell } from "../../lib/rgbpp/operations";
import { DECIMALS, MIN_CLZ, PLATFORM_FEE_SATS, PROMOTER_SATS, reward, TICKET_SATS, ticketChallenge } from "../../lib/standard";
import { useTokens, type Operation } from "../../state/TokensProvider";
import { useWallet } from "../../state/WalletProvider";
import { Chip, More, Notice, Panel } from "../../ui/primitives";
import { MinePanel, type TicketView } from "./MinePanel";

export function MinerSteps({ launch, tip }: { launch: Launch; tip: number }) {
  const wallet = useWallet();
  const tokens = useTokens();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const mintHash = useMemo(() => mintScript(ACTIVE_RGBPP, launch.terms).hash(), [launch.terms]);
  const miners = tokens.holdings?.miners.get(mintHash) ?? [];
  const held = tokens.holdings?.tokens.get(launch.tokenId) ?? [];
  const idle = miners.find((m) => m.data.state === "idle") ?? null;
  const armed = miners.find((m) => m.data.state === "armed") ?? null;
  const landing = tokens.operations.find(
    (op) => op.launchId === launch.id && (op.stage === "sent" || op.stage === "queued"),
  );

  // The ticket to mine against: the settled armed cell, or a ticket still landing.
  const ticket = useMemo<TicketView | null>(() => {
    if (armed) return { txid: armed.seal.txid, vout: armed.seal.vout, anchor: armed.data.anchor, settled: true };
    if (landing?.kind === "ticket" && landing.anchor !== undefined) {
      return { txid: landing.btcTxid, vout: 1, anchor: landing.anchor, settled: false };
    }
    return null;
  }, [armed, landing]);

  // Keyed by the outpoint string, not the `ticket` object: that object is rebuilt
  // when a landing ticket settles, and the run must carry on through it.
  const key = ticket ? ticketKey(ticket.txid, ticket.vout) : null;
  const target = useMemo<MiningTarget | null>(() => {
    if (!key) return null;
    const [txid, vout] = key.split(":");
    return { key, challenge: ticketChallenge(txid, Number(vout)) };
  }, [key]);
  const challenge = target?.challenge ?? null;
  const mining = useMiningSession(target);
  const announce = useAnnounce();
  const best = mining.progress.best;
  const access = minerAccess(launch, ticket !== null || landing !== undefined);

  async function run(action: () => Promise<Operation>) {
    setBusy(true);
    setFailure(null);
    try {
      await action();
      mining.stop();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const open = () =>
    run(async () =>
      tokens.submit(planOpen(ACTIVE_RGBPP, launch.terms, await tokens.service.paymaster()), {
        kind: "open",
        launchId: launch.id,
        tokenId: launch.tokenId,
      }),
    );

  const buyTicket = (cell: MinerCell) =>
    run(() =>
      tokens.submit(planTicket(ACTIVE_RGBPP, launch.terms, cell, tip), {
        kind: "ticket",
        launchId: launch.id,
        tokenId: launch.tokenId,
        sats: TICKET_SATS,
        anchor: tip,
      }),
    );

  const mint = (cell: MinerCell, candidate: Candidate) =>
    run(async () => {
      const amount = reward(candidate.clz, launch.h0, cell.data.anchor);
      const holding = held[0] ?? null;
      const plan = planMint(ACTIVE_RGBPP, launch.terms, {
        miner: cell,
        held: holding,
        nonce: candidate.nonce,
        reward: amount,
        paymaster: holding ? null : await tokens.service.paymaster(),
      });
      const op = await tokens.submit(plan, { kind: "mint", launchId: launch.id, tokenId: launch.tokenId, atoms: amount.toString() });
      // The public feed points at the transaction; anyone can check the mint
      // against both chains on the proof page.
      await announce({ kind: "mint", launch: launch.id, amount, ref: op.btcTxid, txid: op.btcTxid });
      return op;
    });

  // ── which step ──────────────────────────────────────────────────────────
  // Before the wallet's cells are read, "finish" cannot be told from "closed";
  // without a wallet there is no ticket to finish.
  if (access === "closed" && (!wallet.vault || tokens.holdings !== null)) return <MiningClosed />;
  if (!wallet.vault) {
    return (
      <Panel eyebrow="mine" title="Connect a wallet to mine">
        <p className="clamp">Tickets and tokens belong to a Bitcoin address. <a href="#/wallet">Open the wallet</a>.</p>
      </Panel>
    );
  }
  if (!launch.open) {
    return (
      <Panel eyebrow="mine" title="Not open yet">
        <p className="clamp">
          Opens at block {group(launch.h0)}: in {group(launch.blocksToHalving)} blocks, about{" "}
          {blocksAsTime(launch.blocksToHalving)}.
        </p>
      </Panel>
    );
  }
  if (tokens.holdings === null) {
    return (
      <Panel eyebrow="mine" title="Reading your cells…">
        <p className="faint clamp">Asking the RGB++ service which cells are sealed to your address.</p>
        {tokens.error && <Notice tone="warn">{tokens.error}</Notice>}
      </Panel>
    );
  }

  const finishing =
    access === "finish" ? (
      <Notice tone="cyan">
        Mining on {launch.symbol} is closed on this testnet showcase, but the ticket you already hold stays yours: mine it
        and mint it here as usual.
      </Notice>
    ) : null;
  const progress = landing && <Landing op={landing} symbol={launch.symbol} />;
  const problem = failure && <Notice tone="danger">{failure}</Notice>;

  if (!ticket && !idle && !armed) {
    return (
      <Panel eyebrow="step 1 of 3" title="Open a miner cell">
        {landing?.kind === "open" ? (
          progress
        ) : (
          <div className="stack-md">
            <p className="clamp">Once per launch: a CKB cell that holds your {launch.symbol} tickets. You only need Bitcoin.</p>
            <div className="row wrapped">
              <button className="btn primary lg" disabled={busy} onClick={open}>
                {busy ? "Signing…" : "Open miner cell"}
              </button>
            </div>
            {problem}
            <More>
              <p>
                The RGB++ paymaster provides the cell's CKB capacity. Cost: the paymaster's fee and a {SEAL_SATS}-sat output
                that stays yours, plus the network fee.
              </p>
            </More>
          </div>
        )}
      </Panel>
    );
  }

  if (!ticket && idle) {
    const rateNow = reward(24, launch.h0, tip);
    return (
      <Panel eyebrow="step 2 of 3" title="Buy a ticket">
        {landing && landing.kind !== "ticket" ? (
          progress
        ) : (
          <div className="stack-md">
            <p className="clamp">
              Locks today's rate: a 24-bit hash mints <b>{atoms(rateNow, DECIMALS, 0)} {launch.symbol}</b>.
            </p>
            <div className="row wrapped">
              <button className="btn primary lg" disabled={busy} onClick={() => buyTicket(idle)}>
                {busy ? "Signing…" : `Buy ticket · ${group(TICKET_SATS)} sats`}
              </button>
            </div>
            {problem}
            <More>
              <p>
                {group(PROMOTER_SATS)} sats go to the promoter and {group(PLATFORM_FEE_SATS)} to the platform. The rate halves
                in {group(launch.blocksToHalving)} blocks (about {blocksAsTime(launch.blocksToHalving)}); a ticket keeps the
                rate of the block it is bought at, however long you mine.
              </p>
              <p>There is no reserve and no floor: a token is worth what someone will pay for it.</p>
            </More>
          </div>
        )}
      </Panel>
    );
  }

  // A ticket exists: mine it, and mint once it has settled and a hash qualifies.
  const qualifies = best !== null && best.clz >= MIN_CLZ;
  const mintAction =
    landing?.kind === "mint" ? (
      progress
    ) : !ticket?.settled ? (
      <Notice tone="cyan">Ticket landing — you can keep mining; minting unlocks when it settles.</Notice>
    ) : qualifies && armed && best ? (
      <div className="row wrapped">
        <button className="btn primary lg" disabled={busy} onClick={() => mint(armed, best)}>
          {busy
            ? "Signing…"
            : `Mint ${atoms(reward(best.clz, launch.h0, armed.data.anchor), DECIMALS, 2)} ${launch.symbol}`}
        </button>
        <span className="tiny faint">Or keep mining for a better hash: the rate is locked.</span>
      </div>
    ) : null;

  return (
    <div className="stack-md">
      {finishing}
      {landing?.kind === "ticket" && progress}
      <MinePanel
        mining={mining}
        challenge={challenge}
        ticket={ticket}
        h0={launch.h0}
        symbol={launch.symbol}
        action={
          <>
            {mintAction}
            {problem}
          </>
        }
      />
    </div>
  );
}

/** One operation on its way through Bitcoin and the RGB++ queue. */
function Landing({ op, symbol }: { op: Operation; symbol: string }) {
  const what: Record<Operation["kind"], string> = {
    open: "Opening your miner cell",
    ticket: "Your ticket",
    mint: `Minting ${op.atoms ? atoms(BigInt(op.atoms), DECIMALS, 2) : ""} ${symbol}`,
    transfer: "Transfer",
    list: "Listing",
    buy: "Purchase",
    cancel: "Cancelling",
  };
  const stage: Record<Operation["stage"], string> = {
    sent: "broadcast — waiting for its Bitcoin confirmation",
    queued: "confirmed on Bitcoin or about to be — the RGB++ queue is completing it on CKB",
    settled: "settled on CKB",
    failed: "the queue could not complete it",
  };
  return (
    <div className="stack-sm" aria-live="polite">
      <div className="row wrapped">
        <Chip tone="cyan" live>{what[op.kind]}</Chip>
        <span className="tiny">{stage[op.stage]}</span>
      </div>
      <div className="tiny faint">
        Bitcoin: <a href={txUrl(op.btcTxid)} target="_blank" rel="noopener noreferrer">{op.btcTxid.slice(0, 16)}…</a>
        {op.ckbTxHash && (
          <>
            {" · "}CKB:{" "}
            <a href={`${ACTIVE_RGBPP.ckbExplorer}${op.ckbTxHash}`} target="_blank" rel="noopener noreferrer">
              {op.ckbTxHash.slice(0, 18)}…
            </a>
          </>
        )}
      </div>
      {op.failure && <Notice tone="danger">{op.failure}</Notice>}
    </div>
  );
}

/**
 * The miner panel on a launch this site does not offer mining on. Says plainly
 * that it is the site's choice for the showcase, not a limit of the token.
 */
function MiningClosed() {
  const demo = featuredLaunch(useLaunches());
  return (
    <Panel eyebrow="mine" title={demo ? `Mining is open on ${demo.symbol}` : "Mining is open on DEMO"}>
      <div className="stack-md">
        <p className="clamp">
          On this testnet showcase the site offers its miner on one launch, so everyone's tickets and hashes land in the
          same place. That is this site's choice, not a rule of the token: the mint script on CKB accepts a paid ticket and
          a valid hash for any launch.
        </p>
        {demo ? (
          <div className="row wrapped">
            <a className="btn play lg" href={`#/launch/${demo.id}/mine`}>▶ Mine {demo.symbol}</a>
          </div>
        ) : (
          <p className="tiny faint">The DEMO launch has not reached this browser yet.</p>
        )}
      </div>
    </Panel>
  );
}
