/* The mining loop for one launch: open, ticket, mine, mint.
 *
 * Which step is shown is decided by the chain, not by what this page last did:
 * the miner cells and token cells sealed to this wallet, plus any operation
 * still landing. So a reload, a second tab or a mint made elsewhere all show
 * the same state.
 *
 * Mining starts the moment a ticket is broadcast — its output is the challenge
 * and exists as soon as the transaction does. Minting waits until the ticket's
 * armed cell has settled on CKB, because the mint spends that cell.
 */

import { useEffect, useMemo, useState } from "react";

import type { Launch } from "../../data/launches";
import { useMiningSession } from "../../hooks/useMiningSession";
import { txUrl } from "../../lib/bitcoin/network";
import { atoms, blocksAsTime, group } from "../../lib/format";
import type { Candidate } from "../../lib/mining";
import { recompute } from "../../lib/mining/verify";
import { ACTIVE_RGBPP } from "../../lib/rgbpp/config";
import { mintScript } from "../../lib/rgbpp/launch";
import { planMint, planOpen, planTicket, SEAL_SATS, type MinerCell } from "../../lib/rgbpp/operations";
import { DECIMALS, MIN_CLZ, reward, TICKET_SATS, ticketChallenge } from "../../lib/standard";
import { useTokens, type Operation } from "../../state/TokensProvider";
import { useWallet } from "../../state/WalletProvider";
import { Chip, Notice, Panel } from "../../ui/primitives";
import { MinePanel, type TicketView } from "./MinePanel";

const BEST_KEY = "btcfun:best:v1";

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

  const challenge = useMemo(() => (ticket ? ticketChallenge(ticket.txid, ticket.vout) : null), [ticket]);
  const mining = useMiningSession(challenge);
  const best = useBestForTicket(ticket, challenge, mining.sample.best);

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
      return tokens.submit(plan, { kind: "mint", launchId: launch.id, tokenId: launch.tokenId, atoms: amount.toString() });
    });

  // ── which step ──────────────────────────────────────────────────────────
  if (!wallet.vault) {
    return (
      <Panel eyebrow="mine" title="Connect a wallet to mine">
        <p>Tickets, mining and minted tokens all belong to a Bitcoin address. <a href="#/wallet">Open the wallet</a>.</p>
      </Panel>
    );
  }
  if (!launch.open) {
    return (
      <Panel eyebrow="mine" title="Not open yet">
        <p>
          Minting opens at block {group(launch.h0)}, in {group(launch.blocksToHalving)} blocks
          (about {blocksAsTime(launch.blocksToHalving)}).
        </p>
      </Panel>
    );
  }
  if (tokens.holdings === null) {
    return (
      <Panel eyebrow="mine" title="Reading your cells…">
        <p className="faint">Asking the RGB++ service which cells are sealed to your address.</p>
        {tokens.error && <Notice tone="warn">{tokens.error}</Notice>}
      </Panel>
    );
  }

  const progress = landing && <Landing op={landing} symbol={launch.symbol} />;
  const problem = failure && <Notice tone="danger">{failure}</Notice>;

  if (!ticket && !idle && !armed) {
    return (
      <Panel eyebrow="step 1 of 3" title="Open a miner cell">
        {landing?.kind === "open" ? (
          progress
        ) : (
          <div className="stack-md">
            <p>
              Your miner cell is the CKB cell that holds your tickets for {launch.symbol}. You open it
              once. The RGB++ paymaster provides its CKB capacity, so you only need Bitcoin.
            </p>
            <p className="tiny faint">
              Cost: the paymaster's fee and a {SEAL_SATS}-sat output that stays yours, plus the network fee.
            </p>
            <button className="btn primary lg" disabled={busy} onClick={open}>
              {busy ? "Signing…" : "Open miner cell"}
            </button>
            {problem}
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
            <p>
              A ticket costs <b>{group(TICKET_SATS)} sats</b>, paid to the promoter. It fixes your rate at
              today's: a 24-bit hash would mint <b>{atoms(rateNow, DECIMALS, 0)} {launch.symbol}</b>.
            </p>
            <p className="tiny faint">
              The rate halves in {group(launch.blocksToHalving)} blocks (about {blocksAsTime(launch.blocksToHalving)}).
              A ticket keeps the rate of the block it is bought at, however long you mine.
            </p>
            <button className="btn primary lg" disabled={busy} onClick={() => buyTicket(idle)}>
              {busy ? "Signing…" : `Buy ticket · ${group(TICKET_SATS)} sats`}
            </button>
            <Notice>
              Ticket income goes to the promoter. There is no reserve and no floor: a token is worth what
              someone will pay for it.
            </Notice>
            {problem}
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
      <Notice tone="cyan">
        Your ticket is landing: mine now, and mint once it settles on CKB (after its Bitcoin confirmation).
      </Notice>
    ) : qualifies && armed && best ? (
      <div className="row wrapped">
        <button className="btn primary lg" disabled={busy} onClick={() => mint(armed, best)}>
          {busy
            ? "Signing…"
            : `Mint ${atoms(reward(best.clz, launch.h0, armed.data.anchor), DECIMALS, 2)} ${launch.symbol}`}
        </button>
        <span className="tiny faint">You can keep mining for a better hash first; the rate will not change.</span>
      </div>
    ) : null;

  return (
    <div className="stack-md">
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
      {best && !mining.sample.best && (
        <p className="tiny faint">Best hash for this ticket, kept from an earlier session: {best.clz} zero bits.</p>
      )}
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
        Bitcoin: <a href={txUrl(op.btcTxid)} target="_blank" rel="noreferrer">{op.btcTxid.slice(0, 16)}…</a>
        {op.ckbTxHash && (
          <>
            {" · "}CKB:{" "}
            <a href={`${ACTIVE_RGBPP.ckbExplorer}${op.ckbTxHash}`} target="_blank" rel="noreferrer">
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
 * The best hash found for a ticket in any session: the running one, or one
 * kept from before a reload. A kept candidate is re-hashed against the
 * challenge before it is believed, so a stale or edited entry cannot be minted.
 */
function useBestForTicket(
  ticket: TicketView | null,
  challenge: Uint8Array | null,
  running: Candidate | null,
): Candidate | null {
  const key = ticket ? `${ticket.txid}:${ticket.vout}` : null;
  const [kept, setKept] = useState<Candidate | null>(null);

  useEffect(() => {
    setKept(key && challenge ? readBest(key, challenge) : null);
  }, [key, challenge]);

  useEffect(() => {
    if (!key || !running) return;
    if (!kept || running.clz > kept.clz) {
      setKept(running);
      writeBest(key, running);
    }
  }, [key, running, kept]);

  if (!running) return kept;
  if (!kept) return running;
  return running.clz >= kept.clz ? running : kept;
}

function readBest(key: string, challenge: Uint8Array): Candidate | null {
  try {
    const all = JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}") as Record<string, { nonce: string }>;
    const entry = all[key];
    return entry ? recompute(challenge, BigInt(entry.nonce)) : null;
  } catch {
    return null;
  }
}

function writeBest(key: string, candidate: Candidate): void {
  try {
    const all = JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}") as Record<string, { nonce: string }>;
    all[key] = { nonce: candidate.nonce.toString() };
    localStorage.setItem(BEST_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: the running session still holds the best hash.
  }
}
