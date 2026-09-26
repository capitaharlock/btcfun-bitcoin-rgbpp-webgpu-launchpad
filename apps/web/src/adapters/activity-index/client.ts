/* Client for the activity index, with a local mirror.
 *
 * The index is a Cloudflare Worker over D1 (see `worker/`). It may be absent —
 * during `npm run dev` without wrangler, if the free tier is exhausted, or if
 * someone runs the app entirely offline — and the product still has to work.
 * So every event is written locally first and published second, and the feed is
 * the union of both with local events marked as unpublished.
 *
 * That ordering is not just resilience. It is the same claim the rest of the
 * app makes: the operator is an index, so losing it costs discovery, never
 * ownership. A wallet that has published nothing still holds its tokens.
 */

import { readStoredList } from "@/adapters/storage";
import { activityId, faultIn } from "@/domain/activity";
import { ActivityError, type ActivityEntry, type ActivityKind, type SignedActivity } from "@/domain/activity";
import { env } from "@/config/env";

const LOCAL_KEY = "btcfun:activity:v1";
const LOCAL_LIMIT = 300;

/** Where the index lives. Same origin in production; overridable for dev. */
const BASE = env("VITE_API_BASE") ?? "";

export interface FeedQuery {
  launch?: string;
  kind?: ActivityKind;
  limit?: number;
}

export interface Feed {
  entries: ActivityEntry[];
  /** True when the remote index answered. False means local-only. */
  online: boolean;
  /** Why the index is unavailable, when it is. */
  detail?: string;
}

// ── local mirror ─────────────────────────────────────────────────────────────

function readLocal(): ActivityEntry[] {
  return readStoredList<ActivityEntry>(LOCAL_KEY);
}

function writeLocal(entries: ActivityEntry[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(entries.slice(0, LOCAL_LIMIT)));
}

/** Record an event locally. Returns the entry as the feed will show it. */
export function remember(signed: SignedActivity): ActivityEntry {
  const fault = faultIn(signed);
  if (fault) throw new ActivityError(fault);

  const entry: ActivityEntry = {
    id: activityId(signed.body),
    signed,
    receivedAt: Math.floor(Date.now() / 1000),
    authentic: true,
  };
  const existing = readLocal().filter((e) => e.id !== entry.id);
  writeLocal([entry, ...existing]);
  return entry;
}

// ── remote index ─────────────────────────────────────────────────────────────

async function call(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${BASE}/api${path}`, init);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ActivityError(`Index ${response.status}: ${text.slice(0, 160) || response.statusText}`);
  }

  // A dev server with no Worker in front of it answers /api with the SPA's
  // index.html and a cheerful 200. Parsing that produces "Unexpected token
  // '<'", which tells a visitor nothing; the content type tells them exactly
  // what happened.
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("json")) {
    throw new ActivityError("No index is running at /api — this build is local-only.");
  }

  return response;
}

/**
 * Publish an event to the index.
 *
 * Never throws at the caller: publishing is best-effort by design, and a failed
 * publish must not roll back a claim that already happened. The boolean says
 * whether the index took it, so the UI can show an "unpublished" marker.
 */
export async function publish(signed: SignedActivity): Promise<boolean> {
  try {
    await call("/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signed),
    });
    return true;
  } catch {
    return false;
  }
}

/** Do both: keep it locally, then try to share it. */
export async function record(signed: SignedActivity): Promise<ActivityEntry> {
  const entry = remember(signed);
  void publish(signed);
  return entry;
}

/**
 * The feed: remote events merged with local ones, newest first.
 *
 * Every signature is re-checked here rather than trusted because the index said
 * so, and `authentic` records only that result. It means the stated actor wrote
 * these bytes — not that the mint, purchase or transfer they describe took
 * place. Nothing in this layer can establish the latter: see `types.ts`.
 */
export async function feed(query: FeedQuery = {}): Promise<Feed> {
  const local = readLocal();
  const params = new URLSearchParams();
  if (query.launch) params.set("launch", query.launch);
  if (query.kind) params.set("kind", query.kind);
  params.set("limit", String(query.limit ?? 60));

  let remote: ActivityEntry[] = [];
  let online = false;
  let detail: string | undefined;

  try {
    const response = await call(`/activity?${params}`);
    const payload = (await response.json()) as { events?: unknown };
    if (Array.isArray(payload.events)) {
      remote = payload.events as ActivityEntry[];
      online = true;
    }
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
  }

  const byId = new Map<string, ActivityEntry>();
  for (const entry of [...remote, ...local]) {
    const authentic = faultIn(entry.signed) === null;
    const previous = byId.get(entry.id);
    // Prefer whichever copy has the earlier arrival time, so a locally recorded
    // event keeps its own timestamp once the index echoes it back.
    if (!previous || entry.receivedAt < previous.receivedAt) {
      byId.set(entry.id, { ...entry, authentic });
    }
  }

  let entries = [...byId.values()].sort((a, b) => b.receivedAt - a.receivedAt);
  if (query.launch) entries = entries.filter((e) => e.signed.body.launch === query.launch);
  if (query.kind) entries = entries.filter((e) => e.signed.body.kind === query.kind);

  return { entries: entries.slice(0, query.limit ?? 60), online, ...(detail ? { detail } : {}) };
}

/** Drop the local mirror. The index keeps whatever was published. */
export function clearLocal(): void {
  localStorage.removeItem(LOCAL_KEY);
}
