/* Wallet state for the whole app.
 *
 * One provider owns the vault, the on-chain balance and the chain tip, because
 * all three are shared by the header, the launch page and the wallet page, and
 * three independent pollers against the same address would be three chances to
 * disagree about the balance.
 *
 * Balances are refetched on a timer and immediately after a broadcast, so a
 * ticket payment is reflected without the visitor reloading.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  ACTIVE,
  broadcast,
  buildPayment,
  connectDemo as connectDemoVault,
  connectPasskey as connectPasskeyVault,
  createLocal,
  currentVault,
  forgetVault,
  getBalance,
  getFeeRate,
  getTipHeight,
  importLocal,
  isPasskeySupported,
  type AddressBalance,
  type Vault,
} from "../lib/bitcoin";
import { btc } from "../lib/format";

/** How often to refetch the balance and tip while a wallet is connected. */
const POLL_MS = 15_000;

export interface PaymentResult {
  txid: string;
  amountSats: number;
  feeSats: number;
}

interface WalletContextValue {
  vault: Vault | null;
  balance: AddressBalance | null;
  /** Bitcoin tip height — the clock the emission schedule runs on. */
  tipHeight: number | null;
  /** True while a connect or payment is in flight. */
  busy: boolean;
  /** True while a balance refetch is in flight. */
  refreshing: boolean;
  error: string | null;
  passkeySupported: boolean;
  connectPasskey: () => Promise<void>;
  /** The shared testnet3 demo wallet (`vault.ts`). Instant, no gesture. */
  connectDemo: () => Promise<void>;
  connectLocal: () => Promise<void>;
  restoreLocal: (entropy: Uint8Array) => Promise<void>;
  /** Forget the wallet on this browser. What that loses depends on its kind. */
  logOut: () => void;
  refresh: () => Promise<void>;
  /** Build, sign and broadcast a payment. Refetches the balance afterwards. */
  pay: (to: string, amountSats: number, memo?: Uint8Array) => Promise<PaymentResult>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [vault, setVault] = useState<Vault | null>(null);
  const [balance, setBalance] = useState<AddressBalance | null>(null);
  const [tipHeight, setTipHeight] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  // Rehydrate whatever this device already has. Never prompts: the address and
  // identity are cached, so the header can render before any biometric gesture.
  useEffect(() => {
    try {
      setVault(currentVault());
    } catch (err) {
      setError(describe(err));
    }
  }, []);

  // The tip is the emission schedule's clock (PROTOCOL.md §6), so every screen
  // needs it whether or not anyone has connected a wallet.
  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const tip = await getTipHeight();
        if (live) setTipHeight(tip);
      } catch {
        // A missing tip degrades the header, not the app. The error surfaced by
        // `refresh` is the one worth showing.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  const refresh = useCallback(async () => {
    const address = vault?.address;
    if (!address || inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      setBalance(await getBalance(address));
      setError(null);
    } catch (err) {
      setError(describe(err));
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [vault?.address]);

  useEffect(() => {
    if (!vault) {
      setBalance(null);
      return;
    }
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [vault, refresh]);

  /** Wrap a connect action so errors surface once and `busy` always clears. */
  const connect = useCallback(async (open: () => Promise<Vault>) => {
    setBusy(true);
    setError(null);
    try {
      setVault(await open());
    } catch (err) {
      setError(describe(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const pay = useCallback(
    async (to: string, amountSats: number, memo?: Uint8Array): Promise<PaymentResult> => {
      if (!vault) throw new Error("Connect a wallet first.");
      setBusy(true);
      setError(null);
      try {
        // Fetch UTXOs and the fee rate at send time rather than trusting the
        // polled snapshot: spending an output that a previous send already
        // consumed produces a rejection the visitor cannot interpret.
        const [fresh, feeRate] = await Promise.all([getBalance(vault.address), getFeeRate()]);
        const signed = await vault.use((key) =>
          buildPayment(key, { to, amountSats, feeRate, utxos: fresh.utxos, memo }),
        );
        const txid = await broadcast(signed.hex);
        void refresh();
        return { txid, amountSats, feeSats: signed.selection.fee };
      } catch (err) {
        setError(describe(err));
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [vault, refresh],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      vault,
      balance,
      tipHeight,
      busy,
      refreshing,
      error,
      passkeySupported: isPasskeySupported(),
      connectPasskey: () => connect(connectPasskeyVault),
      connectDemo: () => connect(() => connectDemoVault()),
      connectLocal: () => connect(createLocal),
      restoreLocal: (entropy: Uint8Array) => connect(() => importLocal(entropy)),
      logOut: () => {
        forgetVault();
        setVault(null);
        setBalance(null);
        setError(null);
      },
      refresh,
      pay,
    }),
    [vault, balance, tipHeight, busy, refreshing, error, connect, refresh, pay],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

/** The network this build talks to. Re-exported so views need one import. */
export const NETWORK = ACTIVE;

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** `tb1qab…9xyz` — enough to recognise, short enough for a header. */
export function shortAddress(address: string): string {
  return address.length <= 18 ? address : `${address.slice(0, 10)}…${address.slice(-5)}`;
}

/** Satoshis as BTC, trimmed but never in scientific notation. */
export function formatBtc(sats: number): string {
  return btc(sats);
}
