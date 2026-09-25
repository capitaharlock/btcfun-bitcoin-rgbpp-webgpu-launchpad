/* The current route, following the location hash.
 *
 * Kept out of the shell so the shell only lays pages out: this hook owns the
 * `hashchange` subscription (and removes it), rewrites retired routes in place
 * and counts arrivals, which the shell uses as a key so every arrival is a
 * fresh page.
 */

import { useEffect, useState } from "react";

import { canonicalHash, parse, type Route } from "../lib/router";

/** A retired route rewritten in place, so the address bar shows where the
 *  visitor actually is and the back button does not return to the alias. */
function canonicalise(): void {
  const to = canonicalHash(window.location.hash);
  if (to) history.replaceState(history.state, "", to);
}

export function useRoute(): { route: Route; visit: number } {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  // Every arrival is a fresh page: following a link to the section you are
  // already in (Create after announcing, say) must not show its old state.
  const [visit, setVisit] = useState(0);

  useEffect(() => {
    canonicalise();
    const onHash = () => {
      canonicalise();
      setRoute(parse(window.location.hash));
      setVisit((v) => v + 1);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return { route, visit };
}
