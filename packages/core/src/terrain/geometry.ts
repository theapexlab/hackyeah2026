import type { Pt } from './types';

/** Axis-aligned bounds. */
export interface Bbox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Projection of a point onto a segment; t is clamped to [0, 1]. */
export interface SegmentProjection {
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly dist2: number;
}

/** Even-odd ray cast. Points exactly on the boundary may land either way. */
export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function nearestPointOnSegment(p: Pt, a: Pt, b: Pt): SegmentProjection {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return { x, y, t, dist2: (p.x - x) ** 2 + (p.y - y) ** 2 };
}

/**
 * Parameters of the intersection of the lines through ab and cd: the point is a + t(b - a)
 * = c + u(d - c). Unclamped; null when the lines are parallel (or a segment is degenerate).
 */
export function segmentIntersection(
  a: Pt,
  b: Pt,
  c: Pt,
  d: Pt,
): { readonly t: number; readonly u: number } | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  const scale = Math.hypot(rx, ry) * Math.hypot(sx, sy);
  if (scale === 0 || Math.abs(den) <= 1e-9 * scale) return null;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  return { t: (qx * sy - qy * sx) / den, u: (qx * ry - qy * rx) / den };
}

/** True when segments ab and cd share a point (touching counts). Collinear overlaps: false. */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const x = segmentIntersection(a, b, c, d);
  return x !== null && x.t >= 0 && x.t <= 1 && x.u >= 0 && x.u <= 1;
}

export function polygonBbox(poly: readonly Pt[]): Bbox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** True when either endpoint is inside the polygon or the segment crosses its boundary. */
export function segmentIntersectsPolygon(a: Pt, b: Pt, poly: readonly Pt[]): boolean {
  if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return true;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if (segmentsCross(a, b, poly[j]!, poly[i]!)) return true;
  }
  return false;
}

/** Distance from p to the polygon outline (0 on the outline; inside or outside alike). */
export function distanceToPolygonBoundary(p: Pt, poly: readonly Pt[]): number {
  let best = Number.POSITIVE_INFINITY;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const q = nearestPointOnSegment(p, poly[j]!, poly[i]!);
    if (q.dist2 < best) best = q.dist2;
  }
  return Math.sqrt(best);
}

/** Area centroid; falls back to the vertex mean for degenerate (zero-area) polygons. */
export function polygonCentroid(poly: readonly Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const p = poly[j]!;
    const q = poly[i]!;
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0;
    let sy = 0;
    for (const p of poly) {
      sx += p.x;
      sy += p.y;
    }
    return n === 0 ? { x: 0, y: 0 } : { x: sx / n, y: sy / n };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}
