/* Live digest readout and improvement log.
 *
 * The feed shows whichever digest the backend last reported — at frame rate
 * that is a blur of hex, which is the honest visual for millions of attempts a
 * second. When a candidate beats the session best it takes the feed over for
 * `STRIKE_MS`, the zeros swell, the box blooms, and then the stream resumes.
 *
 * The animation restarts by changing `key` on the animated subtree, so React
 * remounts it and the browser runs the keyframes from the top. Toggling a class
 * instead would need a forced reflow between removal and re-add.
 */

import { memo, useEffect, useState } from "react";
import type { Candidate } from "@/domain/mining";
import { group, shortHash, splitLeadingZeros } from "@/ui/format";
import { Chip } from "@/ui/primitives";
import "./hash-feed.css";

/** Must match the `feed-strike` / `zeros-strike` duration in hash-feed.css. */
const STRIKE_MS = 1800;

export interface HashFeedProps {
  /** Digest currently streaming from the backend, or "" before the first one. */
  current: string;
  /** Best candidate this session. A change here triggers the strike. */
  best: Candidate | null;
  running: boolean;
}

export const HashFeed = memo(function HashFeed({ current, best, running }: HashFeedProps) {
  const [striking, setStriking] = useState(false);

  useEffect(() => {
    if (!best) {
      setStriking(false);
      return;
    }
    setStriking(true);
    const timer = setTimeout(() => setStriking(false), STRIKE_MS);
    return () => clearTimeout(timer);
  }, [best]);

  // During a strike the winning digest holds the feed, so the highlighted zeros
  // belong to the hash being celebrated rather than to whatever streamed past.
  const shown = striking && best ? best.hash : current;
  const { zeros, rest } = splitLeadingZeros(shown || "");

  return (
    <div
      className={`hashfeed${running ? " live" : ""}${striking ? " struck" : ""}`}
      key={striking && best ? `strike-${best.clz}-${best.nonce}` : "stream"}
    >
      <div className="feedhead">
        <span className="eyebrow">{striking ? "new best candidate" : "hash stream"}</span>
        <span className="spacer" />
        {best && <Chip tone="amber">{best.clz} zero bits</Chip>}
        <Chip tone={running ? "cyan" : undefined} live={running}>
          {running ? "grinding" : "idle"}
        </Chip>
      </div>

      <code className={`digest${shown ? "" : " idle"}`}>
        {shown ? (
          <>
            {zeros && <span className={`zeros${striking ? " fresh" : ""}`}>{zeros}</span>}
            <span className="rest">{rest}</span>
          </>
        ) : (
          "awaiting the first digest — press mine"
        )}
      </code>
    </div>
  );
});

export interface HashLogProps {
  entries: Candidate[];
}

/** Every candidate that beat the previous best, newest first. */
export const HashLog = memo(function HashLog({ entries }: HashLogProps) {
  if (entries.length === 0) {
    return (
      <div className="hashlog">
        <div className="empty">no candidate yet</div>
      </div>
    );
  }

  return (
    <div className="hashlog">
      {entries.map((entry) => (
        <div className="entry" key={`${entry.clz}-${entry.nonce}`}>
          <span className="clz">{entry.clz}</span>
          <span className="digest">{shortHash(entry.hash, 20, 8)}</span>
          <span className="spacer" />
          <span title={`nonce ${entry.nonce}`}>#{group(Number(entry.nonce & 0xffffffffn))}</span>
        </div>
      ))}
    </div>
  );
});
