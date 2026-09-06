/* A launch's mark: two letters on its accent colour.
 *
 * Every launch needs a recognisable object in a grid, a table row, a header and
 * a feed line, and none of them should need an uploaded image — a prototype
 * that requires asset hosting to look finished does not look finished. Derived
 * from the symbol, so it is identical everywhere without being stored anywhere.
 */

import { memo } from "react";

export type SigilSize = "sm" | "md" | "lg";

export const Sigil = memo(function Sigil({
  symbol,
  accent,
  size = "md",
}: {
  symbol: string;
  /** Any CSS colour, including a custom property reference. */
  accent: string;
  size?: SigilSize;
}) {
  return (
    <span
      className={`sigil${size === "md" ? "" : ` ${size}`}`}
      style={{ "--accent": accent } as React.CSSProperties}
      aria-hidden="true"
    >
      {symbol.slice(0, 2).toUpperCase()}
    </span>
  );
});
