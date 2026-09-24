/* Lettering for the token pictures: a tiny bitmap font and the ₿ mark.
 *
 * Only the glyphs the pictures spell are drawn; `word` throws on any other
 * character, which is the signal to add one here.
 */

export const FONT = {
  A: [".#.", "#.#", "###", "#.#", "#.#"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  E: ["###", "#..", "##.", "#..", "###"],
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
  L: ["#..", "#..", "#..", "#..", "###"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
  O: ["###", "#.#", "#.#", "#.#", "###"],
  Q: ["###", "#.#", "#.#", "##.", ".##"],
  0: [".#.", "#.#", "#.#", "#.#", ".#."],
  1: [".#", "##", ".#", ".#", ".#"],
};

export function word(layer, x, y, text, c) {
  for (const ch of text) {
    const glyph = FONT[ch];
    layer.stamp(x, y, glyph, { "#": c });
    x += glyph[0].length + 1;
  }
  return layer;
}

export function wordWidth(text) {
  return [...text].reduce((w, ch) => w + FONT[ch][0].length + 1, -1);
}

/** ₿, 7×9 — the same drawing as the app's BitcoinMark. */
export const BTC = ["..#.#..", "######.", ".##..##", ".##..##", ".#####.", ".##..##", ".##..##", "######.", "..#.#.."];
export const btc = (layer, x, y, c) => layer.stamp(x, y, BTC, { "#": c });
