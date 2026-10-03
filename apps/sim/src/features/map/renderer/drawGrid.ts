import { Prng } from '@pomoc/core';
import type { Palette } from '../../../theme/tokens';

/**
 * Procedural district: irregular streets (a few of them avenues) and a handful of parks,
 * seeded from the world seed so a given seed always draws the same town. Paths are in world
 * metres and cached until the seed or the area changes.
 */
export interface StreetGrid {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly minor: Path2D;
  readonly major: Path2D;
  readonly parks: Path2D;
  readonly streets: number;
}

const MIN_SPACING = 55;
const MAX_SPACING = 135;
const JITTER = 10;

function streetPositions(prng: Prng, length: number): number[] {
  const out: number[] = [];
  let pos = prng.float(MIN_SPACING * 0.5, MAX_SPACING * 0.5);
  while (pos < length - MIN_SPACING * 0.5) {
    out.push(pos);
    pos += prng.float(MIN_SPACING, MAX_SPACING);
  }
  return out;
}

/** A street as a gently bent polyline so the plan does not look like graph paper. */
function addStreet(path: Path2D, prng: Prng, vertical: boolean, at: number, length: number): void {
  const segments = 6;
  const step = length / segments;
  let offset = prng.float(-JITTER, JITTER);
  path.moveTo(vertical ? at + offset : 0, vertical ? 0 : at + offset);
  for (let i = 1; i <= segments; i++) {
    offset += prng.float(-JITTER * 0.6, JITTER * 0.6);
    const along = i * step;
    path.lineTo(vertical ? at + offset : along, vertical ? along : at + offset);
  }
}

export function buildStreetGrid(seed: number, width: number, height: number): StreetGrid {
  // Mixed with a constant so the town differs from the engine's own PRNG stream for the same seed.
  const prng = new Prng((seed ^ 0x9e3779b9) >>> 0);
  const minor = new Path2D();
  const major = new Path2D();
  const parks = new Path2D();

  const xs = streetPositions(prng, width);
  const ys = streetPositions(prng, height);
  let streets = 0;
  for (const x of xs) {
    const isMajor = prng.next() < 0.22;
    addStreet(isMajor ? major : minor, prng, true, x, height);
    streets += 1;
  }
  for (const y of ys) {
    const isMajor = prng.next() < 0.22;
    addStreet(isMajor ? major : minor, prng, false, y, width);
    streets += 1;
  }

  const parkCount = 2 + prng.int(4);
  for (let i = 0; i < parkCount && xs.length > 1 && ys.length > 1; i++) {
    const xi = prng.int(xs.length - 1);
    const yi = prng.int(ys.length - 1);
    const x0 = xs[xi];
    const x1 = xs[xi + 1];
    const y0 = ys[yi];
    const y1 = ys[yi + 1];
    if (x0 === undefined || x1 === undefined || y0 === undefined || y1 === undefined) continue;
    const inset = 6;
    parks.rect(x0 + inset, y0 + inset, x1 - x0 - inset * 2, y1 - y0 - inset * 2);
  }

  return { seed, width, height, minor, major, parks, streets };
}

export function streetGridStale(
  cache: StreetGrid | null,
  world: { readonly seed: number; readonly width: number; readonly height: number },
): boolean {
  return (
    cache === null ||
    cache.seed !== world.seed ||
    cache.width !== world.width ||
    cache.height !== world.height
  );
}

/** District plane: fill, parks, streets and the border. World space; widths divided by k. */
export function drawStreetGrid(
  ctx: CanvasRenderingContext2D,
  grid: StreetGrid,
  palette: Palette,
  k: number,
): void {
  ctx.fillStyle = palette.worldFill;
  ctx.fillRect(0, 0, grid.width, grid.height);

  ctx.fillStyle = palette.park;
  ctx.fill(grid.parks);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = palette.streetMinor;
  ctx.lineWidth = 1 / k;
  ctx.stroke(grid.minor);
  ctx.strokeStyle = palette.streetMajor;
  ctx.lineWidth = 2.5 / k;
  ctx.stroke(grid.major);

  ctx.strokeStyle = palette.worldStroke;
  ctx.lineWidth = 1.5 / k;
  ctx.strokeRect(0, 0, grid.width, grid.height);
}
