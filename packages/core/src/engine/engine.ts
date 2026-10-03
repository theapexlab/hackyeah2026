import type { Command } from '../domain/commands';
import type { EngineConfig, WorldConfig } from '../domain/config';
import { resolveEngineConfig, resolveWorldConfig } from '../domain/config';
import type { SimEvent, TransitEvent } from '../domain/events';
import type { NodeId } from '../domain/ids';
import type { NodeDetail } from '../domain/node';
import type { CommandLogEntry, Snapshot, TickResult } from '../domain/snapshot';
import { emptyMetrics } from '../domain/snapshot';

// TODO(engine): implemented in Phase 2. This stub keeps the public contract typecheckable
// and lets the UI render an empty world. Only replay() is final: it depends solely on the
// public API and is identical for the real engine.

/**
 * The simulation engine: a mutable world advanced by step(), driven by dispatch(),
 * observed through a cached immutable getSnapshot().
 */
export class SimEngine {
  readonly world: WorldConfig;
  readonly config: EngineConfig;

  private tickValue = 0;
  private readonly listeners = new Set<() => void>();
  private readonly commandLog: CommandLogEntry[] = [];
  private snapshotCache: Snapshot | null = null;

  constructor(world: Partial<WorldConfig>, cfg?: Partial<EngineConfig>) {
    this.world = resolveWorldConfig(world);
    this.config = resolveEngineConfig(cfg);
  }

  /** Rebuild an engine from its seed and command log up to `untilTick` (deterministic time travel). */
  static replay(
    world: Partial<WorldConfig>,
    commandLog: readonly CommandLogEntry[],
    untilTick: number,
    cfg?: Partial<EngineConfig>,
  ): SimEngine {
    const engine = new SimEngine(world, cfg);
    for (const entry of commandLog) {
      if (entry.tick > untilTick) break;
      while (engine.tick < entry.tick) engine.step();
      engine.dispatch(entry.command);
    }
    while (engine.tick < untilTick) engine.step();
    return engine;
  }

  /** Current tick (0 before the first step). */
  get tick(): number {
    return this.tickValue;
  }

  /** Advance the world by n ticks and return the last tick's result. */
  step(n = 1): TickResult {
    let result: TickResult = { tick: this.tickValue, transits: [], events: [] };
    for (let i = 0; i < n; i++) {
      this.tickValue += 1;
      result = { tick: this.tickValue, transits: [], events: [] };
    }
    this.invalidate();
    return result;
  }

  /** Apply a command immediately and record it for replay. */
  dispatch(command: Command): void {
    this.commandLog.push({ tick: this.tickValue, command });
    this.invalidate();
  }

  /** Cached immutable view; same reference until the next step() or dispatch(). */
  getSnapshot(): Snapshot {
    if (this.snapshotCache) return this.snapshotCache;
    const snapshot: Snapshot = {
      tick: this.tickValue,
      world: {
        seed: this.world.seed,
        width: this.world.width,
        height: this.world.height,
        cellsUp: true,
        gridUp: true,
        mobility: this.config.mobility.enabled,
        nodeCount: 0,
      },
      globalMode: 'PEACE',
      nodes: [],
      edges: [],
      transits: [],
      messages: [],
      transactions: [],
      declarations: [],
      authority: { received: [], injected: 0 },
      metrics: emptyMetrics(),
      recentEvents: [],
    };
    this.snapshotCache = snapshot;
    return snapshot;
  }

  /** Listener fires after every step() and dispatch(). Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** On-demand inspector detail for one node. */
  getNodeDetail(id: NodeId): NodeDetail {
    return { id, inbox: [], store: [], requests: [], seenCount: 0, log: [] };
  }

  getEventLog(): readonly SimEvent[] {
    return [];
  }

  getCommandLog(): readonly CommandLogEntry[] {
    return this.commandLog;
  }

  /** Transits of a past tick (ring buffer of the last 64 ticks). */
  getTransits(_tick: number): readonly TransitEvent[] {
    return [];
  }

  private invalidate(): void {
    this.snapshotCache = null;
    for (const listener of this.listeners) listener();
  }
}

/** Convenience factory. */
export function createEngine(world: Partial<WorldConfig>, cfg?: Partial<EngineConfig>): SimEngine {
  return new SimEngine(world, cfg);
}
