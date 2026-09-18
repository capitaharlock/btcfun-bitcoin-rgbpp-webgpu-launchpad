/* Which announcement speaks for a launch.
 *
 * A launch id is derived from its terms, not from who announced it, so anyone
 * can sign an announcement under an id that already exists — with their own
 * links and story. The first announcer the index heard is the launch's creator;
 * later announcements count only when that same key signs them, and then the
 * newest one wins, which is how a creator updates their links. Ordering uses
 * the index's arrival time: the author's own clock is whatever the author
 * says, so it cannot decide who came first.
 */

import type { LaunchCommitment } from "./create";

export interface Heard {
  commitment: LaunchCommitment;
  /** When the index accepted it, in Unix seconds. */
  receivedAt: number;
}

/**
 * One announcement per launch id. `local` are this browser's own
 * announcements, shown before the index echoes them but never over another
 * creator's earlier claim.
 */
export function resolveAnnouncements(local: readonly LaunchCommitment[], remote: readonly Heard[]): LaunchCommitment[] {
  const byId = new Map<string, { creator: string; current: Heard }>();
  for (const heard of [...remote].sort((a, b) => a.receivedAt - b.receivedAt)) {
    const { id, creator } = heard.commitment;
    const known = byId.get(id);
    if (!known) byId.set(id, { creator, current: heard });
    else if (creator === known.creator) known.current = heard;
  }
  const resolved = new Map([...byId].map(([id, { current }]) => [id, current.commitment]));
  for (const own of local) {
    const claim = byId.get(own.id);
    if (!claim) resolved.set(own.id, own);
  }
  return [...resolved.values()];
}
