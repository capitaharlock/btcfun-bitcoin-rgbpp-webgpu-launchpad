/* React binding for the public activity feed.
 *
 * Polls rather than subscribes. A websocket would be tidier to read but would
 * hold a Durable Object open, which is the one Cloudflare primitive billed by
 * duration — and this feed is interesting at human speed, not at frame rate.
 * See `.meshkore/docs/hosting.md`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { feed, type ActivityEntry, type ActivityKind, type Feed } from "../lib/activity";

const POLL_MS = 20_000;

export interface UseActivity extends Feed {
  loading: boolean;
  /** Ids that arrived since the previous poll, so the UI can flash them. */
  fresh: ReadonlySet<string>;
  refresh: () => void;
}

export interface ActivityQuery {
  launch?: string;
  kind?: ActivityKind;
  limit?: number;
}

export function useActivity(query: ActivityQuery = {}): UseActivity {
  const { launch, kind, limit } = query;
  const [state, setState] = useState<Feed>({ entries: [], online: false });
  const [loading, setLoading] = useState(true);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const next = await feed({ launch, kind, limit });
    setState(next);
    setLoading(false);

    // First load is not "new": flashing forty rows at once is noise.
    if (seen.current.size === 0) {
      seen.current = new Set(next.entries.map((e) => e.id));
      return;
    }
    const arrived = next.entries.filter((e) => !seen.current.has(e.id)).map((e) => e.id);
    for (const id of arrived) seen.current.add(id);
    if (arrived.length > 0) setFresh(new Set(arrived));
  }, [launch, kind, limit]);

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

  return { ...state, loading, fresh, refresh: () => void load() };
}

/** Event counts per launch, for the "what is people actually using" signal. */
export function countByLaunch(entries: readonly ActivityEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.signed.body.launch;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Memoised wrapper, since the feed re-renders often and this walks it. */
export function useLaunchActivity(entries: readonly ActivityEntry[]): Map<string, number> {
  return useMemo(() => countByLaunch(entries), [entries]);
}
