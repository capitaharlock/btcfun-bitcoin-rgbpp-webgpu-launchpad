/* Display formatting. Presentation only — never used inside consensus math.
 *
 * Every number on the site goes through here, so one rule holds everywhere:
 * grouping and the decimal mark follow the browser's locale (the reader's
 * system preference), whole amounts show no decimals, and a fraction shows at
 * most two places unless a caller asks for more. Digits are truncated, never
 * rounded up: no amount on screen is more than what exists.
 */

/** The browser's locale; `undefined` lets `Intl` pick the reader's default. */
const LOCALE: string | undefined = undefined;
const INTEGER = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/** The reader's decimal mark: "." or ",". */
export const DECIMAL_MARK: string =
  new Intl.NumberFormat(LOCALE).formatToParts(1.5).find((part) => part.type === "decimal")?.value ?? ".";

/** A plain number with exactly `places` decimals, in the reader's locale. */
export function fixed(n: number, places: number): string {
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: places, maximumFractionDigits: places }).format(n);
}

/**
 * Token atoms as a human amount: `1,024` for a whole amount, `1,024.5` or
 * `0.56` for a fraction — at most `places` decimals, trailing zeros dropped.
 * A positive amount too small for `places` is shown with the decimals it
 * needs rather than as a misleading 0.
 */
export function atoms(value: bigint, decimals: number, places = 2): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const digits = (abs % scale).toString().padStart(decimals, "0");
  let frac = digits.slice(0, places).replace(/0+$/, "");
  if (frac === "" && whole === 0n && abs > 0n) frac = digits.replace(/0+$/, "");
  const text = frac ? `${group(whole)}${DECIMAL_MARK}${frac}` : group(whole);
  return negative ? `-${text}` : text;
}

/** Compact form for dense tables: 12.4M, 903.1K. */
export function compact(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = Number(value / scale);
  if (whole >= 1_000_000) return `${fixed(Math.floor(whole / 10_000) / 100, 2)}M`;
  if (whole >= 1_000) return `${fixed(Math.floor(whole / 100) / 10, 1)}K`;
  return group(whole);
}

/**
 * A count that can grow without bound, short enough for a scoreboard cell:
 * exact below a million, then 13.15M, 4.20B, 1.07T. A GPU passes a billion
 * nonces in seconds, so the exact figure belongs in a tooltip, not the cell.
 */
export function count(n: bigint): string {
  if (n < 1_000_000n) return group(n);
  const units: Array<[bigint, string]> = [
    [1_000_000_000_000n, "T"],
    [1_000_000_000n, "B"],
    [1_000_000n, "M"],
  ];
  for (const [scale, unit] of units) {
    if (n >= scale) {
      // Two decimals, truncated rather than rounded: never show more work than was done.
      const hundredths = (n * 100n) / scale;
      return `${group(hundredths / 100n)}${DECIMAL_MARK}${(hundredths % 100n).toString().padStart(2, "0")}${unit}`;
    }
  }
  return group(n);
}

/** A whole number, grouped in the reader's locale. */
export function group(n: bigint | number): string {
  return INTEGER.format(n);
}

export function pct(x: number, places = 1): string {
  return `${fixed(x * 100, places)}%`;
}

/** Hash rate with a sensible unit. */
export function rate(hps: number): string {
  if (hps >= 1_000_000) return `${fixed(hps / 1_000_000, 2)} MH/s`;
  if (hps >= 1_000) return `${fixed(hps / 1_000, 1)} kH/s`;
  return `${group(Math.round(hps))} H/s`;
}

export function duration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${fixed(s, 1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}m ${rem.toString().padStart(2, "0")}s`;
}

/** Bitcoin blocks rendered as an approximate wall-clock hint. */
export function blocksAsTime(blocks: number | bigint): string {
  const b = Number(blocks);
  const minutes = b * 10;
  if (minutes < 120) return `~${group(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 48) return `~${group(Math.round(hours))}h`;
  return `~${fixed(hours / 24, 1)}d`;
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
 * Either "." or the reader's decimal mark separates the decimals; group
 * separators are not accepted, so "1,5" is never read as fifteen.
 *
 * The inverse of `atoms()`, and the only place a typed amount becomes a bigint.
 * Rejects rather than rounds when there are more decimal places than the token
 * has: silently truncating someone's "0.123456789" is how a transfer moves a
 * different amount than the one on screen.
 */
export function parseAmount(input: string, decimals: number): bigint | null {
  const trimmed = (DECIMAL_MARK === "." ? input : input.replace(DECIMAL_MARK, ".")).trim();
  if (trimmed === "" || trimmed === "." || !/^\d*\.?\d*$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) return null;
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

/** Sats per whole token: four decimals below one sat, whole sats from there up. */
export function satsPerToken(value: number): string {
  return value < 1 ? fixed(value, 4) : group(Math.round(value));
}

/** Satoshis as BTC: up to eight decimals, trailing zeros dropped, in the reader's locale. */
export function btc(sats: number): string {
  return atoms(BigInt(Math.trunc(sats)), 8, 8);
}
