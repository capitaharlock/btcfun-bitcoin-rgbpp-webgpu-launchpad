/* The mining loop as a wizard: wallet, ticket, mine, mint — one step at a time.
 *
 * Which step is live is decided by the chain (`lib/mining/loop.ts`), not by
 * what this page last did, so a reload lands on the same step. Every finished
 * step keeps its trace on screen — the Bitcoin transaction it was, with its
 * mempool.space link and whether it is still landing — so the person can see
 * what has happened as well as what is happening.
 *
 * The steps sit side by side and one fills the frame at a time. The frame
 * keeps one height — the tallest step's, never less than a floor — so the page
 * neither grows nor shrinks as the loop advances and the bar stays put. Every action lives in one bar
 * under the frame: back on the left, the step's own action and the way
 * forward on the right. Nothing signs without a press of that bar.
 *
 * During the testnet showcase the site offers the loop only on the featured
 * launch (`canMine`). On any other launch a wallet that already holds a ticket
 * can still mine and mint it: the showcase closing a launch must never strand a
 * ticket someone paid for.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

import { ConnectOptions } from "../wallet/Connect";
import type { Launch } from "../../data/launches";
import { FUNDS_POLL_MS, type Costs, type MiningLoop } from "../../hooks/useMiningLoop";
import { addressUrl, txUrl } from "../../lib/bitcoin/network";
import { atoms, group, shortHash } from "../../lib/format";
import { canMine } from "../../lib/launches/featured";
import { statusOf, STEPS, type LoopState, type LoopStep, type StepStatus, type Trace } from "../../lib/mining/loop";
import { ACTIVE_RGBPP } from "../../lib/rgbpp/config";
import { DECIMALS, MIN_CLZ, reward, TICKET_SATS } from "../../lib/standard";
import { NETWORK, useWallet } from "../../state/WalletProvider";
import { Copyable } from "../../ui/Copyable";
import { Chip, Notice } from "../../ui/primitives";
import { MinePanel } from "./MinePanel";
import "./wizard.css";

const VIEW_KEY = "btcfun:wizard-view:v1";

const TITLES: Record<LoopStep, string> = { wallet: "Wallet", ticket: "Ticket", mine: "Mine", mint: "Mint" };

/** The step on screen, remembered with the live step it was chosen against. */
interface StoredView {
  view: LoopStep;
  live: LoopStep;
}

const isStep = (v: unknown): v is LoopStep => typeof v === "string" && (STEPS as readonly string[]).includes(v);

function readView(launchId: string): StoredView | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(`${VIEW_KEY}:${launchId}`) ?? "null");
    if (typeof v !== "object" || v === null) return null;
    const { view, live } = v as Record<string, unknown>;
    return isStep(view) && isStep(live) ? { view, live } : null;
  } catch {
    return null;
  }
}

function writeView(launchId: string, stored: StoredView): void {
  try {
    localStorage.setItem(`${VIEW_KEY}:${launchId}`, JSON.stringify(stored));
  } catch {
    // Storage blocked: the page still follows the loop.
  }
}

export interface WizardView {
  /** The step on screen; any step can be looked at, whichever one is live. */
  view: LoopStep;
  show: (step: LoopStep) => void;
}

/**
 * Which step the wizard shows. It follows the loop: when the live step moves
 * on, the view slides to it. In between, the person may look back at a done
 * step or ahead at the next one, and that choice survives a reload — as long
 * as the loop is still where it was when they chose it.
 */
export function useWizardView(launchId: string, ml: MiningLoop): WizardView {
  const { state, step } = ml.loop;
  // A qualifying hash makes Mint the live step, but mining goes on and its
  // counters stay the thing to watch until the person accepts a hash.
  const current: LoopStep = ml.keeping ? "mint" : state.at === "mint" ? "mine" : (step ?? "ticket");
  // Until the chain and the wallet are read the step is not known — a launch
  // looks "not open" before the tip arrives — so there is nothing to follow.
  const known = step !== null && state.at !== "reading" && state.at !== "wallet";
  const [view, setView] = useState<LoopStep>(() => readView(launchId)?.view ?? current);
  const followed = useRef<LoopStep | null>(null);
  useEffect(() => {
    if (!known) {
      if (state.at === "wallet") setView("wallet");
      return;
    }
    const was = followed.current;
    if (was === current) return;
    followed.current = current;
    if (was === null) {
      // First known step of this visit: the stored view, if the loop is still where it was.
      const stored = readView(launchId);
      setView(stored && stored.live === current ? stored.view : current);
      return;
    }
    // A ticket ready to mine stays on screen with its trace until the person
    // chooses to mine: that move is theirs (the bar's Mine).
    if (!(was === "ticket" && current === "mine")) setView(current);
  }, [known, current, launchId, state.at]);
  useEffect(() => {
    if (known) writeView(launchId, { view, live: current });
  }, [known, launchId, view, current]);
  return { view, show: setView };
}

export function MiningWizard({ launch, loop: ml, view: wv }: { launch: Launch; loop: MiningLoop; view: WizardView }) {
  const { loop } = ml;
  const { state, step } = loop;
  const status = (s: LoopStep): StepStatus => statusOf(s, step, state);
  const index = STEPS.indexOf(wv.view);

  const bodies: Record<LoopStep, { line: string; body: ReactNode }> = {
    wallet: { line: "", body: <WalletBody /> },
    ticket: { line: ticketLine(state), body: <TicketBody launch={launch} ml={ml} /> },
    mine: { line: mineLine(state, ml), body: <MineBody launch={launch} ml={ml} /> },
    mint: { line: mintLine(state, ml, launch.symbol), body: <MintBody launch={launch} ml={ml} /> },
  };

  return (
    <section className="wz" aria-label={`Mine ${launch.symbol}`}>
      {!canMine(launch) && (
        <Notice tone="cyan">
          Mining on {launch.symbol} is closed on this testnet showcase, but the ticket you already hold stays yours: mine it
          and mint it here as usual.
        </Notice>
      )}

      <nav className="wz-rail" aria-label="Steps">
        <ol>
          {STEPS.map((s, i) => {
            const p = progressOf(s, ml);
            return (
              <li key={s}>
                <button
                  className={`wz-tab ${status(s)} tone-${p.tone}`}
                  aria-current={wv.view === s ? "step" : undefined}
                  aria-label={`Step ${i}, ${TITLES[s]}: ${p.word}`}
                  onClick={() => wv.show(s)}
                >
                  <span className="wz-mark" aria-hidden="true">
                    {p.tone === "done" ? "✓" : p.tone === "wait" ? <span className="wz-spin" /> : i}
                  </span>
                  <span className="wz-tab-title">{TITLES[s]}</span>
                  <span className="wz-status">{p.word}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <RoundLedger ml={ml} symbol={launch.symbol} />

      <div className="wz-frame">
        <ol className="wz-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {STEPS.map((s) => (
            <Slide
              key={s}
              n={STEPS.indexOf(s)}
              title={TITLES[s]}
              status={status(s)}
              shown={wv.view === s}
              line={bodies[s].line}
            >
              {bodies[s].body}
            </Slide>
          ))}
        </ol>
      </div>

      <WizardBar ml={ml} view={wv} symbol={launch.symbol} />
    </section>
  );
}

/**
 * How far a step has got, in one word and a tone the rail colours: `done`
 * (green, confirmed on chain), `wait` (cyan, sent and waiting for a block),
 * `act` (accent, waiting for the person), `todo` (faint, later).
 */
type Tone = "done" | "wait" | "act" | "todo";
interface Progress {
  word: string;
  tone: Tone;
}

function progressOf(step: LoopStep, ml: MiningLoop): Progress {
  const { state, traces } = ml.loop;
  const qualifies = (ml.mining.progress.best?.clz ?? 0) >= MIN_CLZ;
  const at = statusOf(step, ml.loop.step, state);
  switch (step) {
    case "wallet":
      return state.at === "wallet" ? { word: "connect", tone: "act" } : { word: "connected", tone: "done" };
    case "ticket": {
      if (state.at === "buy") return { word: "to pay", tone: "act" };
      if (state.at === "reading" || state.at === "wallet") return { word: "next", tone: "todo" };
      if (state.at === "waiting") return { word: "waiting", tone: "wait" };
      if (state.at === "mine" && state.unarmed?.why === "arm") return { word: "activate", tone: "act" };
      if (state.at === "mine" && state.unarmed?.why === "arming") return { word: "activating", tone: "wait" };
      if (traces.ticket?.stage === "landing") return { word: "in mempool", tone: "wait" };
      if (traces.ticket?.stage === "failed") return { word: "failed", tone: "act" };
      return { word: "confirmed", tone: "done" };
    }
    case "mine":
      if (state.at === "minting" || state.at === "minted") return { word: "done", tone: "done" };
      if (state.at !== "mine" && state.at !== "mint") return { word: "next", tone: "todo" };
      if (ml.keeping) return { word: "hash chosen", tone: "done" };
      if (qualifies) return { word: "hash ok", tone: "act" };
      return ml.mining.running ? { word: "mining", tone: "wait" } : { word: "start", tone: "act" };
    case "mint":
      if (state.at === "minting") return { word: "in mempool", tone: "wait" };
      if (state.at === "minted") return state.op.stage === "failed" ? { word: "failed", tone: "act" } : { word: "confirmed", tone: "done" };
      if (ml.keeping) return { word: "to sign", tone: "act" };
      return { word: at === "todo" ? "next" : "later", tone: "todo" };
  }
}

/**
 * The round's transactions in one line — what is signed, what Bitcoin has
 * confirmed, what is still to come — so the person never has to guess which
 * signature did what.
 */
function RoundLedger({ ml, symbol }: { ml: MiningLoop; symbol: string }) {
  const { state, traces, activates } = ml.loop;
  const best = ml.mining.progress.best?.clz ?? null;
  const tx = (trace: Trace | null, before: Progress): Progress =>
    !trace ? before : trace.stage === "settled" ? { word: "confirmed", tone: "done" } : trace.stage === "failed" ? { word: "failed", tone: "act" } : { word: "in mempool", tone: "wait" };
  const items: Array<{ label: string; p: Progress }> = [
    { label: "Ticket payment", p: tx(traces.ticket, state.at === "buy" ? { word: "to sign", tone: "act" } : { word: "not yet", tone: "todo" }) },
  ];
  if (activates) {
    const unarmed = state.at === "mine" ? state.unarmed : null;
    const before: Progress =
      unarmed?.why === "arm" ? { word: "to sign", tone: "act" } : unarmed?.why === "landing" ? { word: "after the ticket's block", tone: "todo" } : { word: "not yet", tone: "todo" };
    items.push({ label: "Activation", p: tx(traces.arm, before) });
  }
  items.push({
    label: "Best hash",
    p:
      best === null
        ? { word: "not yet", tone: "todo" }
        : best >= MIN_CLZ
          ? { word: `${best} bits · mintable`, tone: "done" }
          : { word: `${best} bits · needs ${MIN_CLZ}`, tone: "wait" },
  });
  items.push({ label: `Mint of ${symbol}`, p: tx(traces.mint, ml.keeping && state.at === "mint" ? { word: "to sign", tone: "act" } : { word: "not yet", tone: "todo" }) });
  if (state.at === "wallet" || state.at === "reading") return null;
  return (
    <ol className="wz-ledger" aria-label="This round">
      {items.map(({ label, p }) => (
        <li key={label} className={`tone-${p.tone}`}>
          <span className="wz-dot" aria-hidden="true">{p.tone === "done" ? "✓" : p.tone === "wait" ? "◌" : p.tone === "act" ? "●" : "○"}</span>
          <span className="wz-ledger-k">{label}</span>
          <span className="wz-ledger-v">{p.word}</span>
        </li>
      ))}
    </ol>
  );
}

/** One step, the width of the frame. Off screen it is inert: no focus, no reading. */
function Slide({
  n,
  title,
  status,
  shown,
  line,
  children,
}: {
  n: number;
  title: string;
  status: StepStatus;
  shown: boolean;
  line: string;
  children?: ReactNode;
}) {
  return (
    <li className={`wz-step ${status}`} inert={!shown} aria-hidden={!shown}>
      <div className="wz-head">
        <h3>
          <span className="wz-sr">Step {n}: </span>
          {title}
        </h3>
        {line && <p className="wz-line">{line}</p>}
      </div>
      {children && <div className="wz-body">{children}</div>}
    </li>
  );
}

// ── the bar: back, the step's action, forward ──────────────────────────────

/**
 * The wizard's one place to act. Back on the left; on the right, what the step
 * on screen asks for — a signature, a pause, the move to the next step. Labels
 * are short: the frame above says what each one does and costs.
 */
function WizardBar({ ml, view, symbol }: { ml: MiningLoop; view: WizardView; symbol: string }) {
  const { vault } = useWallet();
  const { state } = ml.loop;
  const { mining } = ml;
  const index = STEPS.indexOf(view.view);
  const mining_ = state.at === "mine" || state.at === "mint";
  const qualifies = (mining.progress.best?.clz ?? 0) >= MIN_CLZ;
  const blocked = !ml.costs || ml.costs.short || ml.busy;
  const armable = state.at === "mine" && state.unarmed?.why === "arm";
  const go = (s: LoopStep) => view.show(s);

  let actions: ReactNode = null;
  switch (view.view) {
    case "wallet":
      if (vault) actions = <Primary onClick={() => go("ticket")}>Next →</Primary>;
      break;
    case "ticket":
      if (state.at === "buy") {
        actions = (
          <Primary onClick={ml.signTicket} disabled={blocked} busy={ml.busy}>
            {ml.busy ? "Signing…" : ml.costs?.split ? `Pay ticket · ${group(TICKET_SATS + ml.costs.paymasterExtra + ml.costs.network)} sats` : "Pay ticket"}
          </Primary>
        );
      } else if (state.at === "waiting" || state.at === "reading") {
        actions = <Waiting>Waiting for a block</Waiting>;
      } else if (mining_ || state.at === "minting" || state.at === "minted") {
        actions = (
          <Primary
            onClick={() => {
              go("mine");
              if (mining_ && !mining.running && !ml.keeping && !qualifies) mining.start();
            }}
          >
            Go mine →
          </Primary>
        );
      }
      break;
    case "mine":
      if (mining_) {
        const begun = mining.progress.next > 0n;
        actions = (
          <>
            {armable && (
              <button className="btn lg" onClick={ml.signArm} disabled={blocked} aria-busy={ml.busy || undefined}>
                {ml.busy && <span className="wz-spin" aria-hidden="true" />}
                {ml.busy ? "Signing…" : activateLabel(ml)}
              </button>
            )}
            {mining.running ? (
              <button className="btn lg" onClick={mining.stop}>
                Pause
              </button>
            ) : (
              <button className={`btn lg${qualifies ? "" : " play"}`} onClick={mining.start} disabled={!ml.challenge}>
                {begun ? "Continue" : "Start mining"}
              </button>
            )}
            <Primary
              onClick={() => {
                if (!ml.keeping) ml.keep();
                go("mint");
              }}
              disabled={!qualifies}
            >
              Use this hash → Mint
            </Primary>
          </>
        );
      } else if (state.at === "minting" || state.at === "minted") {
        actions = <Primary onClick={() => go("mint")}>Mint →</Primary>;
      }
      break;
    case "mint":
      if (state.at === "mint") {
        actions = (
          <>
            <button className="btn lg" onClick={() => { ml.unkeep(); go("mine"); }}>
              Keep mining
            </button>
            <Primary onClick={ml.signMint} disabled={blocked} busy={ml.busy}>
              {ml.busy ? "Signing…" : `Mint ${atoms(ml.mintable, DECIMALS, 2)} ${symbol}${ml.costs ? ` · ${group(ml.costs.network)} sats fee` : ""}`}
            </Primary>
          </>
        );
      } else if (state.at === "mine" && ml.keeping) {
        actions = (
          <>
            <button className="btn lg" onClick={() => { ml.unkeep(); go("mine"); }}>
              Keep mining
            </button>
            {armable ? (
              <Primary onClick={ml.signArm} disabled={blocked} busy={ml.busy}>
                {ml.busy ? "Signing…" : activateLabel(ml)}
              </Primary>
            ) : (
              <Waiting>Waiting for a block</Waiting>
            )}
          </>
        );
      } else if (state.at === "minting") {
        actions = (
          <a className="btn primary lg" href="#/wallet">
            See my wallet
          </a>
        );
      } else if (state.at === "minted") {
        actions = <Primary onClick={() => { ml.again(); go("ticket"); }}>New round →</Primary>;
      }
      break;
  }

  return (
    <div className="wz-bar">
      <button className="btn ghost lg" disabled={index === 0} onClick={() => go(STEPS[index - 1])}>
        ← Back
      </button>
      <span className="wz-bar-say" aria-live="polite">
        {ml.loop.step && ml.loop.step !== "wallet" && (
          <b className="wz-count">Step {STEPS.indexOf(ml.loop.step)} of 3 · </b>
        )}
        {ml.narration?.now}
      </span>
      <div className="wz-bar-act">{actions}</div>
    </div>
  );

}

/** The activation's button: what it signs and what it costs. */
function activateLabel(ml: MiningLoop): string {
  return ml.costs ? `Activate ticket · ${group(ml.costs.network)} sats fee` : "Activate ticket";
}

function Primary({ onClick, disabled, busy, children }: { onClick: () => void; disabled?: boolean; busy?: boolean; children: ReactNode }) {
  return (
    <button className="btn primary lg" onClick={onClick} disabled={disabled} aria-busy={busy || undefined}>
      {busy && <span className="wz-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <button className="btn lg working" disabled aria-busy="true">
      <span className="wz-spin" aria-hidden="true" />
      {children}
    </button>
  );
}

// ── step 0: the wallet ─────────────────────────────────────────────────────

function WalletBody() {
  const { vault } = useWallet();
  if (!vault) {
    return (
      <>
        <p className="wz-copy">Tickets and tokens belong to a Bitcoin address. Pick one — you stay on this page.</p>
        <ConnectOptions />
      </>
    );
  }
  return (
    <div className="wz-trace">
      <span className="wz-trace-label">{vault.kind === "demo" ? "Demo wallet" : vault.kind === "passkey" ? "Passkey" : "Browser key"}</span>
      <a className="mono" href={addressUrl(vault.address)} target="_blank" rel="noopener noreferrer">
        {shortHash(vault.address, 10, 6)} ↗
      </a>
    </div>
  );
}

// ── step 1: the ticket ─────────────────────────────────────────────────────

function ticketLine(state: LoopState): string {
  switch (state.at) {
    case "wallet":
      return "Connect a wallet first.";
    case "reading":
      return "Reading your wallet…";
    case "buy":
      return state.cell
        ? "One payment: its output is your challenge, and mining starts as soon as it is sent."
        : "One payment: it creates your miner cell, and mining starts as soon as it is sent. Later, one small signature activates it for the mint.";
    case "waiting":
      return `Waiting for your ${state.op.kind} to land.`;
    default:
      return "Ticket sent — mine now, no need to wait for Bitcoin.";
  }
}

function TicketBody({ launch, ml }: { launch: Launch; ml: MiningLoop }) {
  const { state, traces } = ml.loop;
  const problem = ml.failure && <Notice tone="danger">{ml.failure}</Notice>;
  const trace = (
    <div className="wz-traces">
      {traces.ticket && <TraceRow label="Ticket" trace={traces.ticket} />}
      {traces.arm && <TraceRow label="Activation" trace={traces.arm} />}
    </div>
  );

  if (state.at === "wallet" || state.at === "reading") return null;

  if (state.at === "buy") {
    return (
      <div className="wz-sent">
        <TicketArt launch={launch} />
        <div className="stack-sm">
          <Bill costs={ml.costs} newCell={state.cell === null} />
          <Funds costs={ml.costs} />
          {problem}
        </div>
      </div>
    );
  }

  if (state.at === "waiting") {
    return (
      <div className="wz-sent">
        <TicketArt launch={launch} paid />
        <div className="stack-sm">
          {trace}
          <Working>One Bitcoin block, about ten minutes, then the RGB++ service completes it on CKB.</Working>
        </div>
      </div>
    );
  }

  const ticket = ml.loop.ticket;
  return (
    <div className="wz-sent">
      <TicketArt launch={launch} paid />
      <div className="stack-sm">
        {trace}
        {ticket && (
          <p className="wz-copy">
            {ticket.settled ? "Confirmed." : "In the mempool — no need to wait: its output is your challenge already."} Rate
            fixed at block {group(ticket.anchor)}: a 24-bit hash mints {atoms(reward(24, launch.h0, ticket.anchor), DECIMALS, 0)}{" "}
            {launch.symbol}.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The ticket, line by line: who is paid, the network fee, one total — and,
 * apart, what the round still costs. No subtotal: the ticket's price is on the
 * ticket drawn beside it.
 */
function Bill({ costs, newCell }: { costs: Costs | null; newCell: boolean }) {
  if (!costs || !costs.split) return <Working>Pricing the ticket…</Working>;
  const { split, paymasterExtra, network, later } = costs;
  return (
    <>
      <dl className="wz-bill">
        <BillRow label="Promoter" sats={split.promoter} />
        <BillRow label="Platform" sats={split.platform} />
        {newCell && <BillRow label="Paymaster · new miner cell" sats={split.paymaster} />}
        {paymasterExtra > 0 && <BillRow label="Paymaster, above its budget" sats={paymasterExtra} />}
        <BillRow label={`Network fee · ${costs.feeRate} sat/vB`} sats={network} />
        <BillRow label="Total" sats={TICKET_SATS + paymasterExtra + network} strong />
      </dl>
      <p className="wz-copy faint">
        Then {newCell ? "the activation and the mint cost" : "the mint costs"} ≈ {group(later)} sats of network fee — no other payment.
      </p>
    </>
  );
}

function BillRow({ label, sats, strong }: { label: string; sats: number; strong?: boolean }) {
  return (
    <div className={strong ? "strong" : undefined}>
      <dt>{label}</dt>
      <dd>{group(sats)} sats</dd>
    </div>
  );
}

/**
 * Not enough bitcoin for the rest of the round: how much is missing, where to
 * send it, and that the balance is being watched. Nothing is signed until it
 * is there — a ticket without the fees to mint it would be lost.
 */
function Funds({ costs }: { costs: Costs | null }) {
  const { vault } = useWallet();
  if (!vault || !costs?.short) return null;
  const missing = costs.reserve - costs.spendable;
  return (
    <div className="wz-fund" role="status">
      <p className="wz-copy">
        <b>{group(missing)} sats missing.</b> The round needs {group(costs.reserve)} confirmed; the wallet has{" "}
        {group(costs.spendable)}
        {costs.pending > 0 ? ` and ${group(costs.pending)} waiting for a block` : ""}.
        {vault.kind === "demo" ? " The demo wallet is shared: anyone can top it up." : ""}
      </p>
      <Copyable value={vault.address} label="address" />
      <div className="row wrapped">
        {NETWORK.faucets.map((faucet) => (
          <a key={faucet.url} className="btn sm" href={faucet.url} target="_blank" rel="noopener noreferrer">
            {faucet.name} ↗
          </a>
        ))}
      </div>
      <Working>Waiting for funds — checking the address every {FUNDS_POLL_MS / 1000} seconds.</Working>
    </div>
  );
}

/** A ticket, drawn: the thing being bought, with its price on it. */
function TicketArt({ launch, paid = false }: { launch: Launch; paid?: boolean }) {
  return (
    <svg className={`wz-ticket${paid ? " paid" : ""}`} viewBox="0 0 220 120" role="img" aria-label={`${launch.symbol} ticket, ${group(TICKET_SATS)} sats`}>
      <path
        className="wz-ticket-body"
        d="M8 4h204a4 4 0 0 1 4 4v38a14 14 0 0 0 0 28v38a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V74a14 14 0 0 0 0-28V8a4 4 0 0 1 4-4z"
      />
      <line className="wz-ticket-tear" x1="160" y1="12" x2="160" y2="108" />
      <text className="wz-ticket-k" x="20" y="34">TICKET</text>
      <text className="wz-ticket-sym" x="20" y="70">{launch.symbol}</text>
      <text className="wz-ticket-k" x="20" y="98">{group(TICKET_SATS)} SATS</text>
      <text className="wz-ticket-stub" x="188" y="66" textAnchor="middle">{paid ? "PAID" : "×1"}</text>
    </svg>
  );
}

// ── step 2: mine ───────────────────────────────────────────────────────────

function mineLine(state: LoopState, ml: MiningLoop): string {
  switch (state.at) {
    case "mine":
    case "mint":
      if (ml.mining.running) return "Mining — the best hash so far sets what you mint.";
      if ((ml.mining.progress.best?.clz ?? 0) >= MIN_CLZ) return "A hash qualifies. Accept it, or continue for a stronger one.";
      return ml.mining.progress.next > 0n ? "Paused — Continue picks up exactly where it stopped." : "Start: your browser hashes your ticket's challenge.";
    case "minting":
    case "minted":
      return "Done — your hash is in the mint.";
    default:
      return `Once the ticket is sent. A hash of ${MIN_CLZ}+ zero bits mints.`;
  }
}

function MineBody({ launch, ml }: { launch: Launch; ml: MiningLoop }) {
  const { state } = ml.loop;
  if (state.at !== "mine" && state.at !== "mint") return null;
  return (
    <>
      <MinePanel mining={ml.mining} challenge={ml.challenge} ticket={ml.loop.ticket} mintable={ml.mintable} symbol={launch.symbol} />
      <Readiness ml={ml} />
    </>
  );
}

/**
 * Where the ticket stands on the way to a mint, one line: mining never waits
 * for it, only the mint does. The arming, when it is due, is offered here and
 * signed from the bar.
 */
function Readiness({ ml }: { ml: MiningLoop }) {
  const { state, traces } = ml.loop;
  if (state.at !== "mine" && state.at !== "mint") return null;
  const unarmed = state.at === "mine" ? state.unarmed : null;
  const trace = unarmed?.why === "arming" ? traces.arm : traces.ticket;
  let say: ReactNode;
  switch (unarmed?.why) {
    case "landing":
      say = <Working>Ticket in the mempool — minting waits for one Bitcoin block.</Working>;
      break;
    case "arm":
      say = (
        <p className="wz-copy">
          <b>Your ticket is confirmed — activate it.</b> Activation registers the paid ticket on CKB, the chain that holds
          the tokens, so your hash can be minted. It pays only the network fee
          {ml.costs ? ` (${group(ml.costs.network)} sats)` : ""} and mining keeps running. Button: “Activate ticket”, below.
        </p>
      );
      break;
    case "arming":
      say = <Working>Activation sent — the mint unlocks after its Bitcoin block. Keep mining meanwhile.</Working>;
      break;
    default:
      say = <p className="wz-copy faint">Ticket active: any hash of {MIN_CLZ}+ zero bits can be minted.</p>;
  }
  return (
    <div className="wz-ready">
      {trace && <TraceRow label={unarmed?.why === "arming" ? "Activation" : "Ticket"} trace={trace} />}
      {say}
      {unarmed?.why === "arm" && <Funds costs={ml.costs} />}
      {unarmed?.why === "arm" && ml.failure && <Notice tone="danger">{ml.failure}</Notice>}
    </div>
  );
}

// ── step 3: mint ───────────────────────────────────────────────────────────

function mintLine(state: LoopState, ml: MiningLoop, symbol: string): string {
  switch (state.at) {
    case "mine":
      if (!ml.keeping) return `Accept a hash of ${MIN_CLZ}+ zero bits to mint it.`;
      return state.unarmed?.why === "arm"
        ? "Hash chosen. First activate your ticket (network fee only), then sign the mint."
        : "Hash chosen. The mint unlocks when your ticket is active on-chain — about one Bitcoin block.";
    case "mint":
      return `Last signature: it creates ${atoms(ml.mintable, DECIMALS, 2)} ${symbol} in your wallet. Network fee only.`;
    case "minting":
      return `Mint sent: ${mintedAmount(state.op.atoms)} ${symbol} arrive after one Bitcoin block. Nothing more to sign.`;
    case "minted":
      return state.op.stage === "failed" ? "The mint did not complete on CKB." : `Done: ${mintedAmount(state.op.atoms)} ${symbol} are confirmed in your wallet.`;
    default:
      return `Accept a hash of ${MIN_CLZ}+ zero bits to mint it.`;
  }
}

function mintedAmount(raw: string | undefined): string {
  return raw ? atoms(BigInt(raw), DECIMALS, 2) : "";
}

function MintBody({ launch, ml }: { launch: Launch; ml: MiningLoop }) {
  const { state, traces } = ml.loop;
  const best = ml.mining.progress.best;

  if (state.at === "mint" || (state.at === "mine" && ml.keeping)) {
    return (
      <div className="stack-sm">
        <div className="scoreboard wz-mint-sum">
          <div className="stat">
            <div className="k">you mint</div>
            <div className="v amber">
              {atoms(ml.mintable, DECIMALS, 2)}
              <span className="u">{launch.symbol}</span>
            </div>
          </div>
          <div className="stat">
            <div className="k">hash</div>
            <div className="v cyan">
              {best?.clz ?? "—"}
              <span className="u">zero bits</span>
            </div>
          </div>
          <div className="stat">
            <div className="k">network fee</div>
            <div className="v">{ml.costs && state.at === "mint" ? group(ml.costs.network) : "—"}<span className="u">sats</span></div>
          </div>
        </div>
        {state.at === "mine" && state.unarmed?.why === "arm" && <Funds costs={ml.costs} />}
        {state.at === "mine" && state.unarmed?.why !== "arm" && (
          <Working>
            {state.unarmed?.why === "arming" ? "Waiting for the activation's Bitcoin block." : "Waiting for your ticket's Bitcoin block."}
          </Working>
        )}
        {state.at === "mint" && <Funds costs={ml.costs} />}
        {ml.failure && <Notice tone="danger">{ml.failure}</Notice>}
      </div>
    );
  }
  if (state.at === "minting" || state.at === "minted") {
    return (
      <div className="stack-sm">
        <div className="wz-traces">{traces.mint && <TraceRow label="Mint" trace={traces.mint} proof />}</div>
        {state.at === "minting" && (
          <Working>
            Every signature of this round is done. The mint is in the mempool; your wallet shows the tokens as landing
            until one Bitcoin block confirms them.
          </Working>
        )}
      </div>
    );
  }
  return null;
}

// ── shared ─────────────────────────────────────────────────────────────────

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
      <a className="mono" href={txUrl(trace.txid)} target="_blank" rel="noopener noreferrer" aria-label={`${label} transaction on mempool.space`}>
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

/** The big button in the launch's header, before the wizard opens. */
export function MineButton({ launch, ml }: { launch: Launch; ml: MiningLoop }) {
  if (ml.loop.state.at === "not-open") {
    return (
      <button className="btn play xl lh-mine" disabled>
        Not open yet
      </button>
    );
  }
  return (
    <button className="btn play xl lh-mine" onClick={ml.engage}>
      <span aria-hidden="true">▶</span> Mine {launch.symbol}
    </button>
  );
}
