/* Whether a token's picture is the one its terms commit to.
 *
 * Only launches whose metadata carries an image hash can be checked; for the
 * rest the answer is "unchecked", which is not a failure. The bytes are
 * fetched once more (the browser usually has them cached from the <img>) and
 * hashed here, so the verdict never depends on who served them.
 */

import { useEffect, useState } from "react";

import { imageMatches, type TokenArt } from "../lib/launches/image";

export type ImageCheck = "unchecked" | "checking" | "verified" | "mismatch";

export function useImageCheck(art: TokenArt | null, imageHash: string): ImageCheck {
  const src = art?.src ?? null;
  const checkable = src !== null && imageHash !== "";
  const [check, setCheck] = useState<ImageCheck>("unchecked");

  useEffect(() => {
    if (!checkable || src === null) {
      setCheck("unchecked");
      return;
    }
    const abort = new AbortController();
    setCheck("checking");
    fetch(src, { signal: abort.signal, referrerPolicy: "no-referrer" })
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
      .then((body) => setCheck(imageMatches(new Uint8Array(body), imageHash) ? "verified" : "mismatch"))
      // An unreachable picture cannot be checked; that is not evidence against it.
      .catch(() => {
        if (!abort.signal.aborted) setCheck("unchecked");
      });
    return () => abort.abort();
  }, [checkable, src, imageHash]);

  return check;
}
