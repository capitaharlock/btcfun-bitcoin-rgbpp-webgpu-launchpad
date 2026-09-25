/* The mining wizard's bar: back, the step's action, forward.
 *
 * The only place in the wizard that signs anything, so every signature is a
 * press of a button in the same spot, labelled with what it costs.
 */

import type { ReactNode } from "react";

import type { MiningLoop } from "../../../hooks/useMiningLoop";
import { atoms, group } from "../../../lib/format";
import { STEPS, type LoopStep } from "../../../lib/mining/loop";
import { DECIMALS, MIN_CLZ, TICKET_SATS } from "../../../lib/standard";
import { useWallet } from "../../../state/WalletProvider";
import { BusyButton } from "../../../ui/primitives";
import { Spinner } from "./shared";
import type { WizardView } from "./useWizardView";

/**
 * The wizard's one place to act. Back on the left; on the right, what the step
 * on screen asks for — a signature, a pause, the move to the next step. Labels
 * are short: the frame above says what each one does and costs.
 */
export function WizardBar({ ml, view, symbol }: { ml: MiningLoop; view: WizardView; symbol: string }) {
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
                {ml.busy && <Spinner />}
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
      {busy && <Spinner />}
      {children}
    </button>
  );
}

/** Waiting on the chain, not on the person: the busy button, with the wizard's spinner. */
function Waiting({ children }: { children: ReactNode }) {
  return (
    <BusyButton>
      <Spinner />
      {children}
    </BusyButton>
  );
}
