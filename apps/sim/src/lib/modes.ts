import type { Mode } from '@pomoc/core';
import { MODE_ORDER } from '../theme/tokens';

/** Mode held by most alive nodes; ties go to the more severe mode. */
export function dominantMode(counts: Record<Mode, number>): Mode {
  return MODE_ORDER.reduce<Mode>((best, m) => (counts[m] >= counts[best] ? m : best), 'PEACE');
}
