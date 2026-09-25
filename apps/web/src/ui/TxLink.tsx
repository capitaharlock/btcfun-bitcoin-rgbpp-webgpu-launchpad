/* Links that leave the site for a public explorer.
 *
 * Every transaction, address or explorer page the app shows is checkable
 * without trusting this page, so the link out is everywhere. One component
 * keeps the new-tab behaviour and `rel="noopener noreferrer"` — which stops
 * the opened page from reaching back through `window.opener` — in one place,
 * and keeps each explorer's URL shape in its own `lib` helper.
 */

import type { ReactNode } from "react";

import { addressUrl, txUrl } from "../lib/bitcoin/network";
import { ckbTxUrl } from "../lib/rgbpp/explorer";

interface LinkAttrs {
  className?: string;
  title?: string;
  "aria-label"?: string;
  children: ReactNode;
}

/** Any page off the site, opened in a new tab. */
export function ExternalLink({ href, ...rest }: LinkAttrs & { href: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" {...rest} />;
}

/** What an explorer link points at: a Bitcoin transaction, a CKB transaction, or a Bitcoin address. */
export type TxLinkKind = "btc" | "ckb" | "address";

const URL_OF: Record<TxLinkKind, (id: string) => string> = {
  btc: (txid) => txUrl(txid),
  ckb: (hash) => ckbTxUrl(hash),
  address: (address) => addressUrl(address),
};

/** A transaction or address on its public explorer. */
export function TxLink({ kind, id, ...rest }: LinkAttrs & { kind: TxLinkKind; id: string }) {
  return <ExternalLink href={URL_OF[kind](id)} {...rest} />;
}
