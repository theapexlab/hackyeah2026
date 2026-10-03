import type { Circle } from '@pomoc/core';

/** Region presets offered by the Authority console. */
export type RegionPreset = 'city' | 'west' | 'east' | 'around';

export const REGION_LABEL: Readonly<Record<RegionPreset, string>> = {
  city: 'Whole city',
  west: 'West half',
  east: 'East half',
  around: 'Around a node',
};

/** Radius of the "around a node" preset in metres. */
export const AROUND_RADIUS = 250;

export interface WorldSize {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Circle for a preset, or undefined for the whole city (an engine command without a region).
 * Halves are approximated by a circle centred on the half, large enough to cover its middle
 * band; corners spill a little, which is fine on stage.
 */
export function regionFor(
  preset: RegionPreset,
  world: WorldSize,
  around?: Point | null,
): Circle | undefined {
  switch (preset) {
    case 'city':
      return undefined;
    case 'west':
      return { x: world.width / 4, y: world.height / 2, r: halfRadius(world) };
    case 'east':
      return { x: (world.width * 3) / 4, y: world.height / 2, r: halfRadius(world) };
    case 'around':
      return around ? { x: around.x, y: around.y, r: AROUND_RADIUS } : undefined;
  }
}

function halfRadius(world: WorldSize): number {
  return Math.max(world.width / 4, world.height / 2);
}

/** 'x 250, y 350, r 250' for badges and log lines. */
export function formatRegion(region: Circle | null | undefined): string {
  if (!region) return 'whole city';
  return `(${Math.round(region.x)}, ${Math.round(region.y)}) r ${Math.round(region.r)} m`;
}
