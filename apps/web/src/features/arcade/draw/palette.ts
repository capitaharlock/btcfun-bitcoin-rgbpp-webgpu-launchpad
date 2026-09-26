/* The colours a frame is drawn in, resolved from the theme's tokens by
 * `ArcadeScene.tsx` into strings a canvas is sure to accept. Nothing in the
 * drawing names a colour; it asks the palette for a role.
 */

import type { Tint } from "../scene";

export interface ScenePalette {
  bg: string;
  ink: string;
  dim: string;
  faint: string;
  /** The cannon, and the zeros of every hash: Bitcoin's colour. */
  bitcoin: string;
  /** Bunkers and the ground. */
  cover: string;
  /** Per launch, in scene order: its accent and the accent's highlight. */
  invaders: ReadonlyArray<{ base: string; hi: string }>;
}

export function tint(palette: ScenePalette, t: Tint): string {
  return t === "ink" ? palette.ink : t === "bitcoin" ? palette.bitcoin : palette.invaders[t].base;
}
