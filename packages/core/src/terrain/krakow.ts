import {
  KRAKOW_MAJOR,
  KRAKOW_MINOR,
  KRAKOW_NAMED_MINOR,
  KRAKOW_PARKS,
  KRAKOW_WATER,
} from './krakowData';
import type { Polyline, Pt, TerrainLabel, TerrainSource } from './types';

/** The seed that loads the hand-traced Kraków map instead of a procedural one. */
export const KRAKOW_SEED = 42;
export const KRAKOW_TERRAIN_ID = 'krakow-kazimierz';
/** Map size in metres (the traced screenshot covers about 2.2 x 1.3 km). */
export const KRAKOW_WIDTH = 2200;
export const KRAKOW_HEIGHT = 1300;

/** Size of the traced screenshot in pixels; krakowData coordinates are in this space. */
const SOURCE_WIDTH = 2000;
const SOURCE_HEIGHT = 1235;
const SX = KRAKOW_WIDTH / SOURCE_WIDTH;
const SY = KRAKOW_HEIGHT / SOURCE_HEIGHT;

const round2 = (v: number): number => Math.round(v * 100) / 100;

function toMetres(x: number, y: number): Pt {
  return { x: round2(x * SX), y: round2(y * SY) };
}

/** "x,y x,y ..." in screenshot pixels to points in metres. */
function decode(encoded: string): Pt[] {
  return encoded.split(' ').map((pair) => {
    const [x, y] = pair.split(',');
    return toMetres(Number(x), Number(y));
  });
}

/** District and river captions, in screenshot pixels. */
const LABELS: readonly (readonly [string, number, number, TerrainLabel['kind']])[] = [
  ['Kazimierz', 983, 710, 'district'],
  ['Stradom', 722, 313, 'district'],
  ['Stare Podgórze', 1123, 1140, 'district'],
  ['Grzegórzki', 1583, 176, 'district'],
  ['Wawel', 440, 232, 'district'],
  ['Dębniki', 110, 880, 'district'],
  ['Zabłocie', 1820, 690, 'district'],
  ['Wisła', 660, 1032, 'water'],
  ['Wisła', 1570, 560, 'water'],
];

/**
 * Kraków's Kazimierz, Stradom and Stare Podgórze around the Vistula bend, traced from a
 * 2000 x 1235 px map screenshot and scaled to 2200 x 1300 m. Pure data, no randomness.
 */
export function krakowTerrainSource(): TerrainSource {
  const streets: Polyline[] = [
    ...KRAKOW_MAJOR.map(([name, pts]) => ({ pts: decode(pts), major: true, name })),
    ...KRAKOW_NAMED_MINOR.map(([name, pts]) => ({ pts: decode(pts), major: false, name })),
    ...KRAKOW_MINOR.map((pts) => ({ pts: decode(pts), major: false })),
  ];
  return {
    id: KRAKOW_TERRAIN_ID,
    width: KRAKOW_WIDTH,
    height: KRAKOW_HEIGHT,
    streets,
    parks: KRAKOW_PARKS.map((pts) => ({ pts: decode(pts) })),
    water: KRAKOW_WATER.map((pts) => ({ pts: decode(pts), name: 'Wisła' })),
    labels: LABELS.map(([text, x, y, kind]) => ({ ...toMetres(x, y), text, kind })),
  };
}
