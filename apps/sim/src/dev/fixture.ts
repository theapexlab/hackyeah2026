/**
 * DEV ONLY. Fabricates a plausible Snapshot so the map can be checked while the engine
 * is a stub. Loaded lazily by main.tsx when import.meta.env.DEV && ?fixture=1.
 * Uses contract types only; never imported by production code paths.
 */
import {
  AUTHORITY_ID,
  type EdgeQuality,
  type EdgeView,
  emptyMetrics,
  formatNodeId,
  type MessageView,
  type Mode,
  makeMessageId,
  type NodeId,
  type NodeView,
  Prng,
  resolveTerrain,
  type SimEvent,
  type Snapshot,
  type TransitEvent,
} from '@pomoc/core';
import { setSnapshotSource } from '../sim/store';

const WIDTH = 1000;
const HEIGHT = 700;
/** A procedural map of the fixture's size (seed 7), one object for every fabricated snapshot. */
const TERRAIN = resolveTerrain({ seed: 7, width: WIDTH, height: HEIGHT });
const RANGE = { mobile: 100, router: 200, gateway: 220 } as const;
const L2_REGION = { x: 760, y: 340, r: 190 } as const;

function inRegion(x: number, y: number): boolean {
  const dx = x - L2_REGION.x;
  const dy = y - L2_REGION.y;
  return dx * dx + dy * dy <= L2_REGION.r * L2_REGION.r;
}

interface Draft {
  id: NodeId;
  kind: NodeView['kind'];
  x: number;
  y: number;
  range: number;
  credentialKind: NodeView['credentialKind'];
  backhaul: NodeView['backhaul'];
  batteryBacked: boolean;
  alive: boolean;
  storeSize: number;
}

function draftNodes(prng: Prng): Draft[] {
  const out: Draft[] = [];
  for (let i = 0; i < 40; i++) {
    out.push({
      id: formatNodeId('mobile', i + 1),
      kind: 'mobile',
      x: Math.round(prng.float(30, WIDTH - 30)),
      y: Math.round(prng.float(30, HEIGHT - 30)),
      range: RANGE.mobile,
      credentialKind: i % 10 === 4 ? 'none' : 'citizen',
      backhaul: 'cellular',
      batteryBacked: false,
      alive: true,
      storeSize: 0,
    });
  }
  let r = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      r += 1;
      out.push({
        id: formatNodeId('router', r),
        kind: 'router',
        x: Math.round(((col + 0.5) * WIDTH) / 6 + prng.float(-40, 40)),
        y: Math.round(((row + 0.5) * HEIGHT) / 3 + prng.float(-40, 40)),
        range: RANGE.router,
        credentialKind: 'relay',
        backhaul: 'fibre',
        batteryBacked: r % 5 === 0,
        alive: r % 7 !== 3,
        storeSize: 0,
      });
    }
  }
  out.push({
    id: formatNodeId('gateway', 1),
    kind: 'gateway',
    x: 150,
    y: 360,
    range: RANGE.gateway,
    credentialKind: 'relay',
    backhaul: 'satellite',
    batteryBacked: true,
    alive: true,
    storeSize: 0,
  });
  out.push({
    id: formatNodeId('gateway', 2),
    kind: 'gateway',
    x: 850,
    y: 340,
    range: RANGE.gateway,
    credentialKind: 'relay',
    backhaul: 'satellite',
    batteryBacked: true,
    alive: true,
    storeSize: 0,
  });
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function buildEdges(nodes: readonly Draft[]): EdgeView[] {
  const edges: EdgeView[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    if (!a?.alive) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      if (!b?.alive) continue;
      const limit = Math.min(a.range, b.range);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > limit) continue;
      const third = d / limit;
      const quality: EdgeQuality = third < 1 / 3 ? 'near' : third < 2 / 3 ? 'medium' : 'far';
      edges.push({ a: a.id, b: b.id, quality });
    }
  }
  return edges;
}

function components(nodes: readonly Draft[], edges: readonly EdgeView[]): Map<NodeId, number> {
  const parent = new Map<NodeId, NodeId>();
  const find = (id: NodeId): NodeId => {
    let cur = id;
    while (true) {
      const p = parent.get(cur);
      if (p === undefined || p === cur) return cur;
      cur = p;
    }
  };
  for (const n of nodes) parent.set(n.id, n.id);
  for (const e of edges) parent.set(find(e.a), find(e.b));
  const ids = new Map<NodeId, number>();
  const out = new Map<NodeId, number>();
  for (const n of nodes) {
    const root = find(n.id);
    let cid = ids.get(root);
    if (cid === undefined) {
      cid = ids.size;
      ids.set(root, cid);
    }
    out.set(n.id, cid);
  }
  return out;
}

/** A fabricated world: west half in local L1 (cells down), an L2 circle in the east, some dark routers. */
export function makeFixtureSnapshot(tick = 0): Snapshot {
  const prng = new Prng(7);
  const drafts = draftNodes(prng);
  const edges = buildEdges(drafts);
  const comp = components(drafts, edges);
  const neighbours = new Map<NodeId, number>();
  for (const e of edges) {
    neighbours.set(e.a, (neighbours.get(e.a) ?? 0) + 1);
    neighbours.set(e.b, (neighbours.get(e.b) ?? 0) + 1);
  }

  const nodes: NodeView[] = drafts.map((d) => {
    const cellsUp = d.x >= 450;
    const declaredL2 = inRegion(d.x, d.y);
    const mode: Mode = declaredL2 ? 'L2' : cellsUp ? 'PEACE' : 'L1';
    const hasBackhaul =
      d.alive && (d.backhaul === 'satellite' || (d.backhaul !== 'none' && cellsUp));
    const stored = mode !== 'PEACE' && d.kind === 'mobile' && prng.next() < 0.15;
    return {
      id: d.id,
      kind: d.kind,
      x: d.x,
      y: d.y,
      range: d.range,
      credentialKind: d.credentialKind,
      backhaul: d.backhaul,
      batteryBacked: d.batteryBacked,
      travel: null,
      poweredOverride: null,
      alive: d.alive,
      wanUp: d.alive && cellsUp,
      hasBackhaul,
      mode,
      modeSource: declaredL2 ? 'declared' : 'local',
      declaredLevel: declaredL2 ? 'L2' : null,
      componentId: comp.get(d.id) ?? 0,
      neighbourCount: neighbours.get(d.id) ?? 0,
      inboxSize: prng.next() < 0.2 ? prng.int(4) : 0,
      storeSize: stored ? 1 + prng.int(3) : 0,
      openRequests: 0,
    };
  });

  const transits: TransitEvent[] = [];
  const classes = ['LIFE_CRITICAL', 'INFO', 'CHECK_IN', 'OFFICIAL_ALERT', 'GIVE'] as const;
  for (let i = 0; i < 8 && edges.length > 0; i++) {
    const e = prng.pick(edges);
    const cls = prng.pick(classes);
    transits.push({
      tick,
      msgId: makeMessageId(e.a, 100 + i),
      class: cls,
      from: e.a,
      to: e.b,
      hop: 1 + prng.int(4),
      via: cls === 'OFFICIAL_ALERT' ? 'authority-inject' : 'hop',
    });
  }

  const requester = nodes.find((n) => n.kind === 'mobile' && n.mode === 'L1') ?? nodes[0];
  const requestId = requester ? makeMessageId(requester.id, 7) : makeMessageId(AUTHORITY_ID, 7);
  const alertId = makeMessageId(AUTHORITY_ID, 9);
  const declId = makeMessageId(AUTHORITY_ID, 3);
  const messages: MessageView[] = requester
    ? [
        {
          id: requestId,
          seq: 7,
          class: 'SAFETY',
          payload: { kind: 'REQUEST', text: 'Need drinking water for two elderly neighbours' },
          originId: requester.id,
          signer: { nodeId: requester.id, credentialKind: 'citizen', valid: true },
          createdTick: Math.max(0, tick - 3),
          ttlTicks: 200,
          hopLimit: 10,
          unbounded: false,
          region: null,
        },
        {
          id: alertId,
          seq: 9,
          class: 'OFFICIAL_ALERT',
          payload: { kind: 'ALERT', text: 'Shelters open at schools 3 and 7.' },
          originId: AUTHORITY_ID,
          signer: { nodeId: AUTHORITY_ID, credentialKind: 'authority', valid: true },
          createdTick: Math.max(0, tick - 1),
          ttlTicks: 300,
          hopLimit: null,
          unbounded: true,
          region: null,
        },
      ]
    : [];

  const events: SimEvent[] = requester
    ? [
        {
          type: 'MODE_CHANGED',
          tick,
          nodeId: requester.id,
          from: 'PEACE',
          to: 'L1',
          source: 'local',
        },
        { type: 'ORIGINATED', tick, msgId: requestId, nodeId: requester.id, class: 'SAFETY' },
        { type: 'TX_OPENED', tick, requestId, nodeId: requester.id },
        {
          type: 'DELIVERED',
          tick,
          msgId: requestId,
          nodeId: formatNodeId('router', 2),
          class: 'SAFETY',
          hop: 2,
        },
        {
          type: 'DROPPED',
          tick,
          msgId: makeMessageId(formatNodeId('mobile', 5), 11),
          nodeId: formatNodeId('mobile', 6),
          class: 'LIFE_CRITICAL',
          reason: 'UNVERIFIABLE',
        },
        { type: 'STORED', tick, msgId: requestId, nodeId: formatNodeId('mobile', 3) },
        { type: 'AUTHORITY_INJECTED', tick, msgId: alertId, class: 'OFFICIAL_ALERT', count: 2 },
        {
          type: 'ADJACENCY',
          tick,
          version: 1,
          edges: edges.length,
          components: new Set(comp.values()).size,
        },
      ]
    : [];

  const base = emptyMetrics();
  const alive = nodes.filter((n) => n.alive).length;
  const sizes = new Map<number, number>();
  for (const n of nodes) if (n.alive) sizes.set(n.componentId, (sizes.get(n.componentId) ?? 0) + 1);
  const largest = Math.max(0, ...sizes.values());

  return {
    tick,
    world: {
      seed: 7,
      width: WIDTH,
      height: HEIGHT,
      cellsUp: false,
      gridUp: false,
      mobility: false,
      nodeCount: nodes.length,
    },
    terrain: TERRAIN,
    globalMode: 'L2',
    nodes,
    edges,
    transits,
    messages,
    transactions: requester
      ? [
          {
            requestId,
            requesterId: requester.id,
            class: 'SAFETY',
            openedTick: Math.max(0, tick - 3),
            status: 'open',
            accepterId: null,
            acceptedTick: null,
            closedTick: null,
            responses: 0,
          },
        ]
      : [],
    declarations: [
      { id: declId, level: 'L2', region: L2_REGION, fromTick: 0, untilTick: tick + 300 },
    ],
    authority: {
      received: requester
        ? [
            {
              msgId: requestId,
              tick,
              via: formatNodeId('gateway', 1),
              class: 'SAFETY',
              originId: requester.id,
            },
          ]
        : [],
      injected: 2,
    },
    metrics: {
      ...base,
      byClass: {
        ...base.byClass,
        SAFETY: { originated: 1, delivered: 12, uniqueReached: 12, dropped: 3 },
        INFO: { originated: 4, delivered: 31, uniqueReached: 27, dropped: 9 },
        LIFE_CRITICAL: { originated: 1, delivered: 0, uniqueReached: 0, dropped: 4 },
      },
      dropsByReason: { ...base.dropsByReason, UNVERIFIABLE: 4, DUPLICATE: 9, CLASS_NOT_ALLOWED: 3 },
      medianHops: 3,
      medianLatency: 3,
      reachableFraction: alive > 0 ? largest / alive : 0,
      authorityReachableFraction: 0.72,
      componentCount: sizes.size,
      storedTotal: nodes.reduce((sum, n) => sum + n.storeSize, 0),
      transitsThisTick: transits.length,
      totals: { originated: 6, delivered: 43, dropped: 16 },
    },
    recentEvents: events,
  };
}

/** Make the sim store serve the fixture (tick follows the stub engine so playback still counts). */
export function installFixture(): void {
  const base = makeFixtureSnapshot(0);
  setSnapshotSource((engine) => ({ ...base, tick: engine.tick }));
}
