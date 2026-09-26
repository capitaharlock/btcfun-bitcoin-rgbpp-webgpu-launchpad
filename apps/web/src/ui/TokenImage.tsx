/* A token's picture, wherever a token appears.
 *
 * One component for every surface — catalogue, token page, market, activity,
 * holdings — so a token looks the same everywhere. It shows the launch's art
 * when there is some (`domain/launches/image.ts`) and falls back to the launch's
 * pixel sigil when there is none or the picture fails to load, so a broken
 * link degrades to the mark the launch always had rather than to a hole.
 */

import { memo, useState } from "react";

import type { TokenArt } from "@/domain/launches";
import { Sigil, type SigilSize } from "./Sigil";
import "./sigil.css";

export type TokenImageSize = SigilSize;

export interface TokenImageProps {
  art: TokenArt | null;
  /** What the fallback sigil is drawn from: the launch id. */
  seed: string;
  accent: string;
  /** For the alternative text. */
  symbol: string;
  size?: TokenImageSize;
  /** Fallback sigil without its march, for dense lists. */
  still?: boolean;
}

export const TokenImage = memo(function TokenImage({ art, seed, accent, symbol, size = "md", still }: TokenImageProps) {
  // Remember which source failed rather than a flag, so a launch that later
  // gains a working picture is not stuck on the fallback.
  const [failed, setFailed] = useState<string | null>(null);
  if (!art || failed === art.src) return <Sigil seed={seed} accent={accent} size={size} still={still} />;
  return (
    <span className={`tokenimg ${size}`} style={{ "--accent": accent } as React.CSSProperties}>
      <img
        src={art.src}
        alt={`${symbol} token image`}
        loading="lazy"
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        onError={() => setFailed(art.src)}
      />
    </span>
  );
});
