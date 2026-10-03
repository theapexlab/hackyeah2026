// Shared test builders. Reusable by later stages (engine tests): keep defaults sane and
// explicit so a test only states what matters for it.
import type { EngineConfig } from '../src/domain/config';
import { DEFAULT_ENGINE_CONFIG } from '../src/domain/config';
import { messageId, nodeId } from '../src/domain/ids';
import type { Message, Packet, Payload } from '../src/domain/message';
import { MODE_POLICIES } from '../src/domain/mode';
import type { Node, NodeKind } from '../src/domain/node';
import type { DecisionContext } from '../src/policies/forwarding';

/** A full Node with sane defaults: alive citizen mobile at the origin, PEACE, WAN up. */
export function makeNode(partial: Partial<Omit<Node, 'id'>> & { id?: string } = {}): Node {
  const { id, ...rest } = partial;
  return {
    id: nodeId(id ?? 'm-001'),
    kind: 'mobile',
    x: 0,
    y: 0,
    range: 60,
    credential: { kind: 'citizen' },
    backhaul: 'cellular',
    batteryBacked: false,
    poweredOverride: null,
    alive: true,
    wanUp: true,
    hasBackhaul: true,
    mode: 'PEACE',
    modeSource: 'local',
    declared: null,
    l1HoldUntilTick: 0,
    ticksWithoutWan: 0,
    ticksWithWan: 0,
    inbox: [],
    nextInbox: [],
    seen: new Set(),
    seenOrder: [],
    store: [],
    requestView: new Map(),
    neighbourIds: [],
    prevNeighbourIds: [],
    pendingOriginations: [],
    ...rest,
  };
}

/** n nodes of one kind on the x axis, `spacing` apart, ids zero-padded in order. */
export function lineNodes(
  n: number,
  spacing: number,
  overrides: Partial<Omit<Node, 'id' | 'x' | 'y'>> & { kind?: NodeKind } = {},
): Node[] {
  const prefix = overrides.kind === 'router' ? 'r' : overrides.kind === 'gateway' ? 'g' : 'm';
  return Array.from({ length: n }, (_, i) =>
    makeNode({
      ...overrides,
      id: `${prefix}-${String(i + 1).padStart(3, '0')}`,
      x: i * spacing,
      y: 0,
    }),
  );
}

/** A valid citizen BORROW request by m-001, created at tick 10, ttl 60, 3 hops. */
export function makeMessage(partial: Partial<Message> = {}): Message {
  const originId = partial.originId ?? nodeId('m-001');
  const payload: Payload = partial.payload ?? { kind: 'REQUEST', text: 'need a drill' };
  return {
    id: messageId(`${originId}#1`),
    seq: 1,
    class: 'BORROW',
    payload,
    originId,
    signer: { nodeId: originId, credentialKind: 'citizen', valid: true },
    createdTick: 10,
    ttlTicks: 60,
    hopLimit: 3,
    ...partial,
  };
}

/** A packet for `msg` arriving at hop 1 from the origin. */
export function makePacket(msg: Message, partial: Partial<Packet> = {}): Packet {
  return {
    msgId: msg.id,
    hop: 1,
    path: [msg.originId],
    lastHop: msg.originId,
    seq: 2,
    ...partial,
  };
}

/** Receiving node m-002 at the origin, PEACE policy, citizen, tick 10, nothing seen. */
export function makeContext(partial: Partial<DecisionContext> = {}): DecisionContext {
  return {
    tick: 10,
    policy: MODE_POLICIES.PEACE,
    nodeId: nodeId('m-002'),
    credentialKind: 'citizen',
    seen: new Set(),
    x: 0,
    y: 0,
    ...partial,
  };
}

/** Engine config with the plan's defaults, overridable. */
export function makeConfig(partial: Partial<EngineConfig> = {}): EngineConfig {
  return { ...DEFAULT_ENGINE_CONFIG, ...partial };
}

// ---------------------------------------------------------------------------------------
// Engine builders (stage 2). Worlds are explicit node lists so every test states its
// geometry; ranges are explicit per test (defaults are mobile 100, router 200, gateway 220).

import type { WorldConfig } from '../src/domain/config';
import type { SimEvent, SimEventType } from '../src/domain/events';
import type { Backhaul, CredentialKind } from '../src/domain/node';
import type { SimEngine } from '../src/engine/engine';
import { createEngineFromNodes } from '../src/engine/engine';

/** Citizen (or unregistered) mobile, range 60, cellular backhaul. */
export function mobile(
  id: string,
  x: number,
  y: number,
  credential: CredentialKind = 'citizen',
): Node {
  return makeNode({ id, kind: 'mobile', x, y, range: 60, credential: { kind: credential } });
}

/** ISP router, relay credential, range 120, no backhaul. */
export function router(id: string, x: number, y: number, batteryBacked = false): Node {
  return makeNode({
    id,
    kind: 'router',
    x,
    y,
    range: 120,
    credential: { kind: 'relay' },
    backhaul: 'none',
    batteryBacked,
  });
}

/** Gateway, relay credential, range 150. */
export function gateway(id: string, x: number, y: number, backhaul: Backhaul = 'satellite'): Node {
  return makeNode({
    id,
    kind: 'gateway',
    x,
    y,
    range: 150,
    credential: { kind: 'relay' },
    backhaul,
  });
}

/** An engine over explicit nodes; the area defaults to 1000 x 700 so clamping never bites. */
export function engineFrom(
  nodes: Node[],
  cfg: Partial<EngineConfig> = {},
  world: Partial<WorldConfig> = {},
): SimEngine {
  return createEngineFromNodes(nodes, cfg, { width: 1000, height: 700, ...world });
}

/** Events of one type from the whole log. */
export function eventsOf<T extends SimEventType>(
  engine: SimEngine,
  type: T,
): Extract<SimEvent, { type: T }>[] {
  return engine.getEventLog().filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

/** Step until `pred` holds (checked after each step); returns the tick. Throws past maxTicks. */
export function stepUntil(
  engine: SimEngine,
  pred: (e: SimEngine) => boolean,
  maxTicks = 200,
): number {
  for (let i = 0; i < maxTicks; i++) {
    engine.step();
    if (pred(engine)) return engine.tick;
  }
  throw new Error(`stepUntil: predicate not met within ${maxTicks} ticks`);
}

/** The id of the most recently created message (by the last ORIGINATED or DROPPED-at-origin). */
export function lastMessageId(engine: SimEngine): MessageIdType {
  const msgs = engine.getSnapshot().messages;
  const last = msgs[msgs.length - 1];
  if (last === undefined) throw new Error('no messages');
  return last.id;
}
type MessageIdType = ReturnType<typeof messageId>;
