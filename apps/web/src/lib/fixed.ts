/* Q64.64 fixed-point helpers over BigInt.
 *
 * Deliberately integer-only: PROTOCOL.md §4.1 requires a deterministic
 * approximation with stated error bounds, and floating point cannot be made
 * bit-identical across platforms. Everything here is exact and reproducible.
 */

export const SHIFT = 64n;
export const ONE = 1n << SHIFT;

/** Integer square root (Newton). Exact floor for any non-negative BigInt. */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("isqrt of negative");
  if (n < 2n) return n;
  let x = 1n << (BigInt(n.toString(2).length) >> 1n) + 1n;
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** sqrt of a Q64.64 value, in Q64.64. */
export function sqrtQ(a: bigint): bigint {
  return isqrt(a << SHIFT);
}

/**
 * Table of c[k] = 2^(-2^-k) in Q64.64, for k = 0..PREC.
 * c[0] = 2^-1; each subsequent entry is the square root of the previous one.
 */
const PREC = 64;
const HALF_POWERS: bigint[] = (() => {
  const t: bigint[] = [ONE >> 1n];
  for (let k = 1; k <= PREC; k++) t.push(sqrtQ(t[k - 1]));
  return t;
})();

/**
 * 2^(-num/den) in Q64.64, for num >= 0, den > 0.
 *
 * Writes num/den as `whole + f` with f in [0,1), expands f in binary and
 * multiplies the corresponding 2^(-2^-k) factors. Monotone non-increasing in
 * `num`, which is what keeps the cumulative schedule monotone.
 *
 * Underflows to 0 once `whole` exceeds the fractional precision — that
 * terminal behaviour is real and is reported rather than hidden.
 */
export function exp2neg(num: bigint, den: bigint): bigint {
  if (den <= 0n) throw new RangeError("den must be positive");
  if (num <= 0n) return ONE;

  const whole = num / den;
  let rem = num % den;

  let acc = ONE;
  for (let k = 1; k <= PREC && rem > 0n; k++) {
    rem <<= 1n;
    if (rem >= den) {
      rem -= den;
      acc = (acc * HALF_POWERS[k]) >> SHIFT;
    }
  }

  if (whole >= 1024n) return 0n;
  const w = Number(whole);
  return w >= 256 ? 0n : acc >> BigInt(w);
}

/** Multiply a plain integer by a Q64.64 fraction, flooring the result. */
export function mulQ(value: bigint, q: bigint): bigint {
  return (value * q) >> SHIFT;
}

/** Render a Q64.64 value as a decimal string (for display only). */
export function qToString(q: bigint, places = 6): string {
  const scale = 10n ** BigInt(places);
  const scaled = (q * scale) >> SHIFT;
  const whole = scaled / scale;
  const frac = (scaled % scale).toString().padStart(places, "0");
  return `${whole}.${frac}`;
}
