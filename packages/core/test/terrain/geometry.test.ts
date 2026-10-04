import { describe, expect, it } from 'vitest';
import {
  distanceToPolygonBoundary,
  nearestPointOnSegment,
  pointInPolygon,
  polygonBbox,
  polygonCentroid,
  segmentIntersection,
  segmentIntersectsPolygon,
  segmentsCross,
} from '../../src/terrain/geometry';

const P = (x: number, y: number) => ({ x, y });
// L-shape: a 100 x 100 square with its top-right 50 x 50 quarter cut out
const L = [P(0, 0), P(50, 0), P(50, 50), P(100, 50), P(100, 100), P(0, 100)];

describe('terrain geometry', () => {
  it('pointInPolygon handles concave shapes', () => {
    expect(pointInPolygon(P(25, 25), L)).toBe(true);
    expect(pointInPolygon(P(75, 75), L)).toBe(true);
    expect(pointInPolygon(P(75, 25), L)).toBe(false); // the notch
    expect(pointInPolygon(P(150, 50), L)).toBe(false);
  });

  it('nearestPointOnSegment projects inside and clamps at the ends', () => {
    expect(nearestPointOnSegment(P(5, 3), P(0, 0), P(10, 0))).toEqual({
      x: 5,
      y: 0,
      t: 0.5,
      dist2: 9,
    });
    expect(nearestPointOnSegment(P(-4, 3), P(0, 0), P(10, 0))).toMatchObject({
      x: 0,
      t: 0,
      dist2: 25,
    });
    expect(nearestPointOnSegment(P(1, 1), P(2, 2), P(2, 2))).toMatchObject({ x: 2, y: 2, t: 0 });
  });

  it('segmentIntersection gives line parameters; parallel lines give null', () => {
    expect(segmentIntersection(P(0, 0), P(10, 0), P(5, -5), P(5, 5))).toEqual({ t: 0.5, u: 0.5 });
    const outside = segmentIntersection(P(0, 0), P(10, 0), P(20, -5), P(20, 5));
    expect(outside?.t).toBeCloseTo(2);
    expect(segmentIntersection(P(0, 0), P(10, 0), P(0, 1), P(10, 1))).toBeNull();
    expect(segmentIntersection(P(0, 0), P(10, 0), P(2, 0), P(8, 0))).toBeNull(); // collinear
  });

  it('segmentsCross counts touching but not misses', () => {
    expect(segmentsCross(P(0, 0), P(10, 0), P(10, -5), P(10, 5))).toBe(true);
    expect(segmentsCross(P(0, 0), P(10, 0), P(11, -5), P(11, 5))).toBe(false);
  });

  it('segmentIntersectsPolygon: endpoints inside or a boundary crossing', () => {
    expect(segmentIntersectsPolygon(P(25, 25), P(30, 30), L)).toBe(true);
    expect(segmentIntersectsPolygon(P(75, 25), P(75, 75), L)).toBe(true);
    expect(segmentIntersectsPolygon(P(60, 10), P(90, 40), L)).toBe(false); // stays in the notch
  });

  it('bbox, boundary distance and centroid', () => {
    expect(polygonBbox(L)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    expect(distanceToPolygonBoundary(P(25, 25), L)).toBe(25);
    expect(distanceToPolygonBoundary(P(75, 30), L)).toBe(20);
    const square = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)];
    expect(polygonCentroid(square)).toEqual({ x: 5, y: 5 });
    expect(polygonCentroid([P(0, 0), P(10, 0)])).toEqual({ x: 5, y: 0 });
  });
});
