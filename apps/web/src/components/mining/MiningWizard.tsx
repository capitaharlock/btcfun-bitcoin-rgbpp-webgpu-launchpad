/* The mining loop as a wizard: wallet, ticket, mine, mint — one step at a time.
 *
 * Which step is lit is decided by the chain (`lib/mining/loop.ts`), not by
 * what this page last did, so a reload lands on the same step. Every finished
 * step keeps its trace on screen — the Bitcoin transaction it was, with its
 * mempool.space link and whether it is still landing — so the person can see
 * what has happened as well as what is happening.
 *
 * During the testnet showcase the site offers the loop only on the featured
 * launch (`canMine`). On any other launch a wallet that already holds a ticket
 * can still mine and mint it: the showcase closing a launch must never strand a
 * ticket someone paid for.
 */

import type { ReactNode } from "react";

import { ConnectOptions } from "../wallet/Connect";
import type { Launch } from "../../data/launches";
import type { MiningLoop } from "../../hooks/useMiningLoop";
import { addressUrl, txUrl } from "../../lib/bitcoin/network";
import { atoms, blocksAsTime, group, shortHash } from "../../lib/format";
import { canMine } from "../../lib/launches/featured";
import { statusOf, type LoopState, type LoopStep, type StepStatus, type Trace } from "../../lib/mining/loop";
import { ACTIVE_RGBPP } from "../../lib/rgbpp/config";
import { SEAL_SATS } from "../../lib/rgbpp/operations";
import { DECIMALS, MIN_CLZ, PLATFORM_FEE_SATS, PROMOTER_SATS, reward, TICKET_SATS } from "../../lib/standard";
import { NETWORK, useWallet } from "../../state/WalletProvider";
import { Copyable } from "../../ui/Copyable";
import { Chip, Notice } from "../../ui/primitives";
import { MinePanel } from "./MinePanel";
import "./wizard.css";

/** Id of the ticket step's spending button, so the header's MINE can hand focus to it. */
export const SPEND_BUTTON_ID = "wz-spend";

export function MiningWizard({ launch, tip, loop: ml }: { launch: Launch; tip: number; loop: MiningLoop }) {
  const { loop } = ml;
  const { state, step, traces } = loop;
  const status = (s: LoopStep): StepStatus => statusOf(s, step, state);

  return (
    <section className="wz" aria-label={`Mine ${launch.symbol}`}>
      {!canMine(launch) && (
        <Notice tone="cyan">
          Mining on {launch.symbol} is closed on this testnet showcase, but the ticket you already hold stays yours: mine it
          and mint it here as usual.
        </Notice>
      )}
      <ol className="wz-steps">
        {state.at === "wallet" && (
          <Step n={0} title="Wallet" status="active" line="You haven't connected a wallet yet.">
            <p className="wz-copy">Tickets and tokens belong to a Bitcoin address. Pick one — you stay on this page.</p>
            <ConnectOptions />
          </Step>
        )}

        <Step
          n={1}
          title="Ticket"
          status={status("ticket")}
          line={ticketLine(state, launch)}
          traces={
            <>
              {traces.open && <TraceRow label="Miner cell" trace={traces.open} />}
              {traces.ticket && <TraceRow label="Ticket" trace={traces.ticket} />}
            </>
          }
        >
          {step === "ticket" && <TicketBody launch={launch} tip={tip} ml={ml} />}
        </Step>

        <Step n={2} title="Mine" status={status("mine")} line={mineLine(state, ml)}>
          {(state.at === "mine" || state.at === "mint") && (
            <MinePanel
              mining={ml.mining}
              challenge={ml.challenge}
              ticket={loop.ticket}
              mintable={ml.mintable}
              symbol={launch.symbol}
            />
          )}
        </Step>

        <Step
          n={3}
          title="Mint"
          status={status("mint")}
          line={mintLine(state, ml, launch.symbol)}
          traces={traces.mint && <TraceRow label="Mint" trace={traces.mint} proof />}
        >
          <MintBody launch={launch} ml={ml} />
        </Step>
      </ol>
    </section>
  );
}

function Step({
  n,
  title,
  status,
  line,
  traces,
  children,
}: {
  n: number;
  title: string;
  status: StepStatus;
  line: string;
  traces?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className={`wz-step ${status}`} aria-current={status === "active" ? "step" : undefined}>
      <span className="wz-mark" aria-hidden="true">
        {status === "done" ? "✓" : n}
      </span>
      <div className="wz-main">
        <div className="wz-head">
          <h3>
            <span className="wz-sr">Step {n}: </span>
            {title}
          </h3>
          <span className="wz-status">{status === "done" ? "done" : status === "active" ? "now" : "next"}</span>
        </div>
        <p className="wz-line">{line}</p>
        {traces && <div className="wz-traces">{traces}</div>}
        {children && <div className="wz-body">{children}</div>}
      </div>
    </li>
  );
}

const STAGE_TEXT: Record<Trace["stage"], string> = {
  landing: "landing",
  settled: "settled",
  failed: "failed",
};

/** A finished step's transaction: where to see it, and how far it has got. */
function TraceRow({ label, trace, proof }: { label: string; trace: Trace; proof?: boolean }) {
  return (
    <div className="wz-trace">
      <span className="wz-trace-label">{label}</span>
      <a
        className="mono"
        href={txUrl(trace.txid)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${label} transaction on mempool.space`}
      >
        {shortHash(trace.txid, 8, 6)} ↗
      </a>
      <Chip tone={trace.stage === "settled" ? "ok" : trace.stage === "failed" ? "danger" : "cyan"} live={trace.stage === "landing"}>
        {STAGE_TEXT[trace.stage]}
      </Chip>
      {trace.ckbTxHash && (
        <a href={`${ACTIVE_RGBPP.ckbExplorer}${trace.ckbTxHash}`} target="_blank" rel="noopener noreferrer">
          CKB ↗
        </a>
      )}
      {proof && trace.stage !== "failed" && <a href={`#/proof/${trace.txid}`}>Proof</a>}
      {trace.failure && <span className="wz-trace-failure">{trace.failure}</span>}
    </div>
  );
}

// ── step 1: the ticket ─────────────────────────────────────────────────────

function ticketLine(state: LoopState, launch: Launch): string {
  switch (state.at) {
    case "reading":
      return "Reading your wallet…";
    case "open":
      return "One-time setup: open your miner cell, then pay the ticket.";
    case "opening":
      return "Your miner cell is landing on Bitcoin — the ticket follows once it settles.";
    case "waiting":
      return `Waiting for your ${state.op.kind} to land before the ticket.`;
    case "pay":
      return `Pay ${group(TICKET_SATS)} sats: ${group(PROMOTER_SATS)} to the promoter, ${group(PLATFORM_FEE_SATS)} platform fee.`;
    case "mine":
    case "mint":
    case "minting":
    case "minted":
      return `Paid ${group(TICKET_SATS)} sats — rate locked at block ${group(ticketAnchor(state) ?? launch.h0)}.`;
    default:
      return `Pay ${group(TICKET_SATS)} sats for a ticket: its Bitcoin output is your challenge.`;
  }
}

function ticketAnchor(state: LoopState): number | null {
  if (state.at === "mine" || state.at === "mint") return state.ticket.anchor;
  if (state.at === "minted" && state.cell) return state.cell.data.anchor;
  return null;
}

function TicketBody({ launch, tip, ml }: { launch: Launch; tip: number; ml: MiningLoop }) {
  const { state } = ml.loop;
  const signing = ml.busy || (ml.auto && ml.funds !== null && !ml.funds.short);
  const problem = ml.failure && !ml.funds?.short && <Notice tone="danger">{ml.failure}</Notice>;
  const funding = ml.funds?.short && <FundWallet funds={ml.funds} auto={ml.auto} />;

  if (state.at === "reading") return <Working>Asking the RGB++ service which cells are sealed to your address.</Working>;

  if (state.at === "opening" || state.at === "waiting") {
    return <Working>Broadcast — waiting for one Bitcoin block (about ten minutes), then CKB.</Working>;
  }

  if (state.at === "open") {
    return (
      <div className="stack-md">
        <p className="wz-copy">
          Once per launch: a small CKB cell that holds your {launch.symbol} tickets. The RGB++ paymaster provides it for{" "}
          <b>{ml.paymaster ? `${group(ml.paymaster.feeSats)} sats` : "a fee"}</b>, plus a {group(SEAL_SATS)}-sat output that
          stays yours and the network fee. It must settle on Bitcoin — one block — before the ticket.
        </p>
        {funding}
        {signing ? (
          <Working>{ml.busy ? "Signing and sending…" : "Opening your miner cell…"}</Working>
        ) : (
          <div className="row wrapped">
            <button id={SPEND_BUTTON_ID} className="btn primary lg" disabled={ml.busy || !!ml.funds?.short} onClick={ml.open}>
              Open miner cell
            </button>
          </div>
        )}
        {problem}
      </div>
    );
  }

  if (state.at === "pay") {
    const rateNow = reward(24, launch.h0, tip);
    return (
      <div className="stack-md">
        <p className="wz-copy">
          To mine you'll pay <b>{group(TICKET_SATS)} sats</b>, plus the network fee:
        </p>
        <dl className="wz-bill">
          <div>
            <dt>
              To the promoter{" "}
              <a className="mono" href={addressUrl(launch.promoter)} target="_blank" rel="noopener noreferrer">
                {shortHash(launch.promoter, 10, 6)}
              </a>
            </dt>
            <dd>{group(PROMOTER_SATS)} sats</dd>
          </div>
          <div>
            <dt>Platform fee</dt>
            <dd>{group(PLATFORM_FEE_SATS)} sats</dd>
          </div>
          {ml.funds && (
            <div>
              <dt>Network fee, about</dt>
              <dd>{group(Math.max(0, ml.funds.needed - TICKET_SATS))} sats</dd>
            </div>
          )}
        </dl>
        <p className="wz-copy faint">
          Locks today's rate: a 24-bit hash mints {atoms(rateNow, DECIMALS, 0)} {launch.symbol}. It halves in{" "}
          {group(launch.blocksToHalving)} blocks ({blocksAsTime(launch.blocksToHalving)}).
        </p>
        {funding}
        {signing ? (
          <Working>{ml.busy ? "Signing and sending the ticket…" : "Paying the ticket…"}</Working>
        ) : (
          <div className="row wrapped">
            <button
              id={SPEND_BUTTON_ID}
              className="btn primary lg"
              disabled={ml.busy || !!ml.funds?.short}
              onClick={() => ml.pay(state.cell)}
            >
              Sign and pay
            </button>
            <span className="wz-copy faint">Mining starts as soon as it is sent.</span>
          </div>
        )}
        {problem}
      </div>
    );
  }
  return null;
}

/** Not enough bitcoin for the step: where to send some, and that the step carries on by itself. */
function FundWallet({ funds, auto }: { funds: NonNullable<MiningLoop["funds"]>; auto: boolean }) {
  const { vault } = useWallet();
  if (!vault) return null;
  return (
    <div className="wz-fund" role="status">
      <p className="wz-copy">
        <b>Not enough bitcoin.</b> This step needs about {group(funds.needed)} sats; the wallet has{" "}
        {group(funds.spendable)} confirmed
        {funds.pending > 0 ? ` and ${group(funds.pending)} waiting for a block` : ""}.
        {vault.kind === "demo" ? " The demo wallet is shared, so anyone can top it up." : ""}
      </p>
      <Copyable value={vault.address} label="address" />
      <div className="row wrapped">
        {NETWORK.faucets.map((faucet) => (
          <a key={faucet.url} className="btn sm" href={faucet.url} target="_blank" rel="noopener noreferrer">
            {faucet.name} ↗
          </a>
        ))}
      </div>
      <p className="wz-copy faint">
        Checking the balance every few seconds —{" "}
        {auto ? "this step carries on by itself once the coins confirm." : "the button unlocks once the coins confirm."}
      </p>
    </div>
  );
}

// ── step 2: mine ───────────────────────────────────────────────────────────

function mineLine(state: LoopState, ml: MiningLoop): string {
  switch (state.at) {
    case "mine":
    case "mint":
      if (ml.mining.running) return "Mining — your best hash so far sets what you mint.";
      return ml.mining.progress.next > 0n
        ? "Paused — Continue picks up exactly where it stopped."
        : "Press Mine: your browser hashes your ticket's challenge.";
    case "minting":
    case "minted":
      return "Done — your best hash is in the mint.";
    default:
      return "Your browser hashes your ticket's challenge; the best hash sets the reward.";
  }
}

// ── step 3: mint ───────────────────────────────────────────────────────────

function mintLine(state: LoopState, ml: MiningLoop, symbol: string): string {
  const best = ml.mining.progress.best;
  switch (state.at) {
    case "mine":
      return state.blocked === "landing"
        ? "Ticket landing — keep mining; minting unlocks when it settles."
        : `Unlocks at ${MIN_CLZ} zero bits${best ? ` — your best so far: ${best.clz}` : ""}.`;
    case "mint":
      return `Ready: your ${best?.clz ?? MIN_CLZ}-bit hash mints ${atoms(ml.mintable, DECIMALS, 2)} ${symbol}.`;
    case "minting":
      return `Minting ${mintedAmount(state.op.atoms)} ${symbol} — the tokens arrive after one Bitcoin block.`;
    case "minted":
      return state.op.stage === "failed"
        ? "The mint did not complete on CKB."
        : `Minted ${mintedAmount(state.op.atoms)} ${symbol}.`;
    default:
      return `Mint once your best hash has ${MIN_CLZ}+ zero bits and the ticket has settled.`;
  }
}

function mintedAmount(raw: string | undefined): string {
  return raw ? atoms(BigInt(raw), DECIMALS, 2) : "";
}

function MintBody({ launch, ml }: { launch: Launch; ml: MiningLoop }) {
  const { state } = ml.loop;
  if (state.at === "mint") {
    return (
      <div className="stack-sm">
        <div className="row wrapped">
          <button className="btn primary lg" disabled={ml.busy} onClick={ml.mint}>
            {ml.busy ? "Signing…" : `Mint ${atoms(ml.mintable, DECIMALS, 2)} ${launch.symbol}`}
          </button>
          <span className="wz-copy faint">Or keep mining for a better hash: the rate is locked.</span>
        </div>
        {ml.failure && <Notice tone="danger">{ml.failure}</Notice>}
      </div>
    );
  }
  if (state.at === "minting") return <Working>Waiting for one Bitcoin block, then the RGB++ queue completes it on CKB.</Working>;
  if (state.at === "minted") {
    return (
      <div className="row wrapped">
        <button className="btn play lg" onClick={ml.again}>
          Mine again
        </button>
        <span className="wz-copy faint">A new ticket, a new challenge.</span>
      </div>
    );
  }
  return null;
}

/** Something in progress: a spinner and one line saying what. */
function Working({ children }: { children: ReactNode }) {
  return (
    <p className="wz-working" aria-live="polite">
      <span className="wz-spin" aria-hidden="true" />
      {children}
    </p>
  );
}

// ── the header's MINE ──────────────────────────────────────────────────────

/**
 * The big button in the launch's header. Before the loop starts it is MINE;
 * while a step runs by itself it shows a spinner and says what; while mining
 * it pauses and continues; when a step waits for a signature it hands focus
 * to that step's button, which says what will be paid.
 */
export function MineButton({ launch, ml }: { launch: Launch; ml: MiningLoop }) {
  const { state } = ml.loop;
  const { mining } = ml;

  if (state.at === "not-open") {
    return (
      <button className="btn play xl lh-mine" disabled>
        Not open yet
      </button>
    );
  }
  if (!ml.engaged) {
    return (
      <button className="btn play xl lh-mine" onClick={ml.engage}>
        <span aria-hidden="true">▶</span> Mine {launch.symbol}
      </button>
    );
  }
  if (state.at === "mine" || state.at === "mint") {
    const begun = mining.progress.next > 0n;
    return mining.running ? (
      <button className="btn xl lh-mine" onClick={mining.stop}>
        Pause mining
      </button>
    ) : (
      <button className="btn play xl lh-mine" onClick={mining.start} disabled={!ml.challenge}>
        <span aria-hidden="true">▶</span> {begun ? "Continue mining" : "Start mining"}
      </button>
    );
  }
  if (state.at === "minted") {
    return (
      <button className="btn play xl lh-mine" onClick={ml.again}>
        <span aria-hidden="true">▶</span> Mine {launch.symbol} again
      </button>
    );
  }
  const spendable = state.at === "open" || state.at === "pay";
  const waitsForClick = spendable && !ml.auto && !ml.busy && !ml.funds?.short;
  if (waitsForClick) {
    const focus = () => {
      const target = document.getElementById(SPEND_BUTTON_ID);
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
      target?.focus({ preventScroll: true });
    };
    return (
      <button className="btn play xl lh-mine" onClick={focus}>
        {state.at === "open" ? "Open your miner cell ↓" : "Sign and pay below ↓"}
      </button>
    );
  }
  return (
    <button className="btn xl lh-mine working" aria-busy="true" disabled>
      <span className="wz-spin" aria-hidden="true" />
      {workingLabel(state, ml)}
    </button>
  );
}

function workingLabel(state: LoopState, ml: MiningLoop): string {
  if (ml.funds?.short && (state.at === "open" || state.at === "pay")) return "Waiting for funds";
  switch (state.at) {
    case "wallet":
      return "Waiting for a wallet";
    case "reading":
      return "Reading your wallet";
    case "open":
      return "Opening your miner cell";
    case "opening":
      return "Miner cell landing";
    case "waiting":
      return "Waiting for a transaction";
    case "pay":
      return "Paying the ticket";
    case "minting":
      return "Minting";
    default:
      return "Working";
  }
}
