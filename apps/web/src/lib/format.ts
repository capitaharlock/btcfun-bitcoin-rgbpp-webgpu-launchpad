/* Display formatting. Presentation only — never used inside consensus math. */

/** Format token atoms as a human amount with the given decimals. */
export function atoms(value: bigint, decimals: number, places = 2): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const frac = value % scale;
  if (places === 0) return group(whole);
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, places);
  return `${group(whole)}.${fracStr}`;
}

/** Compact form for dense tables: 12.4M, 903.1K. */
export function compact(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = Number(value / scale);
  if (whole >= 1_000_000) return `${(whole / 1_000_000).toFixed(2)}M`;
  if (whole >= 1_000) return `${(whole / 1_000).toFixed(1)}K`;
  return String(whole);
}

export function group(n: bigint | number): string {
  return n.toLocaleString("en-US");
}

export function pct(x: number, places = 1): string {
  return `${(x * 100).toFixed(places)}%`;
}

/** Hash rate with a sensible unit. */
export function rate(hps: number): string {
  if (hps >= 1_000_000) return `${(hps / 1_000_000).toFixed(2)} MH/s`;
  if (hps >= 1_000) return `${(hps / 1_000).toFixed(1)} kH/s`;
  return `${hps.toFixed(0)} H/s`;
}

export function duration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}m ${rem.toString().padStart(2, "0")}s`;
}

/** Bitcoin blocks rendered as an approximate wall-clock hint. */
export function blocksAsTime(blocks: number | bigint): string {
  const b = Number(blocks);
  const minutes = b * 10;
  if (minutes < 120) return `~${minutes}m`;
  const hours = minutes / 60;
  if (hours < 48) return `~${hours.toFixed(0)}h`;
  return `~${(hours / 24).toFixed(1)}d`;
}

export function shortHash(hex: string, head = 10, tail = 8): string {
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

/** Split a digest so leading zeros can be highlighted. */
export function splitLeadingZeros(hex: string): { zeros: string; rest: string } {
  const m = /^0*/.exec(hex);
  const n = m ? m[0].length : 0;
  return { zeros: hex.slice(0, n), rest: hex.slice(n) };
}

/**
 * Parse a human decimal amount into token atoms, or null if it is not one.
 *
 * The inverse of `atoms()`, and the only place a typed amount becomes a bigint.
 * Rejects rather than rounds when there are more decimal places than the token
 * has: silently truncating someone's "0.123456789" is how a transfer moves a
 * different amount than the one on screen.
 */
export function parseAmount(input: string, decimals: number): bigint | null {
  const trimmed = input.trim();
  if (trimmed === "" || trimmed === "." || !/^\d*\.?\d*$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) return null;
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}
