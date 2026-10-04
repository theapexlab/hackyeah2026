import { Prng } from '../prng';
import type { Polygon, Polyline, Pt, TerrainSource } from './types';

const MIN_SPACING = 55;
const MAX_SPACING = 135;
const JITTER = 10;
const SEGMENTS = 6;
const PARK_INSET = 6;

function streetPositions(prng: Prng, length: number, scale: number): number[] {
  const out: number[] = [];
  const min = MIN_SPACING * scale;
  const max = MAX_SPACING * scale;
  let pos = prng.float(min * 0.5, max * 0.5);
  while (pos < length - min * 0.5) {
    out.push(pos);
    pos += prng.float(min, max);
  }
  return out;
}

/** A gently bent street across the whole area so the plan does not look like graph paper. */
function streetLine(prng: Prng, vertical: boolean, at: number, length: number): Pt[] {
  const step = length / SEGMENTS;
  let offset = prng.float(-JITTER, JITTER);
  const pts: Pt[] = [vertical ? { x: at + offset, y: 0 } : { x: 0, y: at + offset }];
  for (let i = 1; i <= SEGMENTS; i++) {
    offset += prng.float(-JITTER * 0.6, JITTER * 0.6);
    const along = i * step;
    pts.push(vertical ? { x: at + offset, y: along } : { x: along, y: at + offset });
  }
  return pts;
}

/** Cross-coordinate of a polyline at `along` (x of a vertical street at y, or y at x). */
function crossAt(pts: readonly Pt[], vertical: boolean, along: number): number {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const a0 = vertical ? a.y : a.x;
    const b0 = vertical ? b.y : b.x;
    if (along >= a0 && along <= b0) {
      const t = b0 === a0 ? 0 : (along - a0) / (b0 - a0);
      return vertical ? a.x + (b.x - a.x) * t : a.y + (b.y - a.y) * t;
    }
  }
  const last = pts[pts.length - 1]!;
  return vertical ? last.x : last.y;
}

/** Extreme cross-coordinate of a polyline over [from, to] (vertices inside plus both ends). */
function crossExtreme(
  pts: readonly Pt[],
  vertical: boolean,
  from: number,
  to: number,
  pick: (a: number, b: number) => number,
): number {
  let v = pick(crossAt(pts, vertical, from), crossAt(pts, vertical, to));
  for (const p of pts) {
    const along = vertical ? p.y : p.x;
    if (along > from && along < to) v = pick(v, vertical ? p.x : p.y);
  }
  return v;
}

/**
 * Procedural district for any seed but Kraków's: irregular edge-to-edge streets (about a
 * fifth of them avenues) and a few parks, each a street block inset by 6 m. Seeded with
 * the world seed mixed with a constant, so it never disturbs the engine's own PRNG stream.
 * Street spacing grows with the area so huge worlds stay cheap.
 */
export function proceduralTerrain(seed: number, width: number, height: number): TerrainSource {
  const prng = new Prng((seed ^ 0x9e3779b9) >>> 0);
  const scale = Math.max(1, Math.max(width, height) / 3000);
  const xs = streetPositions(prng, width, scale);
  const ys = streetPositions(prng, height, scale);
  const streets: Polyline[] = [];
  const verticals: Pt[][] = [];
  const horizontals: Pt[][] = [];
  for (const x of xs) {
    const major = prng.next() < 0.22;
    const pts = streetLine(prng, true, x, height);
    verticals.push(pts);
    streets.push({ pts, major });
  }
  for (const y of ys) {
    const major = prng.next() < 0.22;
    const pts = streetLine(prng, false, y, width);
    horizontals.push(pts);
    streets.push({ pts, major });
  }

  const parks: Polygon[] = [];
  const parkCount = 2 + prng.int(4);
  for (let i = 0; i < parkCount && xs.length > 1 && ys.length > 1; i++) {
    const xi = prng.int(xs.length - 1);
    const yi = prng.int(ys.length - 1);
    const west = verticals[xi]!;
    const east = verticals[xi + 1]!;
    const north = horizontals[yi]!;
    const south = horizontals[yi + 1]!;
    const y0 = ys[yi]!;
    const y1 = ys[yi + 1]!;
    const x0 = xs[xi]!;
    const x1 = xs[xi + 1]!;
    // The block between the actual (jittered) streets, so every park edge has a street next to it.
    const left = crossExtreme(west, true, y0 - JITTER * 4, y1 + JITTER * 4, Math.max) + PARK_INSET;
    const right = crossExtreme(east, true, y0 - JITTER * 4, y1 + JITTER * 4, Math.min) - PARK_INSET;
    const top = crossExtreme(north, false, x0 - JITTER * 4, x1 + JITTER * 4, Math.max) + PARK_INSET;
    const bottom =
      crossExtreme(south, false, x0 - JITTER * 4, x1 + JITTER * 4, Math.min) - PARK_INSET;
    if (right - left < 12 || bottom - top < 12) continue;
    parks.push({
      pts: [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
      ],
    });
  }
  return {
    id: `procedural-${seed}-${width}x${height}`,
    width,
    height,
    streets,
    parks,
    water: [],
    labels: [],
  };
}
