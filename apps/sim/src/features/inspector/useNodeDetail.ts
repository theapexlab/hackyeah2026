import type { NodeDetail, NodeId, Snapshot } from '@pomoc/core';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useSimStore } from '../../sim/store';

interface DetailCache {
  readonly id: NodeId | null;
  readonly snapshot: Snapshot | null;
  readonly detail: NodeDetail | null;
}

/**
 * engine.getNodeDetail(id), rebuilt once per sim store change while the inspector is open
 * (every tick and dispatch produces a new snapshot reference, and nothing else changes the
 * engine). Synchronous through useSyncExternalStore, so the first paint already has the
 * detail. Detail is not part of the snapshot by design.
 */
export function useNodeDetail(id: NodeId | null): NodeDetail | null {
  const cache = useRef<DetailCache>({ id: null, snapshot: null, detail: null });

  const getDetail = useCallback((): NodeDetail | null => {
    const { engine, snapshot } = useSimStore.getState();
    const current = cache.current;
    if (current.id !== id || current.snapshot !== snapshot) {
      cache.current = { id, snapshot, detail: id === null ? null : engine.getNodeDetail(id) };
    }
    return cache.current.detail;
  }, [id]);

  return useSyncExternalStore(useSimStore.subscribe, getDetail, getDetail);
}
