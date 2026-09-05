/* A value the visitor is expected to copy: an address, a key, a record id.
 *
 * Shows the whole value rather than a truncation, because a truncated address
 * cannot be checked against what a wallet or explorer displays, and checking it
 * is the entire reason a person reads one.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const FEEDBACK_MS = 1600;

export function Copyable({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(() => {
    // `writeText` rejects without a user gesture or a secure context. Failing
    // silently would leave the visitor thinking they copied an address.
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), FEEDBACK_MS);
      },
      () => setCopied(false),
    );
  }, [value]);

  return (
    <div className="copyable">
      <code className="mono">{value}</code>
      <button type="button" className="btn ghost" onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
