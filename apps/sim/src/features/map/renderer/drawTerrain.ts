import type { Pt, Terrain } from '@pomoc/core';
import type { Palette } from '../../../theme/tokens';

/** The subset of Path2D the builders use, so tests can record calls without a DOM. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

/** Cached Path2Ds of one terrain; rebuilt only when the snapshot hands over another Terrain. */
export interface TerrainPaths {
  readonly terrain: Terrain;
  readonly water: Path2D;
  readonly parks: Path2D;
  readonly minor: Path2D;
  readonly major: Path2D;
}

export function appendPolyline(path: PathSink, pts: readonly Pt[]): void {
  const first = pts[0];
  if (first === undefined || pts.length < 2) return;
  path.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p !== undefined) path.lineTo(p.x, p.y);
  }
}

export function appendPolygon(path: PathSink, pts: readonly Pt[]): void {
  if (pts.length < 3) return;
  appendPolyline(path, pts);
  path.closePath();
}

export function buildTerrainPaths(terrain: Terrain): TerrainPaths {
  const water = new Path2D();
  const parks = new Path2D();
  const minor = new Path2D();
  const major = new Path2D();
  for (const w of terrain.water) appendPolygon(water, w.pts);
  for (const p of terrain.parks) appendPolygon(parks, p.pts);
  for (const s of terrain.streets) appendPolyline(s.major ? major : minor, s.pts);
  return { terrain, water, parks, minor, major };
}

/** Below this zoom the captions would crowd the plan. */
export const LABEL_MIN_SCALE = 0.25;

export function labelsVisible(k: number): boolean {
  return k >= LABEL_MIN_SCALE;
}

/**
 * Street stroke width in world metres: a real carriageway width once zoomed in, never
 * thinner than `minPx` screen pixels when zoomed out.
 */
export function streetWidth(k: number, metres: number, minPx: number): number {
  return Math.max(minPx / k, metres);
}

const LABEL_FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * The basemap, in world space: plane, river, parks, streets (bridges are streets, so they
 * draw over the water), border and captions. Captions keep a constant screen size.
 */
export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  paths: TerrainPaths,
  palette: Palette,
  k: number,
): void {
  const { width, height, labels } = paths.terrain;
  ctx.fillStyle = palette.worldFill;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = palette.water;
  ctx.fill(paths.water);
  ctx.fillStyle = palette.park;
  ctx.fill(paths.parks);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = palette.streetMinor;
  ctx.lineWidth = streetWidth(k, 3.5, 1);
  ctx.stroke(paths.minor);
  ctx.strokeStyle = palette.streetMajor;
  ctx.lineWidth = streetWidth(k, 8, 2.5);
  ctx.stroke(paths.major);

  ctx.strokeStyle = palette.worldStroke;
  ctx.lineWidth = 1.5 / k;
  ctx.strokeRect(0, 0, width, height);

  if (labels.length === 0 || !labelsVisible(k)) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const label of labels) {
    const water = label.kind === 'water';
    ctx.font = water ? `italic 500 ${13 / k}px ${LABEL_FONT}` : `600 ${12 / k}px ${LABEL_FONT}`;
    ctx.fillStyle = water ? palette.waterLabel : palette.label;
    ctx.fillText(water ? label.text : label.text.toUpperCase(), label.x, label.y);
  }
}
