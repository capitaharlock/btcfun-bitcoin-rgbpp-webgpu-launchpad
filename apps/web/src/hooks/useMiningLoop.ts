/* The mining loop of one launch, as a hook the page's header and its wizard share.
 *
 * One owner for the loop because two parts of the page drive it: the big MINE
 * button in the launch's header and the wizard under it. Both read the same
 * derived step (`lib/mining/loop.ts`) and the same mining session, so they can
 * never disagree about what is happening.
 *
 * Nothing here signs by itself, whatever the wallet. Each transaction of a
 * round waits for its own button: the ticket (the round's one payment), the
 * arming of a cell the ticket created (network fee only), and the mint
 * (network fee only). For the demo and local wallets the button is the
 * confirmation; a passkey wallet asks for the passkey when it is pressed —
 * the same path, through `Vault.use()`.
 *
 * Before the ticket is signed the wallet must hold the whole round: the ticket,
 * its network fee, and the network fees still to come (the arming, when there
 * is one, and the mint). A ticket paid without the means to mint it would be
 * lost, so a short wallet signs nothing and is told how much is missing.
 *
 * MINE on the header or on a launch's card opens the wizard; that press, and
 * the hash the person chose to keep, are kept on the device (localStorage) so
 * a reload or a return visit carries on where the loop stood.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Launch } from "../data/launches";
import { InsufficientFunds } from "../lib/bitcoin";
import { fastFeeRate, getTxHex } from "../lib/bitcoin/provider";
import { canMine } from "../lib/launches/featured";
import { ticketKey } from "../lib/mining";
import { deriveLoop, inProgress, narrate, type Loop, type Narration } from "../lib/mining/loop";
import { ARM_SHAPE, fundingNeeded, mintShape, networkFee, plainFunding, shapeOf, strippedTx } from "../lib/rgbpp/bitcoin";
import { ACTIVE_RGBPP } from "../lib/rgbpp/config";
import { mintScript } from "../lib/rgbpp/launch";
import { planArm, planMint, planTicket, SEAL_SATS, type Paymaster, type Plan } from "../lib/rgbpp/operations";
import { NEW_CELL, REUSE, reward, TICKET_SATS, ticketChallenge, type Split } from "../lib/standard";
import { landingTxids, useTokens, type Operation } from "../state/TokensProvider";
import { useWallet } from "../state/WalletProvider";
import { useAnnounce } from "./useAnnounce";
import { useMiningSession, type MiningTarget, type UseMiningSession } from "./useMiningSession";

const INTENT_KEY = "btcfun:mine-intent:v1";
const KEEP_KEY = "btcfun:kept-hash:v1";
/** How often a step short of bitcoin re-reads the wallet's balance. */
export const FUNDS_POLL_MS = 10_000;

/** What signing the current step costs, and whether the wallet can pay for the rest of the round. */
export interface Costs {
  /** The ticket's split, for the ticket step; null for a step that pays only the network. */
  split: Split | null;
  /** What the paymaster asks beyond the ticket's budget for it, paid on top. */
  paymasterExtra: number;
  /** This transaction's network fee. */
  network: number;
  /** Network fees the round still has after this transaction: the arming, if any, and the mint. */
  later: number;
  /** Plain sats the wallet must hold before signing: this step and the fees still to come. */
  reserve: number;
  /** Confirmed plain sats: what an operation can be funded from now. */
  spendable: number;
  /** Plain sats still waiting for a block. */
  pending: number;
  short: boolean;
  feeRate: number;
}

export interface MiningLoop {
  loop: Loop;
  narration: Narration | null;
  mining: UseMiningSession;
  challenge: Uint8Array | null;
  /** True once MINE was pressed on this launch on this device, or the loop is already under way. */
  engaged: boolean;
  busy: boolean;
  failure: string | null;
  /** Null when the step signs nothing, or the estimate is not ready. */
  costs: Costs | null;
  /** The person chose the best hash so far: mining stopped, and the mint step is theirs to sign. */
  keeping: boolean;
  /** What the best hash mints at the ticket's rate; 0 below the minimum. */
  mintable: bigint;
  engage: () => void;
  /** Sign and send the ticket. */
  signTicket: () => void;
  /** Sign and send the arming of the paid cell. */
  signArm: () => void;
  /** Stop mining and keep the best hash; the mint step signs it. */
  keep: () => void;
  /** Mine on: the kept hash is let go. */
  unkeep: () => void;
  /** Sign and send the mint. */
  signMint: () => void;
  again: () => void;
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice still holds for this page.
  }
}

/** A value kept on the device under `key`, read once per key. */
function useStored(key: string): [string | null, (value: string | null) => void] {
  const [value, setValue] = useState(() => readStored(key));
  const set = useCallback(
    (next: string | null) => {
      writeStored(key, next);
      setValue(next);
    },
    [key],
  );
  return [value, set];
}

export function useMiningLoop(launch: Launch, tip: number, focus: boolean): MiningLoop {
  const wallet = useWallet();
  const tokens = useTokens();
  const announce = useAnnounce();
  const [intentFlag, setIntent] = useStored(`${INTENT_KEY}:${launch.id}`);
  const intent = intentFlag === "1";
  // The ticket (outpoint) whose best hash the person chose to mint.
  const [kept, setKept] = useStored(`${KEEP_KEY}:${launch.id}`);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; funds: boolean } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [feeRate, setFeeRate] = useState<number | null>(null);
  const [paymaster, setPaymaster] = useState<Paymaster | null>(null);
  const [creating, setCreating] = useState<{ txid: string; bytes: Uint8Array } | null>(null);

  const mintHash = useMemo(() => mintScript(ACTIVE_RGBPP, launch.terms).hash(), [launch.terms]);
  const miners = tokens.holdings ? (tokens.holdings.miners.get(mintHash) ?? []) : null;
  const held = tokens.holdings?.tokens.get(launch.tokenId) ?? [];
  const holding = held[0] ?? null;
  const operations = useMemo(() => tokens.operations.filter((op) => op.launchId === launch.id), [tokens.operations, launch.id]);

  // The ticket does not depend on the best hash, so it is derived first and
  // the session keyed by it; the full loop then folds the best hash in.
  const facts = {
    wallet: wallet.vault?.kind ?? null,
    offered: canMine(launch),
    launchOpen: launch.open,
    miners,
    operations,
    dismissed,
  };
  const ticket = deriveLoop({ ...facts, bestClz: null }).ticket;
  // Keyed by the outpoint string, not the ticket object: that object is rebuilt
  // when a landing ticket settles, and the run must carry on through it.
  const key = ticket ? ticketKey(ticket.txid, ticket.vout) : null;
  const target = useMemo<MiningTarget | null>(() => {
    if (!key) return null;
    const [txid, vout] = key.split(":");
    return { key, challenge: ticketChallenge(txid, Number(vout)) };
  }, [key]);
  const mining = useMiningSession(target);
  const best = mining.progress.best;

  const loop = deriveLoop({ ...facts, bestClz: best?.clz ?? null });
  const { state } = loop;
  const signs = state.at === "buy" || state.at === "arm" || state.at === "mint";

  // The fee rate, fresh for each step that signs.
  useEffect(() => {
    if (!signs) return;
    let live = true;
    void fastFeeRate().then((rate) => live && setFeeRate(rate));
    return () => {
      live = false;
    };
  }, [signs, state.at]);

  // The paymaster's fee, when a ticket creates its cell.
  const needsPaymaster = state.at === "buy" && state.cell === null;
  useEffect(() => {
    if (!needsPaymaster || paymaster !== null) return;
    let live = true;
    void tokens.service.paymaster().then(
      (p) => live && setPaymaster(p),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [needsPaymaster, paymaster, tokens.service]);

  // Arming carries the ticket that created the cell: kept when this browser
  // signed it, fetched otherwise.
  const paidTxid = state.at === "arm" ? state.cell.seal.txid : null;
  const ownHex = operations.find((op) => op.btcTxid === paidTxid)?.hex;
  useEffect(() => {
    if (!paidTxid || creating?.txid === paidTxid) return;
    let live = true;
    void (ownHex ? Promise.resolve(ownHex) : getTxHex(paidTxid)).then(
      (hex) => live && setCreating({ txid: paidTxid, bytes: strippedTx(hex) }),
      (err: unknown) => live && setFailure({ message: `Could not read the ticket transaction: ${String(err)}`, funds: false }),
    );
    return () => {
      live = false;
    };
  }, [paidTxid, ownHex, creating]);

  const mintable = best && ticket ? reward(best.clz, launch.h0, ticket.anchor) : 0n;

  // The plan for the step on screen, built exactly as it will be signed.
  // Keyed by what shapes it — not by `state`, which is rebuilt every render.
  const buyCell = state.at === "buy" ? state.cell : undefined;
  const armCell = state.at === "arm" ? state.cell : null;
  const mintCell = state.at === "mint" ? state.cell : null;
  const plan = useMemo<Plan | null>(() => {
    try {
      if (buyCell !== undefined) {
        if (buyCell === null && !paymaster) return null;
        return planTicket(ACTIVE_RGBPP, launch.terms, { idle: buyCell, paymaster, tip });
      }
      if (armCell) {
        return creating?.txid === armCell.seal.txid ? planArm(ACTIVE_RGBPP, launch.terms, armCell, creating.bytes, tip) : null;
      }
      if (mintCell && best) {
        return planMint(ACTIVE_RGBPP, launch.terms, { miner: mintCell, held: holding, nonce: best.nonce, reward: mintable });
      }
    } catch {
      // A tip behind the opening block: the step is not offered, so nothing to price.
    }
    return null;
  }, [buyCell, armCell, mintCell, paymaster, creating, launch.terms, tip, holding, best, mintable]);

  const costs = useMemo<Costs | null>(() => {
    if (!plan || feeRate === null || !wallet.balance) return null;
    const landing = landingTxids(tokens.operations);
    const spendable = plainFunding(wallet.balance.utxos, landing).reduce((n, u) => n + u.value, 0);
    const pending = wallet.balance.utxos.filter((u) => !u.confirmed && u.value !== SEAL_SATS).reduce((n, u) => n + u.value, 0);
    const network = networkFee(shapeOf(plan), feeRate);
    const mintLater = fundingNeeded(mintShape(holding !== null), feeRate);
    const later = buyCell !== undefined ? (buyCell === null ? fundingNeeded(ARM_SHAPE, feeRate) : 0) + mintLater : armCell ? mintLater : 0;
    const reserve = fundingNeeded(plan, feeRate) + later;
    const split = buyCell === undefined ? null : buyCell === null ? NEW_CELL : REUSE;
    const paymasterExtra = buyCell === null && paymaster ? Math.max(0, paymaster.feeSats - NEW_CELL.paymaster) : 0;
    return { split, paymasterExtra, network, later, reserve, spendable, pending, short: spendable < reserve, feeRate };
  }, [plan, feeRate, wallet.balance, tokens.operations, holding, buyCell, armCell, paymaster]);

  // Short of bitcoin: ask for the balance every 10 s rather than the wallet's
  // usual pace, so coins from a faucet unlock the step soon after they land.
  const short = costs?.short ?? false;
  const { refresh } = wallet;
  useEffect(() => {
    if (!short) return;
    const timer = setInterval(() => void refresh(), FUNDS_POLL_MS);
    return () => clearInterval(timer);
  }, [short, refresh]);

  const run = useCallback(async (action: () => Promise<Operation>) => {
    setBusy(true);
    setFailure(null);
    try {
      return await action();
    } catch (err) {
      setFailure({ message: err instanceof Error ? err.message : String(err), funds: err instanceof InsufficientFunds });
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const { submit } = tokens;
  const signTicket = useCallback(() => {
    if (buyCell === undefined || !plan || !costs || costs.short) return;
    const meta = { launchId: launch.id, tokenId: launch.tokenId, kind: "ticket", sats: TICKET_SATS, anchor: tip, newCell: buyCell === null } as const;
    void run(() => submit(plan, meta, { feeRate: costs.feeRate }));
  }, [buyCell, plan, costs, run, submit, launch.id, launch.tokenId, tip]);

  const signArm = useCallback(() => {
    if (!armCell || !plan || !costs || costs.short) return;
    const meta = { launchId: launch.id, tokenId: launch.tokenId, kind: "arm", anchor: tip } as const;
    void run(() => submit(plan, meta, { feeRate: costs.feeRate }));
  }, [armCell, plan, costs, run, submit, launch.id, launch.tokenId, tip]);

  const signMint = useCallback(() => {
    if (!mintCell || !plan || !costs || costs.short) return;
    const amount = mintable;
    mining.stop();
    void run(async () => {
      const meta = { launchId: launch.id, tokenId: launch.tokenId, kind: "mint", atoms: amount.toString() } as const;
      const op = await submit(plan, meta, { feeRate: costs.feeRate });
      // The public feed points at the transaction; anyone can check the mint
      // against both chains on the proof page.
      await announce({ kind: "mint", launch: launch.id, amount, ref: op.btcTxid, txid: op.btcTxid });
      return op;
    });
  }, [mintCell, plan, costs, mintable, mining, run, submit, announce, launch.id, launch.tokenId]);

  const engage = useCallback(() => setIntent("1"), [setIntent]);

  // Arriving from a MINE button (`/launch/<id>/mine`) is the press itself.
  useEffect(() => {
    if (focus) engage();
  }, [focus, engage]);

  const again = useCallback(() => {
    if (state.at === "minted") setDismissed(state.op.btcTxid);
    setKept(null);
    setFailure(null);
    engage();
  }, [state, engage, setKept]);

  const keep = useCallback(() => {
    if (!key) return;
    mining.stop();
    setKept(key);
  }, [key, mining, setKept]);
  const unkeep = useCallback(() => setKept(null), [setKept]);
  const keeping = key !== null && kept === key;

  const narration = narrate(state, {
    symbol: launch.symbol,
    running: mining.running,
    unfunded: (short && !busy) || (failure?.funds ?? false),
    busy,
  });

  return {
    loop,
    narration,
    mining,
    challenge: target?.challenge ?? null,
    engaged: intent || inProgress(state),
    busy,
    failure: failure?.message ?? null,
    costs: failure?.funds && costs ? { ...costs, short: true } : costs,
    keeping,
    mintable,
    engage,
    signTicket,
    signArm,
    keep,
    unkeep,
    signMint,
    again,
  };
}
