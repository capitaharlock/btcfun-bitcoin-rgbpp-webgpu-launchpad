/* A 3×5 pixel font for the arcade scene.
 *
 * The scene draws its words — hashes in flight, "+441 PIZZA" — cell by cell
 * on the same grid as the sprites, so text is as crisp as everything else and
 * does not depend on a web font having loaded before the first frame. Only
 * the glyphs the scene and the game's screens use: digits, letters, and a
 * little punctuation.
 */

import { fromBitmap, type PixelGrid } from "@/ui/pixels/pixels";

export const GLYPH_W = 3;
export const GLYPH_H = 5;
/** Horizontal advance: one column of space between glyphs. */
export const ADVANCE = GLYPH_W + 1;

const RAW: Record<string, string> = {
  "0": "### #.# #.# #.# ###",
  "1": ".#. ##. .#. .#. ###",
  "2": "### ..# ### #.. ###",
  "3": "### ..# ### ..# ###",
  "4": "#.# #.# ### ..# ..#",
  "5": "### #.. ### ..# ###",
  "6": "### #.. ### #.# ###",
  "7": "### ..# ..# .#. .#.",
  "8": "### #.# ### #.# ###",
  "9": "### #.# ### ..# ###",
  A: ".#. #.# ### #.# #.#",
  B: "##. #.# ##. #.# ##.",
  C: ".## #.. #.. #.. .##",
  D: "##. #.# #.# #.# ##.",
  E: "### #.. ##. #.. ###",
  F: "### #.. ##. #.. #..",
  G: ".## #.. #.# #.# .##",
  H: "#.# #.# ### #.# #.#",
  I: "### .#. .#. .#. ###",
  J: "..# ..# ..# #.# .#.",
  K: "#.# #.# ##. #.# #.#",
  L: "#.. #.. #.. #.. ###",
  M: "#.# ### ### #.# #.#",
  N: "##. #.# #.# #.# #.#",
  O: ".#. #.# #.# #.# .#.",
  P: "##. #.# ##. #.. #..",
  Q: ".#. #.# #.# ##. .##",
  R: "##. #.# ##. #.# #.#",
  S: ".## #.. .#. ..# ##.",
  T: "### .#. .#. .#. .#.",
  U: "#.# #.# #.# #.# ###",
  V: "#.# #.# #.# #.# .#.",
  W: "#.# #.# ### ### #.#",
  X: "#.# #.# .#. #.# #.#",
  Y: "#.# #.# .#. .#. .#.",
  Z: "### ..# .#. #.. ###",
  "+": "... .#. ### .#. ...",
  "-": "... ... ### ... ...",
  ".": "... ... ... ... .#.",
  ",": "... ... ... .#. #..",
  "/": "..# ..# .#. #.. #..",
  "!": ".#. .#. .#. ... .#.",
  ":": "... .#. ... .#. ...",
  "=": "... ### ... ### ...",
  "<": "..# .#. #.. .#. ..#",
  ">": "#.. .#. ..# .#. #..",
  " ": "... ... ... ... ...",
};

const GLYPHS: ReadonlyMap<string, PixelGrid> = new Map(
  Object.entries(RAW).map(([ch, rows]) => [ch, fromBitmap(rows.split(" "))]),
);

/** The glyph for a character; lower case draws as upper case, anything unknown as a space. */
export function glyph(ch: string): PixelGrid {
  return GLYPHS.get(ch.toUpperCase()) ?? GLYPHS.get(" ")!;
}

/** Width of a line of text, in cells. */
export function textWidth(text: string): number {
  return text.length === 0 ? 0 : text.length * ADVANCE - 1;
}

export function hasGlyph(ch: string): boolean {
  return GLYPHS.has(ch.toUpperCase());
}
