/* A value the visitor is expected to copy: an address, a key, a record id.
 *
 * Shows the whole value rather than a truncation, because a truncated address
 * cannot be checked against what a wallet or explorer displays, and checking it
 * is the entire reason a person reads one.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import "./copyable.css";

const FEEDBACK_MS = 1600;

/** Copy a value on a click, and say so for a moment: "Copied" only once the clipboard took it. */
export function useCopy(value: string): { copied: boolean; copy: () => void } {
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

  return { copied, copy };
}

export function Copyable({ value, label }: { value: string; label: string }) {
  const { copied, copy } = useCopy(value);
  return (
    <div className="copyable">
      <code className="mono">{value}</code>
      <button type="button" className="btn ghost" onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
