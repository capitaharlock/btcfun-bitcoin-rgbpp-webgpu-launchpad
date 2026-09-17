/* Pixel icons, drawn from text bitmaps like the sprites.
 *
 * A handful of 9×9 glyphs for the places a project lives online. Brand marks
 * are suggested rather than reproduced: at nine pixels a logo is a sketch,
 * and the accessible name — never the drawing — says where a link goes.
 */

import { memo, useMemo } from "react";

import type { LaunchLinks, LinkKind } from "../lib/launches/create";
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
