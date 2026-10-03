/**
 * Test helpers: world builders (explicit positions via MOVE_NODE) and simulation utilities.
 */

import type { EngineConfig, WorldConfig } from '../src/domain/config';
import type { SimEvent, TransitEvent } from '../src/domain/events';
import { type MessageId, type NodeId, nodeIdFromString } from '../src/domain/ids';
import type { CredentialKind } from '../src/domain/mode';
import type { Node } from '../src/domain/node';
import { createEngine, type SimEngine } from '../src/engine/engine';

export const m = (i: number): NodeId => nodeIdFromString(`m-${String(i).padStart(3, '0')}`);
export const r = (i: number): NodeId => nodeIdFromString(`r-${String(i).padStart(3, '0')}`);
export const g = (i: number): NodeId => nodeIdFromString(`g-${String(i).padStart(3, '0')}`);

export function baseWorld(over: Partial<WorldConfig> = {}): WorldConfig {
  return {
    seed: 42,
    width: 2000,
    height: 2000,
    mobiles: 0,
    routers: 0,
    gateways: 0,
    range: { mobile: 150, router: 150, gateway: 150 },
    unregisteredFraction: 0,
    batteryBackedRouterFraction: 0,
    gatewayBackhaul: 'satellite',
    ...over,
  };
}

/** Create an engine and pin nodes to explicit positions. */
export function layout(
  world: WorldConfig,
  positions: Record<string, [number, number]>,
  cfg?: Partial<EngineConfig>,
): SimEngine {
  const engine = createEngine(world, cfg);
  for (const [id, [x, y]] of Object.entries(positions)) {
    engine.dispatch({ type: 'MOVE_NODE', nodeId: nodeIdFromString(id), x, y });
  }
  return engine;
}

/** n mobiles on a horizontal line; only direct neighbours are in range. */
export function lineWorld(
  n: number,
  spacing = 100,
  cfg?: Partial<EngineConfig>,
  over: Partial<WorldConfig> = {},
): SimEngine {
  const positions: Record<string, [number, number]> = {};
  for (let i = 0; i < n; i++) positions[m(i)] = [50 + i * spacing, 100];
  return layout(
    baseWorld({
      width: n * spacing + 100,
      height: 200,
      mobiles: n,
      range: { mobile: spacing * 1.5, router: 200, gateway: 200 },
      ...over,
    }),
    positions,
    cfg,
  );
}

/** Three mobiles at the vertices of an equilateral triangle, all mutually in range. */
export function triangleWorld(cfg?: Partial<EngineConfig>): SimEngine {
  return layout(
    baseWorld({ mobiles: 3, range: { mobile: 200, router: 200, gateway: 200 } }),
    { [m(0)]: [100, 100], [m(1)]: [200, 100], [m(2)]: [150, 187] },
    cfg,
  );
}

/**
 * Island A: m-000..m-002 + router r-000 (x ~ 100). Island B: m-003..m-005 + satellite gateway
 * g-000 (x ~ 900). 740 m gap between them.
 */
export function twoIslandsWorld(cfg?: Partial<EngineConfig>): SimEngine {
  return layout(
    baseWorld({
      mobiles: 6,
      routers: 1,
      gateways: 1,
      range: { mobile: 100, router: 150, gateway: 150 },
    }),
    {
      [m(0)]: [100, 100],
      [m(1)]: [160, 100],
      [m(2)]: [130, 150],
      [r(0)]: [130, 100],
      [m(3)]: [900, 100],
      [m(4)]: [960, 100],
      [m(5)]: [930, 150],
      [g(0)]: [930, 100],
    },
    cfg,
  );
}

export function runUntil(
  engine: SimEngine,
  predicate: (engine: SimEngine) => boolean,
  maxTicks = 1000,
): number {
  for (let i = 0; i < maxTicks; i++) {
    if (predicate(engine)) return i;
    engine.step(1);
  }
  return maxTicks;
}

export function eventsOf<T extends SimEvent['type']>(
  engine: SimEngine,
  type: T,
): Array<Extract<SimEvent, { type: T }>> {
  return engine.getEventLog().filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

export const drops = (engine: SimEngine, reason?: string, msgId?: MessageId) =>
  eventsOf(engine, 'DROPPED').filter(
    (e) => (!reason || e.reason === reason) && (!msgId || e.msgId === msgId),
  );

export const delivered = (engine: SimEngine, msgId: MessageId) =>
  eventsOf(engine, 'DELIVERED').filter((e) => e.msgId === msgId);

/** Id of the n-th (0-based) ORIGINATED message. */
export const originatedId = (engine: SimEngine, n = 0): MessageId =>
  eventsOf(engine, 'ORIGINATED')[n]!.msgId;

/** Step n ticks one at a time, collecting all transits. */
export function stepCollect(engine: SimEngine, n: number): TransitEvent[] {
  const all: TransitEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...engine.step(1).transits);
  return all;
}

export const modeOf = (engine: SimEngine, id: NodeId) =>
  engine.getSnapshot().nodes.find((n) => n.id === id)!.mode;

type Internals = { state: { nodes: Map<NodeId, Node> } };

/** Test-only: mutate a node credential (the engine has no command for this). */
export function setCredential(engine: SimEngine, id: NodeId, kind: CredentialKind): void {
  (engine as unknown as Internals).state.nodes.get(id)!.credential.kind = kind;
}

/** Test-only: a fully populated Node for pure policy tests. */
export function fakeNode(over: Partial<Node> = {}): Node {
  return {
    id: m(1),
    kind: 'mobile',
    x: 0,
    y: 0,
    range: 100,
    credential: { kind: 'citizen' },
    backhaul: 'cellular',
    batteryBacked: false,
    poweredOverride: null,
    participating: true,
    alive: true,
    wanUp: true,
    hasBackhaul: false,
    mode: 'PEACE',
    modeSource: 'local',
    declared: null,
    l1HoldUntilTick: 0,
    ticksWithoutWan: 0,
    ticksWithWan: 0,
    inbox: [],
    nextInbox: [],
    seen: new Set(),
    store: [],
    requestView: new Map(),
    pendingOriginations: [],
    neighbourIds: [],
    ...over,
  };
}
