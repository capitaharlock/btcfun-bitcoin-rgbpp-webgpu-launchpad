/* The site's routes: which page a location hash names.
 *
 * Hash routing, because the Worker serves one SPA shell and a hash never
 * reaches the server: every page is a real link that can be bookmarked,
 * copied and middle-clicked without a server-side route table. Parsing is
 * pure so every alias and fallback is unit-tested; the views import
 * `navigate` from here rather than from the shell, which keeps the shell →
 * views dependency one-way.
 */

export type WalletTab = "overview" | "tokens" | "activity";

export type Route =
  | { name: "launches" }
  /** `mine` when arrived at from a MINE button: the page opens on the miner. */
  | { name: "launch"; id: string; mine: boolean }
  | { name: "proof"; txid?: string }
  | { name: "lab" }
  | { name: "create" }
  | { name: "market" }
  | { name: "activity" }
  | { name: "wallet"; tab: WalletTab }
  | { name: "docs"; page?: string };

export function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (path[0] === "launch" && path[1]) return { name: "launch", id: path[1], mine: path[2] === "mine" };
  if (path[0] === "proof") return { name: "proof", txid: path[1] };
  if (path[0] === "lab") return { name: "lab" };
  if (path[0] === "create") return { name: "create" };
  if (path[0] === "activity") return { name: "activity" };
  // The old holdings page is the wallet's Tokens tab now; its links still work.
  if (path[0] === "holdings") return { name: "wallet", tab: "tokens" };
  if (path[0] === "market") return { name: "market" };
  if (path[0] === "wallet") {
    const tab = path[1] === "tokens" || path[1] === "activity" ? path[1] : "overview";
    return { name: "wallet", tab };
  }
  if (path[0] === "docs") return { name: "docs", page: path[1] };
  return { name: "launches" };
}

/** The hash a retired route is rewritten to, or null when it is already canonical. */
export function canonicalHash(hash: string): string | null {
  return /^#\/?holdings\/?$/.test(hash) ? "#/wallet/tokens" : null;
}

export function navigate(to: string): void {
  window.location.hash = to;
}
