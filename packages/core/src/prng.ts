/**
 * Mulberry32 PRNG - the ONLY randomness source in the engine.
 * Deterministic: same seed → same sequence; different seeds differ.
 */

export interface Prng {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // [min, max)
  float(min: number, max: number): number; // [min, max)
  pick<T>(items: T[]): T;
  shuffle<T>(items: T[]): void; // in-place
}

export function createPrng(seed: number | string): Prng {
  let state = typeof seed === 'string' ? hashString(seed) : Math.abs(Math.floor(seed)) || 1;

  const next = (): number => {
    state |= 0; // coerce to i32
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    return Math.floor(next() * (max - min)) + min;
  };

  const float = (min: number, max: number): number => {
    return next() * (max - min) + min;
  };

  const pick = <T>(items: T[]): T => {
    return items[int(0, items.length)]!;
  };

  const shuffle = <T>(items: T[]): void => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = int(0, i + 1);
      const temp = items[i]!;
      items[i] = items[j]!;
      items[j] = temp;
    }
  };

  return { next, int, float, pick, shuffle };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) || 1;
}
