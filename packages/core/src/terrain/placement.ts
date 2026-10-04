import { distanceToPolygonBoundary, pointInPolygon } from './geometry';
import { nearestPointOnGraph } from './graph';
import type { Pt, Terrain } from './types';

/** A point this close (metres) to a street centreline counts as on the street. */
export const STREET_TOLERANCE_M = 6;

export function inWater(terrain: Terrain, p: Pt): boolean {
  for (const w of terrain.water) if (pointInPolygon(p, w.pts)) return true;
  return false;
}

/** Index of the park containing p, or -1. */
export function inPark(terrain: Terrain, p: Pt): number {
  for (let i = 0; i < terrain.parks.length; i++) {
    if (pointInPolygon(p, terrain.parks[i]!.pts)) return i;
  }
  return -1;
}

/** Distance to the nearest street centreline (Infinity without streets). */
export function distanceToStreets(terrain: Terrain, p: Pt): number {
  return nearestPointOnGraph(terrain.graph, p)?.distance ?? Number.POSITIVE_INFINITY;
}

/** Distance to the nearest park (0 inside one; Infinity without parks). */
export function distanceToParks(terrain: Terrain, p: Pt): number {
  let best = Number.POSITIVE_INFINITY;
  for (const park of terrain.parks) {
    if (pointInPolygon(p, park.pts)) return 0;
    best = Math.min(best, distanceToPolygonBoundary(p, park.pts));
  }
  return best;
}

/** A node may stand here: on land, or on a street (a bridge over the water). */
export function isPlaceable(terrain: Terrain, p: Pt): boolean {
  return !inWater(terrain, p) || distanceToStreets(terrain, p) <= STREET_TOLERANCE_M;
}

/**
 * Where a node dropped at p ends up: p itself on land, otherwise the nearest point of a
 * land street (p again when the map has none).
 */
export function placeOnLand(terrain: Terrain, p: Pt): Pt {
  if (!inWater(terrain, p)) return p;
  const q = nearestPointOnGraph(terrain.graph, p, { land: true });
  return q === null ? p : { x: q.x, y: q.y };
}
