/* From a won hash to tokens in the wallet.
 *
 * Three gates, in order, each one a real prerequisite rather than a step in a
 * wizard: a connected wallet, a paid ticket, and a candidate that clears the
 * launch's difficulty. Only then can a claim be signed, and the amount it mints
 * is decided by the allocation rule — never by this component.
 *
 * The panel shows the ticket's txid as a link to the explorer, because the one
 * genuinely on-chain fact in this flow should be checkable somewhere other than
 * here (PROTOCOL.md §3).
 */

import { useState } from "react";

import type { UseTicket } from "../../hooks/useTicket";
import type { UseLedger } from "../../hooks/useLedger";
import { useAnnounce } from "../../hooks/useAnnounce";
import { formatBtc, useWallet } from "../../state/WalletProvider";
import { reserveAddress } from "../../lib/bitcoin/reserve";
import { txUrl } from "../../lib/bitcoin";
import { previewClaim, recordId, signClaim, type LaunchRules } from "../../lib/ledger";
import type { Candidate } from "../../lib/mining";
import { atoms, group } from "../../lib/format";
import type { Launch } from "../../data/launches";
import { Chip, KV, Notice, Panel } from "../../ui/primitives";

export interface ClaimPanelProps {
  launch: Launch;
  rules: LaunchRules;
  ledger: UseLedger;
  /** Ticket state, owned by the view because the challenge depends on it. */
  ticketing: UseTicket;
  /** Hash of the block that opened this epoch, or null while it loads. */
  epochBlockHash: string | null;
  /** Best candidate the miner has found this run. */
  candidate: Candidate | null;
  /** Called once a claim lands, so the miner can reset for the next epoch. */
  onClaimed?: () => void;
}

export function ClaimPanel({
  launch,
  rules,
  ledger,
  ticketing,
  epochBlockHash,
  candidate,
  onClaimed,
}: ClaimPanelProps) {
  const wallet = useWallet();
  const announce = useAnnounce();
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<bigint | null>(null);

  const vault = wallet.vault;
  const balance = wallet.balance;
  const ticket = ticketing.ticket;
  const enough = (balance?.total ?? 0) >= launch.ticketSats + 400; // + room for the fee
  const qualified = !!candidate && candidate.clz >= launch.minClz;
  // A ticket from an earlier epoch that no claim ever spent: paid for, and now
  // unusable. Saying so is kinder than letting it disappear from the page.
  const lapsed =
    ticketing.previous && ledger.state && !ledger.state.spentTickets.has(ticketing.previous.txid)
      ? ticketing.previous
      : null;
  const due = ledger.state ? previewClaim(ledger.ledger, rules, launch.epoch, launch.ticketSats) : 0n;

  const claim = async () => {
    if (!vault || !ticket || !candidate || !epochBlockHash) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const record = await signClaim(vault, ledger.ledger, rules, {
        epoch: launch.epoch,
        btcBlockHash: epochBlockHash,
        nonce: candidate.nonce,
        clz: candidate.clz,
        ticket: ticket.txid,
        ticketSats: ticket.sats,
      });
      if (ledger.append(record)) {
        setClaimed(BigInt(record.body.amount));
        void announce({
          kind: "mint",
          launch: launch.id,
          amount: BigInt(record.body.amount),
          sats: ticket.sats,
          ref: recordId(record.body),
          txid: ticket.txid,
        });
        onClaimed?.();
      }
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : String(err));
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Panel
      eyebrow="claim"
      title="Ticket and settlement"
      aside={
        <Chip tone={ticket ? "ok" : undefined}>
          {ticket ? "ticket held" : `${group(launch.ticketSats)} sats`}
        </Chip>
      }
    >
      {!vault && (
        <div className="stack-sm">
          <p>A claim is signed by your wallet key, so you need one first.</p>
          <a className="btn primary" href="#/wallet">Connect a wallet</a>
        </div>
      )}

      {vault && !ticket && (
        <div className="stack-sm">
          {lapsed && (
            <Notice tone="warn">
              Your ticket for epoch {lapsed.epoch} lapsed unused when that epoch closed. A ticket
              admits one claim in the epoch it was bought for, so it can no longer be used.
            </Notice>
          )}
          <KV
            rows={[
              ["Ticket price", `${group(launch.ticketSats)} sats`],
              ["Your balance", balance ? `${formatBtc(balance.total)} tBTC` : "…"],
              ["Epoch", String(launch.epoch)],
            ]}
          />
          <button
            className="btn primary block"
            disabled={ticketing.buying || !enough}
            onClick={() => void ticketing.buy()}
          >
            {ticketing.buying ? "Signing and broadcasting…" : `Buy a ticket for epoch ${launch.epoch}`}
          </button>
          {!enough && (
            <Notice tone="warn">
              Not enough balance for the ticket and its fee. The{" "}
              <a href="#/wallet">wallet page</a> links to faucets.
            </Notice>
          )}
          <Notice>
            The payment is a real transaction on {rules.network}. It goes to{" "}
            <span className="mono">{reserveAddress(launch.id).slice(0, 14)}…</span>, an
            address with no private key, so the satoshis are burned and
            <b> the ticket is not refundable</b>. A redeemable reserve needs the
            CKB-side asset from task V3.
          </Notice>
        </div>
      )}

      {vault && ticket && (
        <div className="stack-sm">
          <KV
            rows={[
              [
                "Ticket",
                <a key="tx" href={txUrl(ticket.txid)} target="_blank" rel="noreferrer">
                  {ticket.txid.slice(0, 12)}… ↗
                </a>,
              ],
              ["Paid", `${group(ticket.sats)} sats`],
              ["Difficulty", `${launch.minClz} zero bits`],
              ["Your best", candidate ? `${candidate.clz} zero bits` : "—"],
              ["This claim mints", `${atoms(due, launch.schedule.decimals, 4)} ${launch.symbol}`],
            ]}
          />

          <button
            className="btn primary block lg"
            disabled={!qualified || claiming || !epochBlockHash || due <= 0n}
            onClick={() => void claim()}
          >
            {claiming
              ? "Signing the record…"
              : qualified
                ? `Claim ${atoms(due, launch.schedule.decimals, 4)} ${launch.symbol}`
                : `Keep mining — ${launch.minClz} zero bits needed`}
          </button>

          {claimed !== null && (
            <Notice tone="cyan">
              Claimed <b>{atoms(claimed, launch.schedule.decimals, 4)} {launch.symbol}</b>. The
              record is signed by your key and chained to the one before it —
              see it on the <a href="#/holdings">holdings page</a>.
            </Notice>
          )}
          {claimError && <Notice tone="warn">{claimError}</Notice>}
          {!epochBlockHash && (
            <Notice tone="warn">
              Waiting for the hash of the block that opened this epoch. A claim
              binds to it, so it cannot be signed until it arrives.
            </Notice>
          )}
        </div>
      )}

      {ticketing.error && <Notice tone="warn">{ticketing.error}</Notice>}
    </Panel>
  );
}
