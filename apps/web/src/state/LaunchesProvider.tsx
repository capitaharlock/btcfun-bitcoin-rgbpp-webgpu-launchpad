/* The launch registry.
 *
 * Launches come from two places and every screen needs the same merged view:
 * launches this browser announced, and launches the index has seen others
 * announce. Merging in a provider means one poll of the index for the whole
 * app instead of one per component that renders a launch name.
 *
 * An announcement from the index is verified before it is trusted: the
 * signature must be the announcer's, and the id and token id must be the ones
 * its own terms produce. So a tampering index can hide a launch, but it cannot
 * show one whose name belongs to a different token.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { FALLBACK_TIP, specFor, type LaunchSpec } from "../data/launches";
import { feed, faultIn as activityFault, type ActivityEntry } from "../lib/activity";
import { idMatches, LAUNCH_ID_PATTERN, type LaunchCommitment } from "../lib/launches/announcement";
import { createdLocally } from "../lib/launches/create";
import { resolveAnnouncements, type Heard } from "../lib/launches/registry";
import { useWallet } from "./WalletProvider";

/** How often to look for launches other people announced. */
const POLL_MS = 45_000;

interface LaunchesContextValue {
  /** Current Bitcoin height, or the placeholder until the provider answers. */
  tip: number;
  /** False until the provider has answered once — until then `tip` is a stand-in. */
  synced: boolean;
  specs: LaunchSpec[];
  /** True once the index has answered at least once, successfully or not. */
  indexRead: boolean;
  /** Re-read local announcements and re-poll the index. */
  refresh: () => void;
}

const LaunchesContext = createContext<LaunchesContextValue | null>(null);

export function LaunchesProvider({ children }: { children: ReactNode }) {
  const { tipHeight } = useWallet();
  const [remote, setRemote] = useState<Heard[]>([]);
  const [indexRead, setIndexRead] = useState(false);
  const [localRevision, setLocalRevision] = useState(0);

  const load = useCallback(async () => {
    try {
      const result = await feed({ kind: "launch", limit: 100 });
      setRemote(result.entries.flatMap(commitmentIn));
    } finally {
      setIndexRead(true);
    }
  }, []);

  useEffect(() => {
    let live = true;
    const tick = () => {
      if (live) void load().catch(() => undefined);
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [load]);

  const specs = useMemo(() => {
    const valid = (c: LaunchCommitment) => isPlausible(c) && idMatches(c);
    return resolveAnnouncements(
      createdLocally().filter(valid),
      remote.filter((heard) => valid(heard.commitment)),
    )
      .sort((a, b) => b.at.localeCompare(a.at))
      .map(specFor);
    // `localRevision` is the invalidation signal for the storage-backed list.
  }, [remote, localRevision]);

  const value = useMemo<LaunchesContextValue>(
    () => ({
      tip: tipHeight ?? FALLBACK_TIP,
      synced: tipHeight !== null,
      specs,
      indexRead,
      refresh: () => {
        setLocalRevision((r) => r + 1);
        void load().catch(() => undefined);
      },
    }),
    [tipHeight, specs, indexRead, load],
  );

  return <LaunchesContext.Provider value={value}>{children}</LaunchesContext.Provider>;
}

export function useLaunchRegistry(): LaunchesContextValue {
  const ctx = useContext(LaunchesContext);
  if (!ctx) throw new Error("useLaunchRegistry must be used inside <LaunchesProvider>");
  return ctx;
}

/**
 * Pull a verified announcement out of a `launch` activity event.
 *
 * Returns nothing rather than throwing: one bad event must not empty the
 * registry, and the index is untrusted input by design.
 */
function commitmentIn(entry: ActivityEntry): Heard[] {
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
  if (commitment?.v !== "btcfun/launch/3") return [];
  // The event's own fields must agree with the payload they carry, or the
  // signature covers one launch while the feed indexes another.
  if (commitment.id !== body.launch || commitment.creator !== body.actor) return [];
  return [{ commitment, receivedAt: entry.receivedAt }];
}

/** Shape checks an announcement must pass before its terms are even derived. */
function isPlausible(c: LaunchCommitment): boolean {
  return (
    typeof c === "object" &&
    c !== null &&
    typeof c.id === "string" &&
    LAUNCH_ID_PATTERN.test(c.id) &&
    typeof c.symbol === "string" &&
    /^[A-Z][A-Z0-9]{1,7}$/.test(c.symbol) &&
    typeof c.name === "string" &&
    c.name.length <= 40 &&
    typeof c.blurb === "string" &&
    c.blurb.length <= 160 &&
    typeof c.accent === "string" &&
    /^var\(--[a-z-]+\)$/.test(c.accent) &&
    typeof c.imageHash === "string" &&
    /^([0-9a-f]{64})?$/.test(c.imageHash) &&
    Number.isInteger(c.h0) &&
    c.h0 > 0 &&
    typeof c.promoter === "string" &&
    typeof c.tokenId === "string" &&
    typeof c.creator === "string" &&
    typeof c.at === "string"
  );
}
