import type { Command } from '../domain/commands';
import type { EngineConfig, WorldConfig } from '../domain/config';
import { resolveEngineConfig, resolveWorldConfig } from '../domain/config';
import type { SimEvent, TransitEvent } from '../domain/events';
import type { NodeId } from '../domain/ids';
import type { Node, NodeDetail } from '../domain/node';
import type { CommandLogEntry, Snapshot, TickResult } from '../domain/snapshot';
import { applyCommand } from './commands';
import type { SnapshotCache } from './snapshot';
import { buildNodeDetail, buildSnapshot, createSnapshotCache } from './snapshot';
import type { EngineState } from './state';
import { createState, TRANSIT_RING_SIZE } from './state';
import { refreshTopology, runTick } from './tick';

/**
 * The simulation engine: a mutable world advanced by step(), driven by dispatch(),
 * observed through a cached immutable getSnapshot(). Deterministic for a given world
 * seed and command script (FR-SIM-05).
 */
export class SimEngine {
  private state: EngineState;
  private readonly listeners = new Set<() => void>();
  private readonly viewCache: SnapshotCache = createSnapshotCache();
  private snapshotCache: Snapshot | null = null;
  private readonly startWorld: WorldConfig;
  private readonly startConfig: EngineConfig;

  /**
   * `nodes` is an internal escape hatch (see createEngineFromNodes): an explicit node
   * list replaces generateWorld. The engine takes ownership of those objects.
   */
  constructor(world: Partial<WorldConfig>, cfg?: Partial<EngineConfig>, nodes?: readonly Node[]) {
    this.startWorld = resolveWorldConfig(world);
    this.startConfig = resolveEngineConfig(cfg);
    this.state = createState(this.startWorld, this.startConfig, nodes);
    refreshTopology(this.state);
  }

  /**
   * Rebuild an engine from its INITIAL world/config and command log up to `untilTick`
   * (deterministic time travel). Pass `engine.initialWorld` / `engine.initialConfig`, not
   * `engine.world`: a ResetWorld or SetConfig in the log is replayed from there.
   */
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

  /** The current world config (changes with ResetWorld). */
  get world(): WorldConfig {
    return this.state.world;
  }

  /** The current engine config (changes with SetConfig / SetMobility). */
  get config(): EngineConfig {
    return this.state.config;
  }

  /**
   * The world config this engine was constructed with; what replay() must start from.
   * A ResetWorld in the command log replays from here and the message/packet seq
   * counters that survive it only line up when the pre-reset run is identical.
   */
  get initialWorld(): WorldConfig {
    return this.startWorld;
  }

  /** The engine config this engine was constructed with (SetConfig/SetMobility replay over it). */
  get initialConfig(): EngineConfig {
    return this.startConfig;
  }

  /** Current tick (0 before the first step; never reset by ResetWorld). */
  get tick(): number {
    return this.state.tick;
  }

  /** Advance the world by n ticks; returns the last tick's result and notifies once. */
  step(n = 1): TickResult {
    let result: TickResult = this.state.lastTick ?? {
      tick: this.state.tick,
      transits: [],
      events: [],
    };
    for (let i = 0; i < n; i++) result = runTick(this.state);
    this.invalidate();
    return result;
  }

  /** Apply a command immediately and record it for replay. */
  dispatch(command: Command): void {
    applyCommand(this.state, command);
    this.invalidate();
  }

  /** Cached immutable view; same reference until the next step() or dispatch(). */
  getSnapshot(): Snapshot {
    if (this.snapshotCache === null) {
      this.snapshotCache = buildSnapshot(this.state, this.viewCache);
    }
    return this.snapshotCache;
  }

  /** Listener fires after every step() and dispatch(). Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** On-demand inspector detail for one node (built on every call; not cached). */
  getNodeDetail(id: NodeId): NodeDetail {
    return buildNodeDetail(this.state, id);
  }

  /**
   * The event log, oldest first. FIFO-capped at config.eventLogCap (trimmed at the start
   * and end of every tick; Number.POSITIVE_INFINITY keeps everything). TickResult.events
   * and Snapshot.recentEvents are unaffected by the trim.
   */
  getEventLog(): readonly SimEvent[] {
    return this.state.eventLog;
  }

  getCommandLog(): readonly CommandLogEntry[] {
    return this.state.commandLog;
  }

  /** Transits of a past tick (ring buffer of the last 64 ticks); empty when out of range. */
  getTransits(tick: number): readonly TransitEvent[] {
    const slot = this.state.transitRing[tick % TRANSIT_RING_SIZE];
    return slot !== undefined && slot.tick === tick ? slot.transits : [];
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

/**
 * Build an engine around a hand-made node list instead of a generated world (tests,
 * custom layouts). Nodes are sorted by id and owned by the engine; `world` supplies the
 * area and seed (defaults otherwise). replay() cannot rebuild such an engine, and
 * ResetWorld on it generates a world from its config.
 */
export function createEngineFromNodes(
  nodes: readonly Node[],
  cfg?: Partial<EngineConfig>,
  world?: Partial<WorldConfig>,
): SimEngine {
  return new SimEngine(world ?? {}, cfg, nodes);
}
