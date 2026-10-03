import type { Mode, NodeDetail, NodeView, Snapshot } from '@pomoc/core';
import { nodeIdFromString } from '@pomoc/core';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSimStore } from './store';

// Stable fallbacks: a selector returning a fresh `[]` each call breaks useSyncExternalStore.
const NO_NODES: NodeView[] = [];
const NO_EVENTS: Snapshot['recentEvents'] = [];

export const useSimNodes = () => useSimStore((s) => s.snapshot?.nodes ?? NO_NODES);
export const useSimMetrics = () => useSimStore((s) => s.snapshot?.metrics);
export const useSimTick = () => useSimStore((s) => s.snapshot?.tick ?? 0);
export const useSimRecentEvents = () => useSimStore((s) => s.snapshot?.recentEvents ?? NO_EVENTS);
export const useSimDeclarations = () => useSimStore((s) => s.snapshot?.declarations);
export const useSimUplinks = () => useSimStore((s) => s.snapshot?.authority.received);
export const useCellsUp = () => useSimStore((s) => s.snapshot?.world.cellsUp ?? true);
export const useGridUp = () => useSimStore((s) => s.snapshot?.world.gridUp ?? true);

export const useWorldSize = () =>
  useSimStore(
    useShallow((s) => ({
      width: s.snapshot?.world.width ?? 0,
      height: s.snapshot?.world.height ?? 0,
    })),
  );

export const useNodeView = (id: string | null): NodeView | undefined =>
  useSimStore((s) => (id ? s.snapshot?.nodes.find((n) => n.id === id) : undefined));

export type ModeCounts = Record<Mode, number>;

/** Alive nodes per mode; shallow-compared so ticks without mode changes do not re-render. */
export const useModeCounts = (): ModeCounts =>
  useSimStore(
    useShallow((s) => {
      const counts: ModeCounts = { PEACE: 0, L1: 0, L2: 0, L3: 0 };
      for (const n of s.snapshot?.nodes ?? NO_NODES) if (n.alive) counts[n.mode]++;
      return counts;
    }),
  );

/** Inspector detail, recomputed once per tick (not part of the snapshot). */
export function useNodeDetail(id: string | null): NodeDetail | null {
  const engine = useSimStore((s) => s.engine);
  const tick = useSimStore((s) => s.snapshot?.tick ?? 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the refresh trigger
  return useMemo(() => {
    if (!engine || !id) return null;
    try {
      return engine.getNodeDetail(nodeIdFromString(id));
    } catch {
      return null;
    }
  }, [engine, id, tick]);
}
