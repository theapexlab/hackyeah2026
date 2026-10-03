import {
  createEngine,
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_WORLD_CONFIG,
  type EngineConfig,
  type SimEngine,
  type Snapshot,
  type WorldConfig,
} from '@pomoc/core';
import { create } from 'zustand';

interface SimStore {
  engine: SimEngine | null;
  snapshot: Snapshot | null;
  lastTickAt: number;
  tickIntervalMs: number;
  createWorld: (config: WorldConfig, engineConfig?: Partial<EngineConfig>) => void;
  setTickIntervalMs: (ms: number) => void;
}

export const useSimStore = create<SimStore>((set) => ({
  engine: null,
  snapshot: null,
  lastTickAt: Date.now(),
  tickIntervalMs: 250,

  createWorld: (config: WorldConfig, engineConfig?: Partial<EngineConfig>) => {
    const engine = createEngine(config, { ...DEFAULT_ENGINE_CONFIG, ...engineConfig });
    const snapshot = engine.getSnapshot();
    const unsubscribe = engine.subscribe(() => {
      set((state) => ({
        snapshot: state.engine?.getSnapshot() ?? null,
        lastTickAt: Date.now(),
      }));
    });

    set({
      engine,
      snapshot,
      lastTickAt: Date.now(),
    });

    return () => unsubscribe();
  },

  setTickIntervalMs: (ms: number) => {
    set({ tickIntervalMs: ms });
  },
}));

// Selector hooks
export const useEngine = () => useSimStore((s) => s.engine);
export const useSnapshot = () => useSimStore((s) => s.snapshot);
export const useLastTickAt = () => useSimStore((s) => s.lastTickAt);
export const useTickIntervalMs = () => useSimStore((s) => s.tickIntervalMs);
