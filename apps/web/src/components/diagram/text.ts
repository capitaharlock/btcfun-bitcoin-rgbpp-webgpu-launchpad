/* Text measurement for SVG layout, without a DOM.
 *
 * SVG does not wrap text, and measuring it needs a rendered element — which a
 * layout that must run in a unit test, and before the first paint, does not
 * have. So widths are estimated from per-glyph advances of the site's sans
 * face (Inter, falling back to the system UI face) and of a monospace face.
 * The estimates err wide: a line that is measured a little long wraps a word
 * early, where one measured short would spill out of its box.
 */

/** Advance widths in em, grouped by glyph shape. */
const NARROW = new Set("iljtfr.,:;'|!()[] ");
const WIDE = new Set("mwMW@%");
const MONO_ADVANCE = 0.62;
/** Headroom for the difference between fallback faces. */
const SAFETY = 1.06;

function advance(ch: string): number {
  if (NARROW.has(ch)) return 0.32;
  if (WIDE.has(ch)) return 0.86;
  if (ch >= "A" && ch <= "Z") return 0.68;
  if (ch >= "0" && ch <= "9") return 0.6;
  return 0.56;
}

export function textWidth(text: string, size: number, mono = false): number {
  let em = 0;
  for (const ch of text) em += mono ? MONO_ADVANCE : advance(ch);
  return em * size * SAFETY;
}

/**
 * Greedy word wrap to `maxWidth`. An explicit `\n` always breaks. A single
 * word wider than the line is kept whole on its own line rather than split
 * mid-word: identifiers here (`SIGHASH_SINGLE|ANYONECANPAY`) must stay legible.
 */
export function wrap(text: string, maxWidth: number, size: number, mono = false): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && textWidth(candidate, size, mono) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function widest(lines: readonly string[], size: number, mono = false): number {
  return lines.reduce((max, line) => Math.max(max, textWidth(line, size, mono)), 0);
}
