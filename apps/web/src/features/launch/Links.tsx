/* A launch's links out: its project's pages and the explorers that show it on chain.
 *
 * Domain rows built from the generic pixel icons (`ui/PixelIcon.tsx`). The
 * accessible name, never the drawing, says where each link goes; an explorer
 * link that cannot exist yet — a simulated example has nothing on chain — is
 * drawn switched off with the reason, rather than hidden.
 */

import { addressUrl } from "@/domain/bitcoin";
import { LINK_KINDS, type LaunchLinks } from "@/domain/launches";
import { ckbMintScriptUrl, ckbTokenUrl } from "@/domain/rgbpp";
import { ExplorerIcon, LINK_LABEL, PixelIcon, type ExplorerKind } from "@/ui/PixelIcon";
import { ExternalLink } from "@/ui/TxLink";
import "./links.css";

/** A launch's project links as a row of pixel icon buttons. Leaves the page. */
export function ProjectLinks({ links, symbol, small }: { links: LaunchLinks; symbol: string; small?: boolean }) {
  const present = LINK_KINDS.flatMap((kind) => {
    const href = links[kind];
    return href ? [{ kind, href }] : [];
  });
  if (present.length === 0) return null;
  return (
    <div className={`links${small ? " small" : ""}`} role="group" aria-label={`${symbol} links`}>
      {present.map(({ kind, href }) => (
        <ExternalLink
          key={kind}
          className="iconlink"
          href={href}
          aria-label={`${symbol} on ${LINK_LABEL[kind]}`}
          title={href}
        >
          <PixelIcon kind={kind} />
        </ExternalLink>
      ))}
    </div>
  );
}

/** A link to a public explorer, or the same icon switched off with the reason why. */
export type ExplorerLink =
  | { kind: ExplorerKind; label: string; state: "live"; href: string }
  | { kind: ExplorerKind; label: string; state: "off"; reason: string };

/** Where to check a launch for yourself: the ticket payments on Bitcoin, the token and the mint script on CKB. */
export function ExplorerLinks({ links, label, small }: { links: readonly ExplorerLink[]; label: string; small?: boolean }) {
  return (
    <div className={`links${small ? " small" : ""}`} role="group" aria-label={label}>
      {links.map((link) =>
        link.state === "live" ? (
          <ExternalLink key={link.kind} className="iconlink explorer" href={link.href} aria-label={link.label} title={link.label}>
            <ExplorerIcon kind={link.kind} />
          </ExternalLink>
        ) : (
          <span key={link.kind} className="iconlink explorer off" role="img" aria-label={`${link.label}: ${link.reason}`} title={link.reason}>
            <ExplorerIcon kind={link.kind} />
          </span>
        ),
      )}
    </div>
  );
}

/** A real launch's explorer links: ticket payments to its promoter, its token, the mint script. */
export function launchExplorers(launch: { symbol: string; promoter: string; tokenId: string }): ExplorerLink[] {
  return [
    { kind: "bitcoin", label: `${launch.symbol} ticket payments on mempool`, state: "live", href: addressUrl(launch.promoter) },
    { kind: "token", label: `${launch.symbol} token on the CKB explorer`, state: "live", href: ckbTokenUrl(launch.tokenId) },
    { kind: "script", label: "The mint script on the CKB explorer", state: "live", href: ckbMintScriptUrl() },
  ];
}

/** The same icons for something that is not on chain, switched off. */
export function offExplorers(symbol: string, reason: string): ExplorerLink[] {
  return [
    { kind: "bitcoin", label: `${symbol} ticket payments`, state: "off", reason },
    { kind: "token", label: `${symbol} token on CKB`, state: "off", reason },
  ];
}
