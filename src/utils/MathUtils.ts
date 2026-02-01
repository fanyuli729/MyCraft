/**
 * Clamp `value` to the inclusive range [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Linearly interpolate between `a` and `b` by factor `t`.
 *
 *   lerp(0, 10, 0.5) => 5
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Hermite smoothstep: maps `t` in [0,1] to a smooth S-curve.
 *
 * Returns 0 when t <= 0, 1 when t >= 1, and a smooth transition in between.
 * The result has zero first-derivative at t = 0 and t = 1.
 */
export function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/**
 * True (floored) modulo that always returns a non-negative result.
 *
 * Unlike the JavaScript `%` operator which preserves the sign of the dividend,
 * `mod` wraps negative values into the [0, divisor) range:
 *
 *   mod(-1, 16) => 15
 *   mod(17, 16) => 1
 *   mod(0, 16)  => 0
 */
export function mod(n: number, d: number): number {
  return ((n % d) + d) % d;
}

/**
 * Simple non-cryptographic hash for a string.
 * Returns a 32-bit signed integer (same algorithm as Java's String.hashCode).
 *
 *   hashCode("hello") => 99162322
 */
export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    // hash = hash * 31 + charCode, keeping within 32-bit signed integer range
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return hash;
}
