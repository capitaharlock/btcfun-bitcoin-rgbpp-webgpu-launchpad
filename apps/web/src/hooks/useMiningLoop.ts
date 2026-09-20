/* The mining loop of one launch, as a hook the page's header and its wizard share.
 *
 * One owner for the loop because two parts of the page drive it: the big MINE
 * button in the launch's header and the wizard under it. Both read the same
 * derived step (`lib/mining/loop.ts`) and the same mining session, so they can
 * never disagree about what is happening.
 *
 * Pressing MINE is the one consent the loop asks of a demo-wallet user: that
 * wallet's key is public and shared, so after the press it opens the miner
 * cell and pays the ticket by itself. A wallet of the person's own always
 * waits for a click on the step that spends. A MINE on a launch's card counts
 * as the press. It is kept for the tab (sessionStorage), so a reload in the
 * middle of the loop carries on.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Launch } from "../data/launches";
import { getFeeRate, InsufficientFunds } from "../lib/bitcoin";
import { canMine } from "../lib/launches/featured";
import { ticketKey } from "../lib/mining";
import { deriveLoop, inProgress, narrate, type Loop, type Narration } from "../lib/mining/loop";
import { fundingNeeded, plainFunding } from "../lib/rgbpp/bitcoin";
import { ACTIVE_RGBPP } from "../lib/rgbpp/config";
import { mintScript } from "../lib/rgbpp/launch";
import { planMint, planOpen, planTicket, SEAL_SATS, type MinerCell, type Paymaster, type Plan } from "../lib/rgbpp/operations";
import { reward, TICKET_SATS, ticketChallenge } from "../lib/standard";
import { landingTxids, useTokens, type Operation } from "../state/TokensProvider";
import { useWallet } from "../state/WalletProvider";
import { useAnnounce } from "./useAnnounce";
import { useMiningSession, type MiningTarget, type UseMiningSession } from "./useMiningSession";

const INTENT_KEY = "btcfun:mine-intent:v1";

/** Bitcoin the current step needs, against what the wallet can spend on it. */
export interface Funds {
  /** About what the step's transaction takes from plain funding, fee included. */
  needed: number;
  /** Confirmed plain sats: what an operation can be funded from now. */
  spendable: number;
  /** Plain sats still waiting for a block. */
  pending: number;
  short: boolean;
}

export interface MiningLoop {
  loop: Loop;
  narration: Narration | null;
  mining: UseMiningSession;
  challenge: Uint8Array | null;
  /** True once MINE was pressed on this launch in this tab, or the loop is already under way. */
  engaged: boolean;
  /** The current step signs by itself: a demo wallet after MINE was pressed. */
  auto: boolean;
  busy: boolean;
  failure: string | null;
  /** Null when the step spends nothing, or the estimate is not ready. */
  funds: Funds | null;
  paymaster: Paymaster | null;
  /** What the best hash mints at the ticket's rate; 0 below the minimum. */
  mintable: bigint;
  engage: () => void;
  open: () => void;
  pay: (cell: MinerCell) => void;
  mint: () => void;
  again: () => void;
}

function readIntent(launchId: string): boolean {
  try {
    return sessionStorage.getItem(`${INTENT_KEY}:${launchId}`) === "1";
  } catch {
    return false;
  }
}

function writeIntent(launchId: string): void {
  try {
    sessionStorage.setItem(`${INTENT_KEY}:${launchId}`, "1");
  } catch {
    // Storage blocked: the press still holds for this page.
  }
}

export function useMiningLoop(launch: Launch, tip: number, focus: boolean): MiningLoop {
  const wallet = useWallet();
  const tokens = useTokens();
  const announce = useAnnounce();
  const [intent, setIntent] = useState(() => readIntent(launch.id));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; funds: boolean } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [feeRate, setFeeRate] = useState<number | null>(null);
  const [paymaster, setPaymaster] = useState<Paymaster | null>(null);

  const mintHash = useMemo(() => mintScript(ACTIVE_RGBPP, launch.terms).hash(), [launch.terms]);
  const miners = tokens.holdings ? (tokens.holdings.miners.get(mintHash) ?? []) : null;
  const held = tokens.holdings?.tokens.get(launch.tokenId) ?? [];
  const operations = useMemo(() => tokens.operations.filter((op) => op.launchId === launch.id), [tokens.operations, launch.id]);

  // The ticket does not depend on the best hash, so it is derived first and
  // the session keyed by it; the full loop then folds the best hash in.
  const ticket = deriveLoop({
    wallet: wallet.vault?.kind ?? null,
    offered: canMine(launch),
    launchOpen: launch.open,
    miners,
    operations,
    bestClz: null,
    dismissed,
  }).ticket;
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

  const loop = deriveLoop({
    wallet: wallet.vault?.kind ?? null,
    offered: canMine(launch),
    launchOpen: launch.open,
    miners,
    operations,
    bestClz: best?.clz ?? null,
    dismissed,
  });
  const { state } = loop;
  const spends = state.at === "open" || state.at === "pay";
  const auto = intent && wallet.vault?.kind === "demo";

  // What the spending steps cost: the fee rate and, to open, the paymaster's fee.
  useEffect(() => {
    if (!spends || feeRate !== null) return;
    let live = true;
    void getFeeRate().then(
      (rate) => live && setFeeRate(rate),
      () => live && setFeeRate(1),
    );
    return () => {
      live = false;
    };
  }, [spends, feeRate]);
  useEffect(() => {
    if (state.at !== "open" || paymaster !== null) return;
    let live = true;
    void tokens.service.paymaster().then(
      (p) => live && setPaymaster(p),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [state.at, paymaster, tokens.service]);

  // Keyed by the cell, not the state object, which is rebuilt on every render.
  const payCell = state.at === "pay" ? state.cell : null;
  const opening = state.at === "open";
  const plan = useMemo<Plan | null>(() => {
    try {
      if (opening) return paymaster ? planOpen(ACTIVE_RGBPP, launch.terms, paymaster) : null;
      if (payCell) return planTicket(ACTIVE_RGBPP, launch.terms, payCell, tip);
    } catch {
      // A tip behind the opening block: the step is not offered, so nothing to price.
    }
    return null;
  }, [opening, payCell, paymaster, launch.terms, tip]);

  const funds = useMemo<Funds | null>(() => {
    if (!plan || feeRate === null || !wallet.balance) return null;
    const landing = landingTxids(tokens.operations);
    const spendable = plainFunding(wallet.balance.utxos, landing).reduce((n, u) => n + u.value, 0);
    const pending = wallet.balance.utxos
      .filter((u) => !u.confirmed && u.value !== SEAL_SATS)
      .reduce((n, u) => n + u.value, 0);
    const needed = fundingNeeded(plan, feeRate);
    return { needed, spendable, pending, short: spendable < needed };
  }, [plan, feeRate, wallet.balance, tokens.operations]);

  // Set when a ticket is sent, so mining starts on it without another click.
  const mineOn = useRef<string | null>(null);

  const run = useCallback(
    async (action: () => Promise<Operation>) => {
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
    },
    [],
  );

  const open = useCallback(() => {
    void run(async () =>
      tokens.submit(planOpen(ACTIVE_RGBPP, launch.terms, paymaster ?? (await tokens.service.paymaster())), {
        kind: "open",
        launchId: launch.id,
        tokenId: launch.tokenId,
      }),
    );
  }, [run, tokens, launch, paymaster]);

  const pay = useCallback(
    (cell: MinerCell) => {
      void run(async () => {
        const op = await tokens.submit(planTicket(ACTIVE_RGBPP, launch.terms, cell, tip), {
          kind: "ticket",
          launchId: launch.id,
          tokenId: launch.tokenId,
          sats: TICKET_SATS,
          anchor: tip,
        });
        mineOn.current = op.btcTxid;
        return op;
      });
    },
    [run, tokens, launch, tip],
  );

  const mint = useCallback(() => {
    if (state.at !== "mint" || !best) return;
    const cell = state.cell;
    mining.stop();
    void run(async () => {
      const amount = reward(best.clz, launch.h0, cell.data.anchor);
      const holding = held[0] ?? null;
      const op = await tokens.submit(
        planMint(ACTIVE_RGBPP, launch.terms, {
          miner: cell,
          held: holding,
          nonce: best.nonce,
          reward: amount,
          paymaster: holding ? null : await tokens.service.paymaster(),
        }),
        { kind: "mint", launchId: launch.id, tokenId: launch.tokenId, atoms: amount.toString() },
      );
      // The public feed points at the transaction; anyone can check the mint
      // against both chains on the proof page.
      await announce({ kind: "mint", launch: launch.id, amount, ref: op.btcTxid, txid: op.btcTxid });
      return op;
    });
  }, [state, best, mining, run, launch, held, tokens, announce]);

  const engage = useCallback(() => {
    writeIntent(launch.id);
    setIntent(true);
  }, [launch.id]);

  // Arriving from a MINE button (`/launch/<id>/mine`) is the press itself.
  useEffect(() => {
    if (focus) engage();
  }, [focus, engage]);

  const again = useCallback(() => {
    if (state.at === "minted") setDismissed(state.op.btcTxid);
    setFailure(null);
    engage();
  }, [state, engage]);

  // The demo wallet, once MINE is pressed: open and pay without a click. Once
  // per step and balance, so a refusal is shown rather than retried in a loop;
  // money arriving is what earns another try.
  const tried = useRef<string | null>(null);
  const cellKey = state.at === "pay" ? `${state.cell.seal.txid}:${state.cell.seal.vout}` : "";
  useEffect(() => {
    if (!auto || busy || !spends || !funds || funds.short) return;
    const attempt = `${state.at}:${cellKey}:${funds.spendable}`;
    if (tried.current === attempt) return;
    tried.current = attempt;
    if (state.at === "open") open();
    else if (state.at === "pay") pay(state.cell);
  }, [auto, busy, spends, funds, state, cellKey, open, pay]);

  // A ticket just sent: mine it at once. Unconfirmed is fine — its output,
  // the challenge, exists from the moment the transaction does.
  useEffect(() => {
    if (!mineOn.current || !key || !key.startsWith(`${mineOn.current}:`)) return;
    mineOn.current = null;
    if (!mining.running) mining.start();
  }, [key, mining]);

  const mintable = best && ticket ? reward(best.clz, launch.h0, ticket.anchor) : 0n;
  const funded = funds === null || !funds.short;
  const narration = narrate(state, {
    symbol: launch.symbol,
    running: mining.running,
    unfunded: (!funded && !busy) || (failure?.funds ?? false),
    auto,
    busy,
  });

  return {
    loop,
    narration,
    mining,
    challenge: target?.challenge ?? null,
    engaged: intent || inProgress(state),
    auto,
    busy,
    failure: failure?.message ?? null,
    funds: failure?.funds && funds ? { ...funds, short: true } : funds,
    paymaster,
    mintable,
    engage,
    open,
    pay,
    mint,
    again,
  };
}
