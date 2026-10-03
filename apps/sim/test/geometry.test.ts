import { describe, expect, it } from 'vitest';
import {
  clamp,
  fitTransform,
  focusTransform,
  IDENTITY_TRANSFORM,
  nearestNode,
  screenToWorld,
  worldToScreen,
} from '../src/lib/geometry';

describe('geometry', () => {
  it('worldToScreen and screenToWorld are inverses', () => {
    const t = { x: 40, y: -10, k: 2.5 };
    const p = worldToScreen(t, 100, 200);
    expect(p).toEqual({ x: 290, y: 490 });
    expect(screenToWorld(t, p.x, p.y)).toEqual({ x: 100, y: 200 });
  });

  it('fitTransform centres the world with padding and never upscales past the view', () => {
    const t = fitTransform(1000, 700, 1100, 800, 50);
    expect(t.k).toBe(1);
    expect(t.x).toBe(50);
    expect(t.y).toBe(50);
    const wide = fitTransform(1000, 700, 2000, 800, 0);
    expect(wide.k).toBeCloseTo(800 / 700);
    expect(wide.x).toBeCloseTo((2000 - (1000 * 800) / 700) / 2);
    expect(fitTransform(0, 0, 100, 100)).toBe(IDENTITY_TRANSFORM);
  });

  it('focusTransform puts the point in the middle of the view', () => {
    const t = focusTransform(100, 50, 800, 600, 2);
    expect(worldToScreen(t, 100, 50)).toEqual({ x: 400, y: 300 });
  });

  it('nearestNode respects maxDistance', () => {
    const nodes = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 10, y: 0 },
    ];
    expect(nearestNode(nodes, 8, 0)?.id).toBe('b');
    expect(nearestNode(nodes, 8, 0, 1)).toBeNull();
    expect(nearestNode([], 0, 0)).toBeNull();
  });

  it('clamp', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});
