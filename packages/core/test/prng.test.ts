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
});
