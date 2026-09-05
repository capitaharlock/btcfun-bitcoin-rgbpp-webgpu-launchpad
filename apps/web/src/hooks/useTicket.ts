/* The ticket that admits one claim.
 *
 * A ticket is a real payment on the active network: satoshis to the launch's
 * sink address, carrying an OP_RETURN that binds the payment to the launch,
 * the epoch and the buyer's identity. That commitment is what makes the txid
 * safe to name in a claim — without it, any payment of the right size could be
 * presented as a ticket for any epoch.
 *
 * Tickets are remembered per launch, epoch and identity, because a page reload
 * between paying and claiming must not cost someone their money. They are not
 * remembered across identities: another wallet's ticket is not yours.
 */

import { useCallback, useEffect, useState } from "react";

import { reserveAddress } from "../lib/bitcoin/reserve";
import { concatBytes } from "../lib/bytes";
import { useWallet } from "../state/WalletProvider";

const STORAGE_KEY = "btcfun:tickets:v1";

export interface Ticket {
  txid: string;
  launch: string;
  epoch: number;
  /** Buyer's identity, so one wallet's ticket never appears under another. */
  identity: string;
  sats: number;
  boughtAt: string;
}

export interface UseTicket {
  /** The ticket for this launch, epoch and wallet, if one was bought. */
  ticket: Ticket | null;
  /** True while the payment is being built, signed and broadcast. */
  buying: boolean;
  error: string | null;
  buy: () => Promise<void>;
  /** Forget a ticket — used when the epoch has moved on. */
  discard: () => void;
}

function slot(launch: string, epoch: number, identity: string): string {
  return `${launch}:${epoch}:${identity}`;
}

function readAll(): Record<string, Ticket> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, Ticket>;
  } catch {
    return {};
  }
}

function writeAll(tickets: Record<string, Ticket>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

/**
 * The OP_RETURN payload: a tag, the launch, the epoch and the buyer.
 *
 * Bound at payment time so the on-chain record says what the money was for.
 * Kept under 80 bytes, the standard OP_RETURN relay limit.
 */
export function ticketMemo(launch: string, epoch: number, identity: string): Uint8Array {
  const text = new TextEncoder().encode(`btcfun:t1:${launch}:${epoch}:`);
  // 8 bytes of the identity is enough to bind the payment to this wallet while
  // leaving room for longer launch ids; the full identity is in the claim.
  const who = new TextEncoder().encode(identity.slice(0, 16));
  return concatBytes(text, who).slice(0, 80);
}

export function useTicket(launch: string, epoch: number, ticketSats: number): UseTicket {
  const wallet = useWallet();
  const identity = wallet.vault?.identity ?? null;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!identity) {
      setTicket(null);
      return;
    }
    setTicket(readAll()[slot(launch, epoch, identity)] ?? null);
    setError(null);
  }, [launch, epoch, identity]);

  const buy = useCallback(async () => {
    if (!identity) {
      setError("Connect a wallet before buying a ticket.");
      return;
    }
    setBuying(true);
    setError(null);
    try {
      const { txid } = await wallet.pay(
        reserveAddress(launch),
        ticketSats,
        ticketMemo(launch, epoch, identity),
      );
      const bought: Ticket = {
        txid,
        launch,
        epoch,
        identity,
        sats: ticketSats,
        boughtAt: new Date().toISOString(),
      };
      const all = readAll();
      all[slot(launch, epoch, identity)] = bought;
      writeAll(all);
      setTicket(bought);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBuying(false);
    }
  }, [wallet, launch, epoch, identity, ticketSats]);

  const discard = useCallback(() => {
    if (!identity) return;
    const all = readAll();
    delete all[slot(launch, epoch, identity)];
    writeAll(all);
    setTicket(null);
  }, [launch, epoch, identity]);

  return { ticket, buying, error, buy, discard };
}
