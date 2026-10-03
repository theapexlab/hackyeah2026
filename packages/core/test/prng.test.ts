import { describe, expect, it } from 'vitest';
import { createPrng } from '../src/prng';

describe('prng', () => {
  it('same seed produces same sequence', () => {
    const prng1 = createPrng(42);
    const prng2 = createPrng(42);

    const seq1 = Array.from({ length: 10 }, () => prng1.next());
    const seq2 = Array.from({ length: 10 }, () => prng2.next());

    expect(seq1).toEqual(seq2);
  });

  it('different seeds produce different sequences', () => {
    const prng1 = createPrng(42);
    const prng2 = createPrng(43);

    const seq1 = Array.from({ length: 10 }, () => prng1.next());
    const seq2 = Array.from({ length: 10 }, () => prng2.next());

    expect(seq1).not.toEqual(seq2);
  });

  it('string seed produces deterministic sequence', () => {
    const prng1 = createPrng('test-seed');
    const prng2 = createPrng('test-seed');

    const seq1 = Array.from({ length: 5 }, () => prng1.int(0, 100));
    const seq2 = Array.from({ length: 5 }, () => prng2.int(0, 100));

    expect(seq1).toEqual(seq2);
  });

  it('pick is deterministic with same seed', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const prng1 = createPrng(42);
    const prng2 = createPrng(42);

    const picks1 = Array.from({ length: 10 }, () => prng1.pick(items));
    const picks2 = Array.from({ length: 10 }, () => prng2.pick(items));

    expect(picks1).toEqual(picks2);
  });

  it('shuffle is deterministic with same seed', () => {
    const prng1 = createPrng(42);
    const prng2 = createPrng(42);

    const arr1 = [1, 2, 3, 4, 5];
    const arr2 = [1, 2, 3, 4, 5];

    prng1.shuffle(arr1);
    prng2.shuffle(arr2);

    expect(arr1).toEqual(arr2);
  });

  it('next produces values in [0, 1)', () => {
    const prng = createPrng(42);
    for (let i = 0; i < 1000; i++) {
      const val = prng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('int respects bounds', () => {
    const prng = createPrng(42);
    for (let i = 0; i < 1000; i++) {
      const val = prng.int(10, 20);
      expect(val).toBeGreaterThanOrEqual(10);
      expect(val).toBeLessThan(20);
    }
  });
});
