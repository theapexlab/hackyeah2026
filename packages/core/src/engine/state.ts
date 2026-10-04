import type { EngineConfig, WorldConfig } from '../domain/config';
import type { DropReason, SimEvent, TransitEvent } from '../domain/events';
import type { MessageId, NodeId } from '../domain/ids';
import type { Circle, Message } from '../domain/message';
import type { Mode } from '../domain/mode';
import { maxMode } from '../domain/mode';
import type { DeclaredLevel, Node } from '../domain/node';
import type { AuthorityReceipt, CommandLogEntry, EdgeView, TickResult } from '../domain/snapshot';
import type { Transaction } from '../domain/transaction';
import type { Components } from '../graph/components';
import { MetricsState } from '../metrics/metrics';
import { Prng } from '../prng';
import { resolveTerrain } from '../terrain/index';
import type { Terrain } from '../terrain/types';
import { assignTravellers } from './mobility';
import { generateWorld, sortNodes } from './world';

/** How many past ticks of transits getTransits(tick) can answer for. */
export const TRANSIT_RING_SIZE = 64;

/** Radio graph of the current instant plus the bookkeeping the snapshot needs. */
export interface AdjacencyState {
  neighbours: Map<NodeId, NodeId[]>;
  /** Sorted edges (a < b). Replaced, never mutated, so the snapshot can reuse it. */
  edges: EdgeView[];
  /** Bumps when `edges` changes content; monotonic across ResetWorld. */
  version: number;
  /** Something that affects liveness or positions changed; rebuild before use. */
  dirty: boolean;
}

/** What the virtual Authority has received (deduplicated by message id) and injected. */
export interface AuthorityState {
  received: AuthorityReceipt[];
  receivedIds: Set<MessageId>;
  injected: number;
}

/** A verified declaration the Authority issued; pruned when it expires. */
export interface ActiveDeclaration {
  readonly id: MessageId;
  readonly level: DeclaredLevel;
  readonly region: Circle | null;
  readonly fromTick: number;
  readonly untilTick: number;
}

/** One slot of the transit ring buffer. */
export interface TransitRingSlot {
  readonly tick: number;
  readonly transits: readonly TransitEvent[];
}

/**
 * Everything the engine mutates. Only engine/* touches it; the public surface is
 * SimEngine. Invariants:
 *  - `nodes` is sorted ascending by id and `byId` is built from it in that order;
 *  - `messages` / `messageList` / `transactions` are in creation (seq) order;
 *  - `tick` and the `seq` counters are monotonic for the life of the engine, across
 *    ResetWorld too, so replay() can line a command log up with it.
 */
export interface EngineState {
  /** The world config with the terrain's real width/height (seed 42: 2200 x 1300 m). */
  world: WorldConfig;
  /** Streets, parks and water of this world; replaced only when the world is rebuilt. */
  terrain: Terrain;
  /**
   * Generated worlds have street traffic (phones walking and driving); explicit node lists
   * keep every node where it was placed.
   */
  traffic: boolean;
  config: EngineConfig;
  prng: Prng;
  tick: number;
  cellsUp: boolean;
  gridUp: boolean;
  /** Fraction of mobiles taking part (SetParticipation); the rest count as powered off. */
  participation: number;
  /** Mobiles in a fixed shuffled order; the first round(participation * n) participate. */
  participationRank: Map<NodeId, number>;
  nodes: Node[];
  byId: Map<NodeId, Node>;
  messages: Map<MessageId, Message>;
  /** Same messages in creation order (snapshot.messages takes the tail). */
  messageList: Message[];
  /** Bumps whenever a message is created; monotonic across ResetWorld. */
  messagesVersion: number;
  transactions: Map<MessageId, Transaction>;
  declarations: ActiveDeclaration[];
  authority: AuthorityState;
  eventLog: SimEvent[];
  commandLog: CommandLogEntry[];
  transitRing: (TransitRingSlot | undefined)[];
  /** Transits produced between ticks (authority injection); the next runTick emits them. */
  pendingTransits: TransitEvent[];
  seq: { message: number; packet: number };
  adjacency: AdjacencyState;
  components: Components;
  metrics: MetricsState;
  lastTick: TickResult | null;
}

function emptyComponents(): Components {
  return { componentOf: new Map(), sizes: [], count: 0, backhaulComponents: new Set() };
}

/**
 * The terrain a world is built on. Generated worlds use resolveTerrain (Kraków for seed
 * 42); explicit node lists always get a procedural map of their own size, so hand-placed
 * test coordinates keep their meaning.
 */
function terrainFor(world: WorldConfig, nodes?: readonly Node[]): Terrain {
  return resolveTerrain(world, nodes === undefined ? {} : { procedural: true });
}

/**
 * (Re)populate the world part of the state from `world` (or an explicit node list).
 * Engine config, command log, tick and seq counters survive; everything else is fresh.
 * PRNG draw order: generateWorld's draws, then one shuffle of the mobile ids for the
 * participation order (drawn for explicit node lists too), then, for generated worlds
 * only, assignTravellers' draws (the first travellers, their speed and start).
 */
function populateWorld(state: EngineState, world: WorldConfig, nodes?: readonly Node[]): void {
  const terrain = terrainFor(world, nodes);
  const effective: WorldConfig = { ...world, width: terrain.width, height: terrain.height };
  const prng = new Prng(world.seed);
  const list = nodes === undefined ? generateWorld(effective, prng, terrain) : sortNodes(nodes);
  const mobileIds = list.filter((n) => n.kind === 'mobile').map((n) => n.id);
  const order = prng.shuffle(mobileIds);
  if (nodes === undefined) assignTravellers(list, terrain, prng, state.config);

  state.world = effective;
  state.terrain = terrain;
  state.traffic = nodes === undefined;
  state.prng = prng;
  state.cellsUp = true;
  state.gridUp = true;
  state.participation = 1;
  state.participationRank = new Map(order.map((id, i) => [id, i] as const));
  state.nodes = list;
  state.byId = new Map(list.map((n) => [n.id, n] as const));
  state.messages = new Map();
  state.messageList = [];
  state.messagesVersion += 1;
  state.transactions = new Map();
  state.declarations = [];
  state.authority = { received: [], receivedIds: new Set(), injected: 0 };
  state.eventLog = [];
  state.transitRing = new Array<TransitRingSlot | undefined>(TRANSIT_RING_SIZE).fill(undefined);
  state.pendingTransits = [];
  // A reset is a new edge set by definition (even when both are empty), so the version
  // bumps here and the snapshot cache never serves the previous world's edges.
  state.adjacency = {
    neighbours: new Map(),
    edges: [],
    version: state.adjacency.version + 1,
    dirty: true,
  };
  state.components = emptyComponents();
  state.metrics.reset();
  state.lastTick = null;
}

/** A fresh state at tick 0. Adjacency is dirty: the engine refreshes it before use. */
export function createState(
  world: WorldConfig,
  config: EngineConfig,
  nodes?: readonly Node[],
): EngineState {
  const state: EngineState = {
    world,
    terrain: terrainFor(world, nodes),
    traffic: false,
    config,
    prng: new Prng(world.seed),
    tick: 0,
    cellsUp: true,
    gridUp: true,
    participation: 1,
    participationRank: new Map(),
    nodes: [],
    byId: new Map(),
    messages: new Map(),
    messageList: [],
    messagesVersion: 0,
    transactions: new Map(),
    declarations: [],
    authority: { received: [], receivedIds: new Set(), injected: 0 },
    eventLog: [],
    commandLog: [],
    transitRing: [],
    pendingTransits: [],
    seq: { message: 0, packet: 0 },
    adjacency: { neighbours: new Map(), edges: [], version: 0, dirty: true },
    components: emptyComponents(),
    metrics: new MetricsState(),
    lastTick: null,
  };
  populateWorld(state, world, nodes);
  return state;
}

/** ResetWorld: a new world from `world.seed`, keeping config, command log, tick and seq. */
export function resetWorld(state: EngineState, world: WorldConfig, nodes?: readonly Node[]): void {
  populateWorld(state, world, nodes);
}

/** Append to the event log (the tick's TickResult picks up everything logged during it). */
export function logEvent(state: EngineState, event: SimEvent): void {
  state.eventLog.push(event);
}

/** DROPPED event plus the metrics counter, in one place. */
export function recordDrop(
  state: EngineState,
  nodeId: NodeId,
  msg: Message,
  reason: DropReason,
): void {
  logEvent(state, {
    type: 'DROPPED',
    tick: state.tick,
    msgId: msg.id,
    nodeId,
    class: msg.class,
    reason,
  });
  state.metrics.onDropped(msg.class, reason);
}

/** Next packet sequence number (global, monotonic): the total processing order. */
export function nextPacketSeq(state: EngineState): number {
  state.seq.packet += 1;
  return state.seq.packet;
}

/** Highest mode among alive nodes; PEACE when nothing is alive. */
export function globalMode(state: EngineState): Mode {
  let mode: Mode = 'PEACE';
  for (const node of state.nodes) {
    if (node.alive) mode = maxMode(mode, node.mode);
  }
  return mode;
}

/**
 * Remember a message id at a node, evicting the oldest ids beyond max(1, cap) (FIFO).
 * No-op when the id is already known.
 */
export function addSeen(node: Node, id: MessageId, cap: number): void {
  if (node.seen.has(id)) return;
  node.seen.add(id);
  node.seenOrder.push(id);
  // cap < 1 would evict the id just added (0: dedup never fires) or never terminate
  // (negative: length > cap is always true), so the effective cap is at least 1.
  const limit = cap >= 1 ? cap : 1;
  while (node.seenOrder.length > limit) {
    const oldest = node.seenOrder.shift();
    if (oldest !== undefined) node.seen.delete(oldest);
  }
}
