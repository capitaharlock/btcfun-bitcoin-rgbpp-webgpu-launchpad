/* Pixel icons, drawn from text bitmaps like the sprites.
 *
 * A handful of 9×9 glyphs for the places a project lives online, and for the
 * public explorers where anyone can check a launch on chain. Brand marks
 * are suggested rather than reproduced: at nine pixels a logo is a sketch,
 * and the accessible name — never the drawing — says where a link goes.
 */

import { memo, useMemo } from "react";

import { addressUrl } from "../lib/bitcoin/network";
import type { LaunchLinks, LinkKind } from "../lib/launches/create";
import { ckbMintScriptUrl, ckbTokenUrl } from "../lib/rgbpp/explorer";
import { LINK_KINDS } from "../lib/launches/create";
import { fromBitmap, pixelPath } from "./pixels";

const ICONS: Record<LinkKind, readonly string[]> = {
  website: [
    "..#####..",
    ".#..#..#.",
    "#..#.#..#",
    "#########",
    "#..#.#..#",
    "#########",
    "#..#.#..#",
    ".#..#..#.",
    "..#####..",
  ],
  x: [
    "##.....##",
    ".##...##.",
    "..##.##..",
    "...###...",
    "...###...",
    "..##.##..",
    ".##...##.",
    "##.....##",
    ".........",
  ],
  telegram: [
    "........#",
    "......###",
    "....##..#",
    "..##...##",
    "###...#.#",
    "..##.#..#",
    "...##...#",
    "...#.####",
    "...#.....",
  ],
  discord: [
    ".........",
    ".##...##.",
    "#########",
    "#########",
    "##.###.##",
    "##.###.##",
    "#########",
    ".##...##.",
    ".#.....#.",
  ],
  github: [
    ".#.....#.",
    ".##...##.",
    ".#######.",
    "#########",
    "##.###.##",
    "#########",
    ".#######.",
    "..#.#.#..",
    "..#...#..",
  ],
};

/** ₿, drawn: the glyph is missing from many font stacks and silently degrades to "B". */
const BITCOIN = [
  "..#.#..",
  "######.",
  ".##..##",
  ".##..##",
  ".#####.",
  ".##..##",
  ".##..##",
  "######.",
  "..#.#..",
];

export const BitcoinMark = memo(function BitcoinMark() {
  const d = useMemo(() => pixelPath(fromBitmap(BITCOIN), 1), []);
  return (
    <svg viewBox="-1 0 9 9" width="16" height="16" shapeRendering="crispEdges" aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  );
});

/** A wallet: a folded purse with its clasp, the one glyph the top bar needs
 *  people to find without reading. */
const WALLET = [
  ".#######.",
  "#.......#",
  "#########",
  "#.......#",
  "#....####",
  "#....#..#",
  "#....####",
  "#.......#",
  "#########",
];

export const WalletMark = memo(function WalletMark() {
  const d = useMemo(() => pixelPath(fromBitmap(WALLET), 1), []);
  return (
    <svg viewBox="0 0 9 9" width="16" height="16" shapeRendering="crispEdges" aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  );
});

export const LINK_LABEL: Record<LinkKind, string> = {
  website: "Website",
  x: "X",
  telegram: "Telegram",
  discord: "Discord",
  github: "GitHub",
};

export const PixelIcon = memo(function PixelIcon({ kind }: { kind: LinkKind }) {
  const d = useMemo(() => pixelPath(fromBitmap(ICONS[kind]), 1), [kind]);
  return (
    <svg viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden="true">
      <path d={d} />
    </svg>
  );
});

/** A launch's project links as a row of pixel icon buttons. Leaves the page. */
export function ProjectLinks({ links, symbol, small }: { links: LaunchLinks; symbol: string; small?: boolean }) {
  const present = LINK_KINDS.filter((kind) => links[kind]);
  if (present.length === 0) return null;
  return (
    <div className={`links${small ? " small" : ""}`} role="group" aria-label={`${symbol} links`}>
      {present.map((kind) => (
        <a
          key={kind}
          className="iconlink"
          href={links[kind]}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${symbol} on ${LINK_LABEL[kind]}`}
          title={links[kind]}
        >
          <PixelIcon kind={kind} />
        </a>
      ))}
    </div>
  );
}

// ── explorers ────────────────────────────────────────────────────────────────

export type ExplorerKind = "bitcoin" | "token" | "script";

const EXPLORER_ICONS: Record<ExplorerKind, readonly string[]> = {
  bitcoin: BITCOIN.map((row) => `.${row}.`),
  // A cell: CKB's unit of state, where the token lives.
  token: [
    "....#....",
    "..##.##..",
    "##.....##",
    "#.##.##.#",
    "#...#...#",
    "#...#...#",
    "#...#...#",
    ".##.#.##.",
    "....#....",
  ],
  // Braces: code.
  script: [
    ".........",
    "..##.##..",
    ".#.....#.",
    ".#.....#.",
    "#.......#",
    ".#.....#.",
    ".#.....#.",
    "..##.##..",
    ".........",
  ],
};

/** A link to a public explorer, or the same icon switched off with the reason why. */
export type ExplorerLink =
  | { kind: ExplorerKind; label: string; state: "live"; href: string }
  | { kind: ExplorerKind; label: string; state: "off"; reason: string };

const ExplorerIcon = memo(function ExplorerIcon({ kind }: { kind: ExplorerKind }) {
  const d = useMemo(() => pixelPath(fromBitmap(EXPLORER_ICONS[kind]), 1), [kind]);
  return (
    <svg viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden="true">
      <path d={d} />
    </svg>
  );
});

/** Where to check a launch for yourself: the ticket payments on Bitcoin, the token and the mint script on CKB. */
export function ExplorerLinks({ links, label, small }: { links: readonly ExplorerLink[]; label: string; small?: boolean }) {
  return (
    <div className={`links${small ? " small" : ""}`} role="group" aria-label={label}>
      {links.map((link) =>
        link.state === "live" ? (
          <a
            key={link.kind}
            className="iconlink explorer"
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.label}
          >
            <ExplorerIcon kind={link.kind} />
          </a>
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
