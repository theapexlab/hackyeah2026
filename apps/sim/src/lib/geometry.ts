export interface Vec2 {
  x: number;
  y: number;
}

/** d3-zoom convention: screen = world * k + (x, y). */
export interface Transform {
  x: number;
  y: number;
  k: number;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

export const worldToScreen = (p: Vec2, t: Transform): Vec2 => ({
  x: p.x * t.k + t.x,
  y: p.y * t.k + t.y,
});

export const screenToWorld = (p: Vec2, t: Transform): Vec2 => ({
  x: (p.x - t.x) / t.k,
  y: (p.y - t.y) / t.k,
});

/** Nearest item to a world point within `radius` (world units); undefined when none. */
export function nearestNode<T extends Vec2>(pos: Vec2, nodes: readonly T[], radius: number) {
  let best: T | undefined;
  let bestD = radius;
  for (const n of nodes) {
    const d = distance(pos, n);
    if (d <= bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}
