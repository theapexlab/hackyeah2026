import { describe, expect, it } from 'vitest';
import { resolveTerrain } from '../../src/terrain/index';
import { KRAKOW_HEIGHT, KRAKOW_SEED, KRAKOW_WIDTH } from '../../src/terrain/krakow';
import {
  distanceToStreets,
  inPark,
  inWater,
  isRouterSpot,
  nearestRouterSpot,
  placeNode,
  STREET_TOLERANCE_M,
} from '../../src/terrain/placement';

const t = resolveTerrain({ seed: KRAKOW_SEED, width: KRAKOW_WIDTH, height: KRAKOW_HEIGHT });
/** Screenshot pixels to metres, like krakow.ts. */
const px = (x: number, y: number) => ({ x: x * 1.1, y: y * (1300 / 1235) });

describe('where nodes may stand', () => {
  const river = px(700, 1040);
  const park = px(520, 470);
  const block = px(980, 560); // inside Kazimierz, between streets

  it('routers: anywhere on the map except the river and the parks', () => {
    expect(isRouterSpot(t, block)).toBe(true);
    expect(isRouterSpot(t, river)).toBe(false);
    expect(isRouterSpot(t, park)).toBe(false);
    expect(isRouterSpot(t, { x: -5, y: 10 })).toBe(false);
  });

  it('nearestRouterSpot leaves allowed spots alone and moves the rest a short way', () => {
    expect(nearestRouterSpot(t, block)).toEqual(block);
    for (const p of [river, park]) {
      const q = nearestRouterSpot(t, p);
      expect(isRouterSpot(t, q)).toBe(true);
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThan(150);
      expect(nearestRouterSpot(t, p)).toEqual(q); // deterministic
    }
    expect(nearestRouterSpot(t, { x: -50, y: -50 })).toEqual({ x: 0, y: 0 });
  });

  it('placeNode: routers avoid parks and water, phones and gateways only avoid water', () => {
    expect(inPark(t, placeNode(t, 'router', park))).toBe(-1);
    expect(placeNode(t, 'mobile', park)).toEqual(park);
    expect(placeNode(t, 'gateway', block)).toEqual(block);
    for (const kind of ['mobile', 'gateway'] as const) {
      const q = placeNode(t, kind, river);
      expect(inWater(t, q)).toBe(false);
      expect(distanceToStreets(t, q)).toBeLessThanOrEqual(STREET_TOLERANCE_M);
    }
  });
});
