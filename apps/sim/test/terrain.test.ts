/**
 * The Kraków basemap from the app's side: the seed-42 helpers, the store keeping one
 * Terrain object per world (the renderer caches its Path2Ds on that identity), the
 * street traffic being on from the first world, and the pure path builders.
 */
import {
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_WORLD_CONFIG,
  KRAKOW_HEIGHT,
  KRAKOW_SEED,
  KRAKOW_TERRAIN_ID,
  KRAKOW_WIDTH,
  type Pt,
  travelTargets,
} from '@pomoc/core';
import { describe, expect, it } from 'vitest';
import {
  appendPolygon,
  appendPolyline,
  labelsVisible,
  type PathSink,
  streetWidth,
} from '../src/features/map/renderer/drawTerrain';
import { isKrakowSeed, terrainTitle } from '../src/lib/terrain';
import { countNodes } from '../src/sim/selectors';
import { createWorld, resetWorld, useSimStore } from '../src/sim/store';
import { DEFAULT_CONFIG_DRAFT } from '../src/ui/store';

function recorder(): PathSink & { ops: string[] } {
  const ops: string[] = [];
  return {
    ops,
    moveTo: (x, y) => ops.push(`M${x},${y}`),
    lineTo: (x, y) => ops.push(`L${x},${y}`),
    closePath: () => ops.push('Z'),
  };
}

const pts = (...xy: number[]): Pt[] =>
  xy.flatMap((v, i) => (i % 2 === 0 ? [{ x: v, y: xy[i + 1] ?? 0 }] : []));

describe('Kraków map in the app', () => {
  it('names the Kraków seed and its map', () => {
    expect(isKrakowSeed(KRAKOW_SEED)).toBe(true);
    expect(isKrakowSeed(7)).toBe(false);
    expect(terrainTitle(KRAKOW_TERRAIN_ID)).toBe('Kraków · Kazimierz');
    expect(terrainTitle('procedural-7-1000x700')).toBeNull();
  });

  it('starts on the Kraków map with the default shares on the move, 200 ms ticks', () => {
    expect(DEFAULT_CONFIG_DRAFT.mobility).toBe(true);
    const { snapshot } = useSimStore.getState();
    expect(snapshot.terrain.id).toBe(KRAKOW_TERRAIN_ID);
    expect(snapshot.world.mobility).toBe(true);
    const { engine, tickIntervalMs } = useSimStore.getState();
    expect(tickIntervalMs).toBe(200);
    expect(engine.config.tickSeconds).toBe(0.2);
    const t = travelTargets(DEFAULT_WORLD_CONFIG.mobiles, DEFAULT_ENGINE_CONFIG.mobility.shares);
    const expected = [t.foot, t.bike, t.car];
    const counts = countNodes(snapshot.nodes);
    expect([counts.walking, counts.cycling, counts.driving]).toEqual(expected);
    engine.step(20);
    const later = countNodes(useSimStore.getState().snapshot.nodes);
    expect([later.walking, later.cycling, later.driving]).toEqual(expected);
  });

  it('seed 42 ignores the configured size and keeps one terrain object per world', () => {
    createWorld({ ...DEFAULT_WORLD_CONFIG, seed: KRAKOW_SEED, width: 500, height: 400 });
    const first = useSimStore.getState().snapshot;
    expect([first.world.width, first.world.height]).toEqual([KRAKOW_WIDTH, KRAKOW_HEIGHT]);
    useSimStore.getState().engine.step(3);
    expect(useSimStore.getState().snapshot.terrain).toBe(first.terrain);
    resetWorld();
    expect(useSimStore.getState().snapshot.terrain.id).toBe(KRAKOW_TERRAIN_ID);
    createWorld({ ...DEFAULT_WORLD_CONFIG, seed: 7, width: 800, height: 600 });
    const other = useSimStore.getState().snapshot;
    expect([other.world.width, other.world.height]).toEqual([800, 600]);
    expect(terrainTitle(other.terrain.id)).toBeNull();
  });

  it('builds polylines and polygons into path commands', () => {
    const line = recorder();
    appendPolyline(line, pts(0, 0));
    expect(line.ops).toEqual([]);
    appendPolyline(line, pts(0, 0, 10, 5));
    expect(line.ops).toEqual(['M0,0', 'L10,5']);
    const poly = recorder();
    appendPolygon(poly, pts(0, 0, 10, 0));
    expect(poly.ops).toEqual([]);
    appendPolygon(poly, pts(0, 0, 10, 0, 10, 10));
    expect(poly.ops).toEqual(['M0,0', 'L10,0', 'L10,10', 'Z']);
  });

  it('keeps street strokes and captions legible across zoom levels', () => {
    expect(labelsVisible(0.43)).toBe(true);
    expect(labelsVisible(0.1)).toBe(false);
    expect(streetWidth(0.1, 3.5, 1)).toBe(10); // zoomed out: at least 1 screen px
    expect(streetWidth(4, 3.5, 1)).toBe(3.5); // zoomed in: the street's real width
  });
});
