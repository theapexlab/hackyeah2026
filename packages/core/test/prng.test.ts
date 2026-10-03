/**
 * PRNG tests
 */

import { describe, expect, it } from 'vitest';
import { createPrng } from '../src/prng';

describe('PRNG', () => {
  it('same seed produces same sequence', () => {
    const rng1 = createPrng(42);
    const rng2 = createPrng(42);

    for (let i = 0; i < 100; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('different seeds produce different sequences', () => {
    const rng1 = createPrng(42);
    const rng2 = createPrng(43);

    let same = 0;
    for (let i = 0; i < 100; i++) {
      if (rng1.next() === rng2.next()) same++;
    }

    expect(same).toBeLessThan(10);
  });

  it('pick is deterministic', () => {
    const rng1 = createPrng(42);
    const rng2 = createPrng(42);
    const items = ['a', 'b', 'c', 'd'];

    for (let i = 0; i < 50; i++) {
      expect(rng1.pick(items)).toBe(rng2.pick(items));
    }
  });

  it('shuffle is deterministic', () => {
    const rng1 = createPrng(42);
    const rng2 = createPrng(42);

    for (let i = 0; i < 10; i++) {
      const arr1 = [1, 2, 3, 4, 5];
      const arr2 = [1, 2, 3, 4, 5];
      rng1.shuffle(arr1);
      rng2.shuffle(arr2);
      expect(arr1).toEqual(arr2);
    }
  });

  it('string seeds are deterministic and distinct', () => {
    const a = createPrng('alpha');
    const b = createPrng('alpha');
    const c = createPrng('beta');
    expect(a.next()).toBe(b.next());
    expect(createPrng('alpha').next()).not.toBe(c.next());
  });

  it('next is in [0, 1), int in [min, max), float in [min, max)', () => {
    const rng = createPrng(1);
    for (let i = 0; i < 1000; i++) {
      const n = rng.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      const k = rng.int(3, 8);
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(3);
      expect(k).toBeLessThan(8);
      const f = rng.float(-2, 2);
      expect(f).toBeGreaterThanOrEqual(-2);
      expect(f).toBeLessThan(2);
    }
  });

  it('shuffle is a permutation and actually reorders', () => {
    const rng = createPrng(5);
    const arr = Array.from({ length: 20 }, (_, i) => i);
    const copy = [...arr];
    rng.shuffle(copy);
    expect([...copy].sort((x, y) => x - y)).toEqual(arr);
    expect(copy).not.toEqual(arr);
  });

  it('draw order matters: the sequence is a single shared stream', () => {
    const a = createPrng(9);
    const b = createPrng(9);
    a.next();
    b.next();
    expect(a.next()).toBe(b.next());
    expect(createPrng(9).next()).not.toBe(b.next());
  });
});
