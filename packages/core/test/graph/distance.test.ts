import { describe, expect, it } from 'vitest';
import { dist2, distance, insideCircle, qualityBucket } from '../../src/graph/distance';

describe('distance helpers', () => {
  it('dist2 and distance agree', () => {
    expect(dist2(0, 0, 3, 4)).toBe(25);
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distance({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
  });

  it('qualityBucket splits the range into thirds, boundaries inclusive on the nearer side', () => {
    expect(qualityBucket(0, 60)).toBe('near');
    expect(qualityBucket(20, 60)).toBe('near');
    expect(qualityBucket(20.001, 60)).toBe('medium');
    expect(qualityBucket(40, 60)).toBe('medium');
    expect(qualityBucket(40.001, 60)).toBe('far');
    expect(qualityBucket(60, 60)).toBe('far');
  });

  it('insideCircle includes the boundary', () => {
    const c = { x: 100, y: 100, r: 50 };
    expect(insideCircle(100, 100, c)).toBe(true);
    expect(insideCircle(150, 100, c)).toBe(true);
    expect(insideCircle(150.5, 100, c)).toBe(false);
    expect(insideCircle(0, 0, c)).toBe(false);
  });
});
