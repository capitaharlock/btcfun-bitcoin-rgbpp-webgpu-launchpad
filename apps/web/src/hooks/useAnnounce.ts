/* Announcing what you just did.
 *
 * Every flow that produces something public — a claim, a listing, a purchase, a
 * transfer — ends with the same three lines, so they live here instead of four
 * times over. Announcing is best-effort and never blocks or reverses the thing
 * it reports: a claim that succeeded is a claim, whether or not an index heard
 * about it.
 */

import { useCallback } from "react";

import { record, signActivity, type ActivityDraft } from "../lib/activity";
import { useWallet } from "../state/WalletProvider";

export type Announce = (draft: ActivityDraft) => Promise<void>;

export function useAnnounce(): Announce {
  const { vault } = useWallet();

  return useCallback(
    async (draft) => {
      if (!vault) return;
      try {
        await record(await signActivity(vault, draft));
      } catch (err) {
        // Deliberately swallowed. The action already happened; failing to
        // announce it is a discovery problem, not a correctness one, and
        // surfacing it as an error next to a successful claim would be a lie
        // about what went wrong.
        console.warn("[activity] could not announce:", err);
      }
    },
    [vault],
  );
}
