import type { Circle } from '@pomoc/core';

export type RegionPreset = 'city' | 'west' | 'east' | 'around';

/**
 * Circle presets for the authority console. The core contract only supports circles, so the
 * west/east zones are two circles (radius 27 % of the width) that cover most of each half and
 * leave the far corners outside; a rectangular region type in core would make them exact halves.
 */
export function regionFor(
  preset: RegionPreset,
  world: { width: number; height: number },
  around?: { x: number; y: number },
): Circle | undefined {
  const r = world.width * 0.27;
  switch (preset) {
    case 'city':
      return undefined;
    case 'west':
      return { centerX: world.width / 4, centerY: world.height / 2, radiusMtres: r };
    case 'east':
      return { centerX: (world.width * 3) / 4, centerY: world.height / 2, radiusMtres: r };
    case 'around':
      return around ? { centerX: around.x, centerY: around.y, radiusMtres: 150 } : undefined;
  }
}
