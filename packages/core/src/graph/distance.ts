/**
 * Distance calculations for the proximity graph.
 */

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

export function inRange(x1: number, y1: number, x2: number, y2: number, maxDist: number): boolean {
  return distance(x1, y1, x2, y2) <= maxDist;
}

export function quality(dist: number, maxDist: number): 'near' | 'medium' | 'far' {
  const frac = dist / maxDist;
  if (frac < 1 / 3) return 'near';
  if (frac < 2 / 3) return 'medium';
  return 'far';
}
