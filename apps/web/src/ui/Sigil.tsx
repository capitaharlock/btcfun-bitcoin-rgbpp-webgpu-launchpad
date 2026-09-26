/* A launch's mark: its invader sprite on a black tile, in its accent.
 *
 * The sprite comes from the launch id (`pixelSigil`), so it is identical
 * everywhere and needs no uploaded image; the accent comes from the
 * announcement, so a launch keeps the colour its creator chose. Drawn in SVG
 * with crisp edges, which keeps every pixel square at any size. Both frames
 * are in the DOM and CSS alternates them, so the march costs no JavaScript and
 * stops cleanly under prefers-reduced-motion.
 */

import { memo, useMemo } from "react";

import { pixelSigil, SIGIL_HEIGHT, SIGIL_WIDTH, sigilPaths } from "@/ui/pixels/sigil";
import "./sigil.css";

export type SigilSize = "sm" | "md" | "lg" | "xl";

/** A square box one cell wider than the sprite on each side. */
const BOX = SIGIL_WIDTH + 2;
const VIEW = `-1 ${-(BOX - SIGIL_HEIGHT) / 2} ${BOX} ${BOX}`;

export const Sigil = memo(function Sigil({
  seed,
  accent,
  size = "md",
  still,
}: {
  /** What the sprite is drawn from: the launch id, or a draft's symbol. */
  seed: string;
  /** Any CSS colour, including a custom property reference. */
  accent: string;
  size?: SigilSize;
  /** Draw the standing frame only: for dense lists, where a hundred marching
   *  sprites would be noise rather than life. */
  still?: boolean;
}) {
  const frames = useMemo(() => sigilPaths(pixelSigil(seed)), [seed]);
  const shown = still ? frames.slice(0, 1) : frames;

  return (
    <span
      className={`sigil ${size}${still ? "" : " marching"}`}
      style={{ "--accent": accent } as React.CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox={VIEW} shapeRendering="crispEdges">
        {shown.map((frame, i) => (
          <g key={i} className={`frame f${i + 1}`}>
            <path className="sigil-base" d={frame.base} />
            <path className="sigil-hi" d={frame.highlight} />
          </g>
        ))}
      </svg>
    </span>
  );
});
