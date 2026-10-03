import {
  createEngine,
  DEFAULT_WORLD_CONFIG,
  type SimEngine,
  type Snapshot,
  type WorldConfig,
} from '@pomoc/core';
import { create } from 'zustand';

export const DEFAULT_TICK_MS = 250;

export interface WorldOptions {
  /** Wall-clock milliseconds per tick at speed 1. */
  readonly tickMs: number;
  /** Random walk for mobiles. */
  readonly mobility: boolean;
}

export interface SimState {
  readonly engine: SimEngine;
  /** Latest engine snapshot; same reference until the engine steps or a command is dispatched. */
  readonly snapshot: Snapshot;
  readonly config: WorldConfig;
  readonly tickIntervalMs: number;
  /** performance.now() of the last tick advance (not of dispatches). */
  readonly lastTickAt: number;
  /** Increments on every new engine; the map refits when it changes. */
  readonly worldEpoch: number;
}

type SnapshotSource = (engine: SimEngine) => Snapshot;
const defaultSource: SnapshotSource = (engine) => engine.getSnapshot();
let snapshotSource: SnapshotSource = defaultSource;

/**
 * Dev-only seam: replace what the store reads from the engine (used by dev/fixture.ts).
 * Production never calls this; the default is engine.getSnapshot().
 */
export function setSnapshotSource(source: SnapshotSource | null): void {
  snapshotSource = source ?? defaultSource;
  useSimStore.setState((s) => ({ snapshot: snapshotSource(s.engine) }));
}

let unsubscribe: (() => void) | null = null;

function attach(engine: SimEngine): void {
  unsubscribe?.();
  unsubscribe = engine.subscribe(() => {
    const snapshot = snapshotSource(engine);
    useSimStore.setState((s) => ({
      snapshot,
      lastTickAt: snapshot.tick !== s.snapshot.tick ? performance.now() : s.lastTickAt,
    }));
  });
}

export const useSimStore = create<SimState>()(() => {
  const engine = createEngine(DEFAULT_WORLD_CONFIG);
  return {
    engine,
    snapshot: engine.getSnapshot(),
    config: DEFAULT_WORLD_CONFIG,
    tickIntervalMs: DEFAULT_TICK_MS,
    lastTickAt: performance.now(),
    worldEpoch: 0,
  };
});
attach(useSimStore.getState().engine);

/**
 * Replace the engine with a freshly generated world. The map refits via worldEpoch.
 * The engine config carries over from the live engine (SetMobility / SetConfig dispatched
 * since the last Generate are part of it), so Reset keeps what the switches show.
 */
export function createWorld(config: WorldConfig, options?: Partial<WorldOptions>): SimEngine {
  const prev = useSimStore.getState();
  const tickIntervalMs = options?.tickMs ?? prev.tickIntervalMs;
  const base = prev.engine.config;
  const mobility = options?.mobility ?? base.mobility.enabled;
  const engine = createEngine(config, {
    ...base,
    mobility: { ...base.mobility, enabled: mobility },
  });
  attach(engine);
  useSimStore.setState({
    engine,
    snapshot: snapshotSource(engine),
    config,
    tickIntervalMs,
    lastTickAt: performance.now(),
    worldEpoch: prev.worldEpoch + 1,
  });
  return engine;
}

/** Regenerate the current world with the same seed and options (deterministic replay). */
export function resetWorld(): SimEngine {
  return createWorld(useSimStore.getState().config);
}

/** Change the wall-clock tick length; playback restarts its interval if running. */
export function setTickInterval(tickMs: number): void {
  useSimStore.setState({ tickIntervalMs: Math.max(16, tickMs) });
}
