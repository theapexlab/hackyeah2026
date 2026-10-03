import { insideCircle } from '@pomoc/core';
import { describe, expect, it } from 'vitest';
import { AROUND_RADIUS, formatRegion, regionFor } from '../src/lib/regions';

const world = { width: 1000, height: 700 };

describe('regionFor', () => {
  it('whole city is "no region"', () => {
    expect(regionFor('city', world)).toBeUndefined();
  });

  it('west and east halves cover their own middle band and not the far edge', () => {
    const west = regionFor('west', world);
    const east = regionFor('east', world);
    if (!west || !east) throw new Error('expected circles');
    expect(insideCircle(50, 350, west)).toBe(true);
    expect(insideCircle(250, 20, west)).toBe(true);
    expect(insideCircle(950, 350, west)).toBe(false);
    expect(insideCircle(950, 350, east)).toBe(true);
    expect(insideCircle(50, 350, east)).toBe(false);
  });

  it('around a node uses the fixed radius and needs a node', () => {
    expect(regionFor('around', world, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      r: AROUND_RADIUS,
    });
    expect(regionFor('around', world, null)).toBeUndefined();
  });
});

describe('formatRegion', () => {
  it('formats circles and the absence of one', () => {
    expect(formatRegion(null)).toBe('whole city');
    expect(formatRegion({ x: 250.4, y: 350, r: 250 })).toBe('(250, 350) r 250 m');
  });
});
