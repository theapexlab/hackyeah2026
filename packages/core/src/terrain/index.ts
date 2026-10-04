import type { WorldConfig } from '../domain/config';
import { distanceToPolygonBoundary, pointInPolygon, polygonCentroid } from './geometry';
import { buildStreetGraph } from './graph';
import { KRAKOW_SEED, krakowTerrainSource } from './krakow';
import { proceduralTerrain } from './procedural';
import type { Polygon, StreetGraph, Terrain, TerrainSource } from './types';

/** A street node this close (metres) to a park's outline (or inside it) is a gate into it. */
export const PARK_GATE_RADIUS_M = 20;

/** How many procedural terrains stay cached (the Kraków map is cached separately). */
const PROCEDURAL_CACHE_SIZE = 8;

/**
 * Gates per park: land graph nodes inside the park or within PARK_GATE_RADIUS_M of its
 * outline, ascending. A park with none is drawn but never visited.
 */
export function computeParkGates(
  graph: StreetGraph,
  parks: readonly Polygon[],
): readonly (readonly number[])[] {
  return parks.map((park) => {
    const gates: number[] = [];
    const c = polygonCentroid(park.pts);
    let reach = 0;
    for (const p of park.pts) reach = Math.max(reach, Math.hypot(p.x - c.x, p.y - c.y));
    graph.nodes.forEach((n, i) => {
      if (graph.inWater[i]) return;
      if (Math.hypot(n.x - c.x, n.y - c.y) > reach + PARK_GATE_RADIUS_M) return;
      if (
        pointInPolygon(n, park.pts) ||
        distanceToPolygonBoundary(n, park.pts) <= PARK_GATE_RADIUS_M
      ) {
        gates.push(i);
      }
    });
    return gates;
  });
}

/** Derive the street graph and park gates from map data. */
export function buildTerrain(source: TerrainSource): Terrain {
  const graph = buildStreetGraph(source.streets, source.water);
  return { ...source, graph, parkGates: computeParkGates(graph, source.parks) };
}

let krakow: Terrain | null = null;
const procedural = new Map<string, Terrain>();

/**
 * The map a world is built on: the hand-traced Kraków district for KRAKOW_SEED (its own
 * 2200 x 1300 m, whatever the config says), otherwise a procedural district of the
 * configured size. `procedural` forces the latter (explicit node lists use it so their
 * hand-placed coordinates keep their meaning). The same inputs return the same object.
 */
export function resolveTerrain(
  world: Pick<WorldConfig, 'seed' | 'width' | 'height'>,
  opts: { readonly procedural?: boolean } = {},
): Terrain {
  if (world.seed === KRAKOW_SEED && opts.procedural !== true) {
    krakow ??= buildTerrain(krakowTerrainSource());
    return krakow;
  }
  const width = Math.max(0, world.width);
  const height = Math.max(0, world.height);
  const key = `${world.seed}|${width}|${height}`;
  const cached = procedural.get(key);
  if (cached !== undefined) return cached;
  const terrain = buildTerrain(proceduralTerrain(world.seed, width, height));
  if (procedural.size >= PROCEDURAL_CACHE_SIZE) {
    const oldest = procedural.keys().next().value;
    if (oldest !== undefined) procedural.delete(oldest);
  }
  procedural.set(key, terrain);
  return terrain;
}
