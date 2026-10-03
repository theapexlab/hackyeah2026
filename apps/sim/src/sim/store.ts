import {
  createEngine,
  DEFAULT_ENGINE_CONFIG,
  type SimEngine,
  type Snapshot,
  type WorldConfig,
} from '@pomoc/core';
import { create } from 'zustand';
import { attachEventFeed } from './eventFeed';

interface SimStore {
  engine: SimEngine | null;
  /** Config the current engine was built from (used by Reset). */
  world: WorldConfig | null;
  mobility: boolean;
  snapshot: Snapshot | null;
  /** Bumped on every createWorld so views can refit. */
  generation: number;
  lastTickAt: number;
  tickIntervalMs: number;
  createWorld: (world: WorldConfig, mobility?: boolean) => void;
  setTickIntervalMs: (ms: number) => void;
}

let detach: (() => void) | null = null;

export const useSimStore = create<SimStore>((set, get) => ({
  engine: null,
  world: null,
  mobility: false,
  snapshot: null,
  generation: 0,
  lastTickAt: 0,
  tickIntervalMs: 250,

  createWorld: (world, mobility = false) => {
    detach?.();
    const engine = createEngine(world, {
      mobility: { ...DEFAULT_ENGINE_CONFIG.mobility, enabled: mobility },
    });
    const offStore = engine.subscribe(() =>
      set({ snapshot: engine.getSnapshot(), lastTickAt: performance.now() }),
    );
    const offFeed = attachEventFeed(engine);
    detach = () => {
      offStore();
      offFeed();
    };
    set({
      engine,
      world,
      mobility,
      snapshot: engine.getSnapshot(),
      generation: get().generation + 1,
      lastTickAt: performance.now(),
    });
  },

  setTickIntervalMs: (tickIntervalMs) => set({ tickIntervalMs }),
}));
