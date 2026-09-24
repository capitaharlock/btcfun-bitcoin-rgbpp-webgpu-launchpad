/* Token artwork, drawn as pixel art and written to public/tokens/*.svg.
 *
 *   node scripts/tokens/art.mjs
 *
 * Each picture is a 32×32 grid scaled to a 512×512 viewBox: a dark cabinet
 * backdrop with a halo in the token's accent, the subject with a one-cell
 * outline and a hard drop shadow (the arcade sticker look), and effects —
 * beams, steam, sparkles — drawn over it without an outline. Cells become one
 * path per colour, a horizontal run per command, which keeps each file a few
 * kilobytes and every edge crisp at any size.
 *
 * Original drawings of shared themes only: no logo, brand or trademark.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { compose, toSvg } from "./compose.mjs";
import { ART } from "./pictures.mjs";

const OUT = fileURLToPath(new URL("../../public/tokens/", import.meta.url));

mkdirSync(OUT, { recursive: true });
for (const [name, art] of Object.entries(ART)) {
  const svg = toSvg(compose(art), art.title);
  writeFileSync(`${OUT}${name}.svg`, svg);
  console.log(`${name}.svg  ${(svg.length / 1024).toFixed(1)} KB`);
}
