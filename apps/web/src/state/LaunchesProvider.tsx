/* The launch registry.
 *
 * Launches come from three places and every screen needs the same merged view:
 * the seeded fixtures, launches this browser created, and launches the index
 * has seen other people commit. Merging in a provider rather than in a hook
 * means one poll of the index for the whole app instead of one per component
 * that happens to render a launch name.
 *
 * A commitment arriving from the index is verified before it is trusted — the
 * signature must be the creator's and the spec must survive its own validation
 * — so a tampering index cannot inject a launch with, say, a zero difficulty.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { FALLBACK_TIP, type LaunchSpec } from "../data/launches";
import { feed, faultIn as activityFault, type ActivityEntry } from "../lib/activity";
import { createdLocally, specFor, type LaunchCommitment } from "../lib/launches/create";
import { useWallet } from "./WalletProvider";

/** How often to look for launches other people committed. */
const POLL_MS = 45_000;

interface LaunchesContextValue {
  /** Current Bitcoin height, or the placeholder until the provider answers. */
  tip: number;
  /** Specs beyond the fixtures: created here, or seen through the index. */
  extra: LaunchSpec[];
  /** Re-read local creations and re-poll the index. */
  refresh: () => void;
}

const LaunchesContext = createContext<LaunchesContextValue | null>(null);

export function LaunchesProvider({ children }: { children: ReactNode }) {
  const { tipHeight } = useWallet();
  const tip = tipHeight ?? FALLBACK_TIP;
  const [remote, setRemote] = useState<LaunchCommitment[]>([]);
  const [localRevision, setLocalRevision] = useState(0);

  const load = useCallback(async () => {
    const result = await feed({ kind: "launch", limit: 100 });
    setRemote(result.entries.flatMap(commitmentIn));
  }, []);

  useEffect(() => {
    let live = true;
    const tick = () => {
      if (live) void load();
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [load]);

  const extra = useMemo(() => {
    const byId = new Map<string, LaunchCommitment>();
    // Local first: a creator's own copy wins over the index's echo of it, so a
    // launch stays visible the moment it is signed.
    for (const commitment of [...createdLocally(), ...remote]) {
      if (!byId.has(commitment.id)) byId.set(commitment.id, commitment);
    }
    return [...byId.values()].map((commitment) => specFor(commitment, tip));
    // `localRevision` is the invalidation signal for the storage-backed list.
  }, [remote, tip, localRevision]);

  const value = useMemo<LaunchesContextValue>(
    () => ({
      tip,
      extra,
      refresh: () => {
        setLocalRevision((r) => r + 1);
        void load();
      },
    }),
    [tip, extra, load],
  );

  return <LaunchesContext.Provider value={value}>{children}</LaunchesContext.Provider>;
}

export function useLaunchRegistry(): LaunchesContextValue {
  const ctx = useContext(LaunchesContext);
  if (!ctx) throw new Error("useLaunchRegistry must be used inside <LaunchesProvider>");
  return ctx;
}

/**
 * Pull a verified commitment out of a `launch` activity event.
 *
 * Returns nothing rather than throwing: one bad event must not empty the
 * registry, and the index is untrusted input by design.
 */
function commitmentIn(entry: ActivityEntry): LaunchCommitment[] {
  const { body } = entry.signed;
  if (body.kind !== "launch" || !body.meta) return [];
  if (activityFault(entry.signed) !== null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.meta);
  } catch {
    return [];
  }

  const commitment = parsed as LaunchCommitment;
  if (commitment?.v !== "btcfun/launch/1") return [];
  // The event's own fields must agree with the payload they carry, or the
  // signature covers one launch while the feed indexes another.
  if (commitment.id !== body.launch || commitment.creator !== body.actor) return [];
  if (!isPlausible(commitment)) return [];

  return [commitment];
}

/** Bounds a commitment has to satisfy to be rendered at all. Mirrors the
 *  creation form's rules; a launch that fails them was never valid. */
function isPlausible(c: LaunchCommitment): boolean {
  return (
    /^[a-z][a-z0-9]{1,7}$/.test(c.id) &&
    typeof c.symbol === "string" &&
    typeof c.name === "string" &&
    typeof c.blurb === "string" &&
    c.blurb.length <= 160 &&
    Number.isInteger(c.h0) && c.h0 > 0 &&
    Number.isInteger(c.epochBlocks) && c.epochBlocks >= 1 && c.epochBlocks <= 144 &&
    Number.isInteger(c.halfLife) && c.halfLife >= 36 && c.halfLife <= 20_160 &&
    Number.isInteger(c.decimals) && c.decimals >= 0 && c.decimals <= 12 &&
    Number.isInteger(c.ticketSats) && c.ticketSats >= 546 &&
    Number.isInteger(c.minClz) && c.minClz >= 8 && c.minClz <= 32
  );
}
