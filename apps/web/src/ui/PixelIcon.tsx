/* Pixel icons, drawn from text bitmaps like the sprites.
 *
 * A handful of 9×9 glyphs for the places a project lives online, and for the
 * public explorers where anyone can check a launch on chain. Brand marks
 * are suggested rather than reproduced: at nine pixels a logo is a sketch,
 * and the accessible name — never the drawing — says where a link goes.
 * Only the glyphs live here; the launch's rows of links that use them are in
 * `components/launch/Links.tsx`.
 */

import { memo, useMemo } from "react";

import type { LinkKind } from "../lib/launches/create";
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

/** An explorer's glyph: Bitcoin, the token's cell, or the script's braces. */
export const ExplorerIcon = memo(function ExplorerIcon({ kind }: { kind: ExplorerKind }) {
  const d = useMemo(() => pixelPath(fromBitmap(EXPLORER_ICONS[kind]), 1), [kind]);
  return (
    <svg viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden="true">
      <path d={d} />
    </svg>
  );
});
