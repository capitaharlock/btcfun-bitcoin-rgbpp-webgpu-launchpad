/* Pixel art as data: a grid of cells in, one SVG path per tone out.
 *
 * Sprites and icons are drawn the same way, so there is one implementation of
 * "turn cells into squares". One path per tone rather than one <rect> per cell
 * keeps a feed of a hundred sprites at two elements each.
 */

/** Rows of cell values; 0 is always empty. */
export type PixelGrid = ReadonlyArray<ReadonlyArray<number>>;

/** A path of unit squares for every cell holding `tone`. */
export function pixelPath(grid: PixelGrid, tone: number): string {
  let d = "";
  grid.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (cell === tone) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return d;
}

/** A bitmap written as text — `#` lit, anything else empty — as a grid. */
export function fromBitmap(rows: readonly string[]): PixelGrid {
  return rows.map((row) => [...row].map((c) => (c === "#" ? 1 : 0)));
}
