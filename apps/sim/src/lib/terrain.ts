import { KRAKOW_SEED, KRAKOW_TERRAIN_ID } from '@pomoc/core';

/** True for the seed that loads the hand-traced Kraków map. */
export function isKrakowSeed(seed: number): boolean {
  return seed === KRAKOW_SEED;
}

/** Display names of hand-made maps by Terrain.id; procedural maps have none. */
const TERRAIN_TITLES: Readonly<Record<string, string>> = {
  [KRAKOW_TERRAIN_ID]: 'Kraków · Kazimierz',
};

export function terrainTitle(id: string): string | null {
  return TERRAIN_TITLES[id] ?? null;
}
