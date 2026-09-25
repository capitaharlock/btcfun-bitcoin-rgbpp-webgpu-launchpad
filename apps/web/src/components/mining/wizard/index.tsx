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
 * This folder holds one file per part: the words each step says
 * (`progress.ts`, pure and tested), the bar, the round's ledger and each
 * step's body under `steps/`.
 */

import type { ReactNode } from "react";

import type { Launch } from "../../../data/launches";
import type { MiningLoop } from "../../../hooks/useMiningLoop";
import { statusOf, STEPS, type LoopStep, type StepStatus } from "../../../lib/mining/loop";
import { mineLine, mintLine, progressOf, ticketLine } from "./progress";
import { RoundLedger } from "./RoundLedger";
import { MineBody } from "./steps/Mine";
import { MintBody } from "./steps/Mint";
import { TicketBody } from "./steps/Ticket";
import { WalletBody } from "./steps/Wallet";
import type { WizardView } from "./useWizardView";
import { WizardBar } from "./WizardBar";
import "./wizard.css";

export { MineButton } from "./MineButton";
export { useWizardView, type WizardView } from "./useWizardView";

const TITLES: Record<LoopStep, string> = { wallet: "Wallet", ticket: "Ticket", mine: "Mine", mint: "Mint" };

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
