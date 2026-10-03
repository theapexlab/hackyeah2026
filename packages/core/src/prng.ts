/**
 * Deterministic pseudo-random generator (mulberry32).
 * This is the ONLY source of randomness in core: world generation, mobility,
 * random requests and random auto-respond all draw from one instance in a fixed order.
 */
export class Prng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Current internal state; useful for tests and debugging. */
  get seedState(): number {
    return this.state;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, maxExclusive). Returns 0 when maxExclusive <= 0. */
  int(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniformly picks one element. Throws on an empty array. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Prng.pick: empty array');
    return arr[this.int(arr.length)] as T;
  }

  /** Deterministic Fisher-Yates shuffle; returns a new array, input untouched. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }
}
