/* The activity ledger: where signed events go, and where the feed comes from.
 *
 * The operator's index is one implementation, and it may be absent — a dev
 * server without the Worker, an exhausted free tier, a visitor offline — so
 * the same interface is served by the local mirror alone. A second index, or
 * a test that records events into an array, fits without touching the hooks.
 * What an entry proves is stated once, in `domain/activity/types.ts`: the
 * stated actor signed these bytes, nothing more.
 */

import type { ActivityEntry, ActivityKind, SignedActivity } from "@/domain/activity";

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

export interface Ledger {
  /** Newest first: what the index has, merged with what this device recorded. */
  feed(query?: FeedQuery): Promise<Feed>;
  /** Keep the event locally and try to publish it. Resolves to the entry as the feed will show it. */
  record(signed: SignedActivity): Promise<ActivityEntry>;
  /** Publish only. Never throws: false when the index did not take it. */
  publish(signed: SignedActivity): Promise<boolean>;
  /** Keep the event locally only. Throws on an invalid event. */
  remember(signed: SignedActivity): ActivityEntry;
  /** Drop the local mirror. The index keeps whatever was published. */
  clearLocal(): void;
}
