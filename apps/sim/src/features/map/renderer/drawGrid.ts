import { createPrng } from '@pomoc/core';
import type { Palette } from '../../../theme/tokens';

export interface WorldSize {
  width: number;
  height: number;
  seed: number | string;
}

/** Procedural, seed-stable street grid as one Path2D in world coordinates. */
export function buildStreets({ width, height, seed }: WorldSize): Path2D {
  const rng = createPrng(`streets:${seed}`);
  const path = new Path2D();
  for (const [len, cross, vertical] of [
    [width, height, true],
    [height, width, false],
  ] as const) {
    for (let at = len * 0.04; at < len; at += rng.float(len * 0.05, len * 0.11)) {
      let from = 0;
      while (from < cross) {
        const to = Math.min(cross, from + rng.float(cross * 0.25, cross * 0.7));
        if (rng.float(0, 1) > 0.18) {
          if (vertical) {
            path.moveTo(at, from);
            path.lineTo(at, to);
          } else {
            path.moveTo(from, at);
            path.lineTo(to, at);
          }
        }
        from = to;
      }
    }
  }
  return path;
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  size: WorldSize,
  streets: Path2D,
  palette: Palette,
  k: number,
): void {
  ctx.fillStyle = palette.world;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.strokeStyle = palette.street;
  ctx.lineWidth = 1 / k;
  ctx.stroke(streets);
  ctx.strokeStyle = palette.street;
  ctx.lineWidth = 2 / k;
  ctx.strokeRect(0, 0, size.width, size.height);
}
