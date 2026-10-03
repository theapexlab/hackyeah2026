import type { Circle } from '../domain/message';
import type { EdgeQuality } from '../domain/snapshot';

/** Squared Euclidean distance between two points (no sqrt; use for range comparisons). */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Euclidean distance between two positioned things. */
export function distance(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): number {
  return Math.sqrt(dist2(a.x, a.y, b.x, b.y));
}

/**
 * Signal quality bucket for an edge of length `d` under radio range `range`:
 * near for the first third, medium for the second, far for the last.
 */
export function qualityBucket(d: number, range: number): EdgeQuality {
  if (d <= range / 3) return 'near';
  if (d <= (2 * range) / 3) return 'medium';
  return 'far';
}

/** True when the point lies inside or on the boundary of the circle. */
export function insideCircle(x: number, y: number, circle: Circle): boolean {
  return dist2(x, y, circle.x, circle.y) <= circle.r * circle.r;
}
