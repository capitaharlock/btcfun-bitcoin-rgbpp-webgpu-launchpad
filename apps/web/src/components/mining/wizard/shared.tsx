/* Pieces more than one wizard step shows: a transaction's trace, a line of
 * work in progress, and the funds the round is missing.
 *
 * One implementation each, so a ticket's trace on the Ticket step and on the
 * Mine step can never disagree about how it is drawn or what it links to.
 */

import type { ReactNode } from "react";

import { FUNDS_POLL_MS, type Costs } from "../../../hooks/useMiningLoop";
import { group, shortHash } from "../../../lib/format";
import type { Trace } from "../../../lib/mining/loop";
import { NETWORK, useWallet } from "../../../state/WalletProvider";
import { Copyable } from "../../../ui/Copyable";
import { Chip } from "../../../ui/primitives";
import { ExternalLink, TxLink } from "../../../ui/TxLink";

const STAGE_TEXT: Record<Trace["stage"], string> = {
  landing: "landing",
  settled: "settled",
  failed: "failed",
};

/** A finished step's transaction: where to see it, and how far it has got. */
export function TraceRow({ label, trace, proof }: { label: string; trace: Trace; proof?: boolean }) {
  return (
    <div className="wz-trace">
      <span className="wz-trace-label">{label}</span>
      <TxLink kind="btc" id={trace.txid} className="mono" aria-label={`${label} transaction on mempool.space`}>
        {shortHash(trace.txid, 8, 6)} ↗
      </TxLink>
      <Chip tone={trace.stage === "settled" ? "ok" : trace.stage === "failed" ? "danger" : "cyan"} live={trace.stage === "landing"}>
        {STAGE_TEXT[trace.stage]}
      </Chip>
      {trace.ckbTxHash && (
        <TxLink kind="ckb" id={trace.ckbTxHash}>
          CKB ↗
        </TxLink>
      )}
      {proof && trace.stage !== "failed" && <a href={`#/proof/${trace.txid}`}>Proof</a>}
      {trace.failure && <span className="wz-trace-failure">{trace.failure}</span>}
    </div>
  );
}

/** The wizard's spinner: a ring with one lit quarter (`.wz-spin`). */
export function Spinner() {
  return <span className="wz-spin" aria-hidden="true" />;
}

/** Something in progress: a spinner and one line saying what. */
export function Working({ children }: { children: ReactNode }) {
  return (
    <p className="wz-working" aria-live="polite">
      <Spinner />
      {children}
    </p>
  );
}

/**
 * Not enough bitcoin for the rest of the round: how much is missing, where to
 * send it, and that the balance is being watched. Nothing is signed until it
 * is there — a ticket without the fees to mint it would be lost.
 */
export function Funds({ costs }: { costs: Costs | null }) {
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
          <ExternalLink key={faucet.url} className="btn sm" href={faucet.url}>
            {faucet.name} ↗
          </ExternalLink>
        ))}
      </div>
      <Working>Waiting for funds — checking the address every {FUNDS_POLL_MS / 1000} seconds.</Working>
    </div>
  );
}
