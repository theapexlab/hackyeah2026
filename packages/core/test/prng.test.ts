import { describe, expect, it } from 'vitest';
import { Prng } from '../src/prng';

describe('Prng (mulberry32)', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new Prng(42);
    const b = new Prng(42);
    const seqA = Array.from({ length: 1000 }, () => a.next());
    const seqB = Array.from({ length: 1000 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new Prng(1);
    const b = new Prng(2);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('matches the reference mulberry32 output', () => {
    // reference implementation
    const ref = (seed: number) => {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    const r = ref(12345);
    const p = new Prng(12345);
    for (let i = 0; i < 200; i++) expect(p.next()).toBe(r());
  });

  it('keeps next() in [0, 1) and int(n) in [0, n)', () => {
    const p = new Prng(7);
    for (let i = 0; i < 2000; i++) {
      const f = p.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = p.int(13);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(13);
      expect(Number.isInteger(n)).toBe(true);
    }
    expect(p.int(0)).toBe(0);
  });

  it('pick and shuffle are deterministic and shuffle does not mutate', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = new Prng(99);
    const b = new Prng(99);
    expect(a.pick(input)).toBe(b.pick(input));
    const sa = a.shuffle(input);
    const sb = b.shuffle(input);
    expect(sa).toEqual(sb);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...sa].sort((x, y) => x - y)).toEqual(input);
    expect(() => a.pick([])).toThrow();
  });
});
