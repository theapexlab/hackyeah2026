import type { NodeKind } from '../domain/node';
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

/** Rings searched around a forbidden router spot: every 5 m out to 400 m. */
const RING_STEP_M = 5;
const RING_MAX_M = 400;

/** A router may stand anywhere on the map except in the water or in a park. */
export function isRouterSpot(terrain: Terrain, p: Pt): boolean {
  return (
    p.x >= 0 &&
    p.y >= 0 &&
    p.x <= terrain.width &&
    p.y <= terrain.height &&
    !inWater(terrain, p) &&
    inPark(terrain, p) < 0
  );
}

/**
 * Where a router dropped at p ends up: p itself (clamped to the map) when it is allowed,
 * otherwise the first allowed point on rings of growing radius around it (5 m apart,
 * points every ~5 m, east first then counter-clockwise in screen terms), so the nearest
 * allowed spot to within a few metres. Deterministic, no randomness. Falls back to the
 * nearest land street when nothing within 400 m is allowed.
 */
export function nearestRouterSpot(terrain: Terrain, p: Pt): Pt {
  const start = {
    x: Math.min(terrain.width, Math.max(0, p.x)),
    y: Math.min(terrain.height, Math.max(0, p.y)),
  };
  if (isRouterSpot(terrain, start)) return start;
  for (let r = RING_STEP_M; r <= RING_MAX_M; r += RING_STEP_M) {
    const n = Math.max(8, Math.ceil((2 * Math.PI * r) / RING_STEP_M));
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      const q = { x: start.x + r * Math.cos(a), y: start.y + r * Math.sin(a) };
      if (isRouterSpot(terrain, q)) return q;
    }
  }
  return placeOnLand(terrain, start);
}

/**
 * Where a node of this kind ends up when dropped at p: routers anywhere but water and
 * parks (nearestRouterSpot); phones and gateways anywhere on land, a drop in the water
 * landing on the nearest land street (placeOnLand).
 */
export function placeNode(terrain: Terrain, kind: NodeKind, p: Pt): Pt {
  return kind === 'router' ? nearestRouterSpot(terrain, p) : placeOnLand(terrain, p);
}
