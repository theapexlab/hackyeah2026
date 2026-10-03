/** Affine view transform shared by the SVG layer, the canvas and hit-testing: screen = world * k + (x, y). */
export interface Transform {
  readonly x: number;
  readonly y: number;
  readonly k: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const IDENTITY_TRANSFORM: Transform = { x: 0, y: 0, k: 1 };

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function worldToScreen(t: Transform, wx: number, wy: number): Point {
  return { x: wx * t.k + t.x, y: wy * t.k + t.y };
}

export function screenToWorld(t: Transform, sx: number, sy: number): Point {
  return { x: (sx - t.x) / t.k, y: (sy - t.y) / t.k };
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Nearest node to a world point, or null when none is within maxDistance.
 * Linear scan; the pure-canvas fallback renderer uses it as its hit test.
 */
export function nearestNode<T extends Point>(
  nodes: readonly T[],
  x: number,
  y: number,
  maxDistance = Number.POSITIVE_INFINITY,
): T | null {
  let best: T | null = null;
  let bestDist = maxDistance;
  for (const node of nodes) {
    const d = distance(node.x, node.y, x, y);
    if (d <= bestDist) {
      best = node;
      bestDist = d;
    }
  }
  return best;
}

/** Transform that fits a worldWidth x worldHeight plane into a view with padding, centred. */
export function fitTransform(
  worldWidth: number,
  worldHeight: number,
  viewWidth: number,
  viewHeight: number,
  padding = 48,
): Transform {
  if (worldWidth <= 0 || worldHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) {
    return IDENTITY_TRANSFORM;
  }
  const innerW = Math.max(1, viewWidth - padding * 2);
  const innerH = Math.max(1, viewHeight - padding * 2);
  const k = Math.min(innerW / worldWidth, innerH / worldHeight);
  return {
    k,
    x: (viewWidth - worldWidth * k) / 2,
    y: (viewHeight - worldHeight * k) / 2,
  };
}

/** Transform that centres the world point (wx, wy) in the view at scale k. */
export function focusTransform(
  wx: number,
  wy: number,
  viewWidth: number,
  viewHeight: number,
  k: number,
): Transform {
  return { k, x: viewWidth / 2 - wx * k, y: viewHeight / 2 - wy * k };
}
