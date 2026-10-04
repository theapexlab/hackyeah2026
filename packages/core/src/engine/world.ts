import type { WorldConfig } from '../domain/config';
import type { NodeId } from '../domain/ids';
import { formatNodeId } from '../domain/ids';
import type { Backhaul, CredentialKind, Node, NodeKind } from '../domain/node';
import type { Prng } from '../prng';
import { nearestPointOnGraph, randomPointOnStreets } from '../terrain/graph';
import { resolveTerrain } from '../terrain/index';
import type { Pt, Terrain } from '../terrain/types';

/** Static properties needed to create a node; every protocol field starts empty. */
export interface NodeInit {
  readonly id: NodeId;
  readonly kind: NodeKind;
  readonly x: number;
  readonly y: number;
  readonly range: number;
  readonly credentialKind: CredentialKind;
  readonly backhaul: Backhaul;
  readonly batteryBacked?: boolean;
}

/**
 * A node in PEACE, alive, with empty protocol state. The derived flags (alive, wanUp,
 * hasBackhaul) are provisional until the engine's first liveness pass.
 */
export function createNode(init: NodeInit): Node {
  return {
    id: init.id,
    kind: init.kind,
    x: init.x,
    y: init.y,
    range: init.range,
    credential: { kind: init.credentialKind },
    backhaul: init.backhaul,
    batteryBacked: init.batteryBacked ?? false,
    walk: null,
    poweredOverride: null,
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
    seenOrder: [],
    store: [],
    requestView: new Map(),
    neighbourIds: [],
    prevNeighbourIds: [],
    pendingOriginations: [],
  };
}

/** Lexical id order; ids are zero-padded so this is also creation order. */
export function compareNodeId(a: NodeId, b: NodeId): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** A sorted copy (ascending by id), the order every engine loop relies on. */
export function sortNodes(nodes: readonly Node[]): Node[] {
  return [...nodes].sort((a, b) => compareNodeId(a.id, b.id));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** The nearest point of a land street, or the point itself (clamped) on a map without streets. */
function snapToStreet(terrain: Terrain, x: number, y: number, width: number, height: number): Pt {
  const p = { x: clamp(x, 0, width), y: clamp(y, 0, height) };
  const q = nearestPointOnGraph(terrain.graph, p, { land: true });
  return q === null ? p : { x: q.x, y: q.y };
}

/**
 * Gateway positions as fractions of the area, taken in order: the four corners
 * (inset 12%), then the centre, then the edge midpoints. Gateways beyond the list
 * are placed uniformly at random.
 */
const GATEWAY_ANCHORS: readonly (readonly [number, number])[] = [
  [0.12, 0.12],
  [0.88, 0.88],
  [0.88, 0.12],
  [0.12, 0.88],
  [0.5, 0.5],
  [0.5, 0.12],
  [0.5, 0.88],
  [0.12, 0.5],
  [0.88, 0.5],
];

/**
 * Deterministic world generation on a terrain (default: resolveTerrain(config)). Every node
 * stands on a land street, never in the water. PRNG draw order is fixed and must not be
 * reordered:
 *
 *  1. routers, in index order: x jitter then y jitter (2 draws each). Routers sit on a
 *     grid of cols x rows cells (cols = round(sqrt(count * width/height)),
 *     rows = floor(count / cols)), jittered by up to 25% of the cell; routers beyond
 *     cols*rows are placed uniformly at random (still 2 draws). Each then snaps to the
 *     nearest land street (no draws).
 *  2. mobiles, in index order: a point on the land streets, uniform by street length
 *     (edge then position: 2 draws each; uniform over the area when there are no streets).
 *  3. gateways beyond the anchor list, in index order: x then y (2 draws each).
 *     Anchored gateways draw nothing. Every gateway snaps to the nearest land street.
 *  4. one shuffle of the mobile indices; the first round(unregisteredFraction * n)
 *     get credential 'none', the rest 'citizen'.
 *  5. one shuffle of the router indices; the first round(batteryBackedRouterFraction * n)
 *     are batteryBacked.
 *
 * Ids are 1-based through formatNodeId; the result is sorted by id. Every node starts
 * PEACE, alive, with empty protocol state. Mobiles have 'cellular' backhaul, routers
 * 'none', gateways config.gatewayBackhaul; routers and gateways carry a relay credential.
 */
export function generateWorld(
  config: WorldConfig,
  prng: Prng,
  terrain: Terrain = resolveTerrain(config),
): Node[] {
  const { width, height } = config;
  const nRouters = Math.max(0, Math.floor(config.routers));
  const nMobiles = Math.max(0, Math.floor(config.mobiles));
  const nGateways = Math.max(0, Math.floor(config.gateways));

  // 1. routers
  const routers: Node[] = [];
  if (nRouters > 0) {
    const aspect = width / height;
    const cols = Math.max(1, Math.round(Math.sqrt(nRouters * aspect)));
    const rows = Math.max(1, Math.floor(nRouters / cols));
    const cellW = width / cols;
    const cellH = height / rows;
    for (let i = 0; i < nRouters; i++) {
      let x: number;
      let y: number;
      if (i < cols * rows) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        x = (col + 0.5) * cellW + prng.float(-0.25, 0.25) * cellW;
        y = (row + 0.5) * cellH + prng.float(-0.25, 0.25) * cellH;
      } else {
        x = prng.float(0, width);
        y = prng.float(0, height);
      }
      const at = snapToStreet(terrain, x, y, width, height);
      routers.push(
        createNode({
          id: formatNodeId('router', i + 1),
          kind: 'router',
          x: at.x,
          y: at.y,
          range: config.range.router,
          credentialKind: 'relay',
          backhaul: 'none',
        }),
      );
    }
  }

  // 2. mobiles
  const mobiles: Node[] = [];
  for (let i = 0; i < nMobiles; i++) {
    const at = randomPointOnStreets(terrain.graph, prng, { land: true }) ?? {
      x: prng.float(0, width),
      y: prng.float(0, height),
    };
    mobiles.push(
      createNode({
        id: formatNodeId('mobile', i + 1),
        kind: 'mobile',
        x: at.x,
        y: at.y,
        range: config.range.mobile,
        credentialKind: 'citizen',
        backhaul: 'cellular',
      }),
    );
  }

  // 3. gateways
  const gateways: Node[] = [];
  for (let i = 0; i < nGateways; i++) {
    const anchor = GATEWAY_ANCHORS[i];
    const x = anchor === undefined ? prng.float(0, width) : anchor[0] * width;
    const y = anchor === undefined ? prng.float(0, height) : anchor[1] * height;
    const at = snapToStreet(terrain, x, y, width, height);
    gateways.push(
      createNode({
        id: formatNodeId('gateway', i + 1),
        kind: 'gateway',
        x: at.x,
        y: at.y,
        range: config.range.gateway,
        credentialKind: 'relay',
        backhaul: config.gatewayBackhaul,
      }),
    );
  }

  // 4. unregistered mobiles
  if (nMobiles > 0) {
    const k = clamp(Math.round(config.unregisteredFraction * nMobiles), 0, nMobiles);
    const order = prng.shuffle(mobiles.map((_, i) => i));
    for (let j = 0; j < k; j++) {
      const idx = order[j];
      const node = idx === undefined ? undefined : mobiles[idx];
      if (node !== undefined) node.credential = { kind: 'none' };
    }
  }

  // 5. battery-backed routers
  if (nRouters > 0) {
    const k = clamp(Math.round(config.batteryBackedRouterFraction * nRouters), 0, nRouters);
    const order = prng.shuffle(routers.map((_, i) => i));
    for (let j = 0; j < k; j++) {
      const idx = order[j];
      const node = idx === undefined ? undefined : routers[idx];
      if (node !== undefined) node.batteryBacked = true;
    }
  }

  return sortNodes([...routers, ...mobiles, ...gateways]);
}
