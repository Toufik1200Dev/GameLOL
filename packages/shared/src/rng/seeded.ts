/**
 * Deterministic, fast, seedable PRNG (mulberry32) plus helpers. Used by the
 * procedural world generator so the server and every client build an IDENTICAL
 * map (and therefore identical static collision) from a single integer seed.
 */

export type RandomFn = () => number;

/** Hash a string seed into a 32-bit integer (FNV-1a style). */
export const hashStringToSeed = (str: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** mulberry32 — returns a function producing floats in [0, 1). */
export const mulberry32 = (seed: number): RandomFn => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A small stateful random source with convenience methods. */
export class SeededRandom {
  private readonly next: RandomFn;

  constructor(seed: number | string) {
    const numericSeed = typeof seed === 'string' ? hashStringToSeed(seed) : seed;
    this.next = mulberry32(numericSeed);
  }

  /** Float in [0, 1). */
  float(): number {
    return this.next();
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with the given probability (0..1). */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** Pick a random element from a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('SeededRandom.pick: empty array');
    return arr[Math.floor(this.next() * arr.length)]!;
  }
}
