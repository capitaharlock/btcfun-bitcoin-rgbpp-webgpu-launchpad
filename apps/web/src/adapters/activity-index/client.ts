/* The activity index, with a local mirror, as the `Ledger` port.
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

import { activityId, faultIn } from "@/domain/activity";
import { ActivityError, type ActivityEntry, type SignedActivity } from "@/domain/activity";
import type { DeviceStore, Feed, FeedQuery, Ledger } from "@/ports";

const LOCAL_KEY = "btcfun:activity:v1";
const LOCAL_LIMIT = 300;

export class ActivityIndex implements Ledger {
  /**
   * @param store where the local mirror lives
   * @param base where the index lives: same origin in production, overridable for dev
   */
  constructor(
    private readonly store: DeviceStore,
    private readonly base = "",
  ) {}

  // ── local mirror ───────────────────────────────────────────────────────────

  private readLocal(): ActivityEntry[] {
    return this.store.readList<ActivityEntry>(LOCAL_KEY);
  }

  private writeLocal(entries: ActivityEntry[]): void {
    // Storage refused: the event was still published, or is still on screen.
    this.store.writeList(LOCAL_KEY, entries.slice(0, LOCAL_LIMIT));
  }

  remember(signed: SignedActivity): ActivityEntry {
    const fault = faultIn(signed);
    if (fault) throw new ActivityError(fault);

    const entry: ActivityEntry = {
      id: activityId(signed.body),
      signed,
      receivedAt: Math.floor(Date.now() / 1000),
      authentic: true,
    };
    const existing = this.readLocal().filter((e) => e.id !== entry.id);
    this.writeLocal([entry, ...existing]);
    return entry;
  }

  clearLocal(): void {
    this.store.write(LOCAL_KEY, null);
  }

  // ── remote index ───────────────────────────────────────────────────────────

  private async call(path: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(`${this.base}/api${path}`, init);

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
   * Never throws at the caller: publishing is best-effort by design, and a failed
   * publish must not roll back a claim that already happened. The boolean says
   * whether the index took it, so the UI can show an "unpublished" marker.
   */
  async publish(signed: SignedActivity): Promise<boolean> {
    try {
      await this.call("/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signed),
      });
      return true;
    } catch {
      return false;
    }
  }

  async record(signed: SignedActivity): Promise<ActivityEntry> {
    const entry = this.remember(signed);
    void this.publish(signed);
    return entry;
  }

  /**
   * Every signature is re-checked here rather than trusted because the index said
   * so, and `authentic` records only that result. It means the stated actor wrote
   * these bytes — not that the mint, purchase or transfer they describe took
   * place. Nothing in this layer can establish the latter: see `domain/activity/types.ts`.
   */
  async feed(query: FeedQuery = {}): Promise<Feed> {
    const local = this.readLocal();
    const params = new URLSearchParams();
    if (query.launch) params.set("launch", query.launch);
    if (query.kind) params.set("kind", query.kind);
    params.set("limit", String(query.limit ?? 60));

    let remote: ActivityEntry[] = [];
    let online = false;
    let detail: string | undefined;

    try {
      const response = await this.call(`/activity?${params}`);
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
}
