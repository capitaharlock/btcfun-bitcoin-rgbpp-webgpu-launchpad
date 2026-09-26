/* A QR code, drawn as pixels like every other glyph here.
 *
 * The matrix comes from `qrcode-generator` (encoding, Reed–Solomon, masking);
 * drawing it goes through `pixelPath`, the same routine as the sprites. Dark
 * modules on paper in every theme, with the four-module quiet zone the spec
 * requires: a scanner reads contrast and margins, not the palette.
 */

import { memo, useMemo } from "react";
import qrcode from "qrcode-generator";

import { pixelPath } from "@/ui/pixels/pixels";

/** ISO/IEC 18004 §9.1: four light modules on every side. */
const QUIET = 4;

export const QrCode = memo(function QrCode({ value, label }: { value: string; label: string }) {
  const { d, size } = useMemo(() => {
    // Medium error correction: survives a smudged screen at a small size.
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    const grid = Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => (qr.isDark(row, col) ? 1 : 0)));
    return { d: pixelPath(grid, 1), size: n };
  }, [value]);

  const span = size + QUIET * 2;
  return (
    <svg className="qr" viewBox={`${-QUIET} ${-QUIET} ${span} ${span}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      <rect className="qr-paper" x={-QUIET} y={-QUIET} width={span} height={span} />
      <path className="qr-ink" d={d} />
    </svg>
  );
});
