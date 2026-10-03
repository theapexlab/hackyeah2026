/**
 * Deterministic world generation. PRNG draw order is fixed:
 * routers (x, y, battery), mobiles (x, y, unregistered), gateways (x, y).
 */

import type { WorldConfig } from '../domain/config';
import { formatNodeId, type NodeId } from '../domain/ids';
import type { Node, NodeKind } from '../domain/node';
import type { Prng } from '../prng';

function createNode(
  world: WorldConfig,
  kind: NodeKind,
  idx: number,
  x: number,
  y: number,
  opts: { batteryBacked?: boolean; unregistered?: boolean } = {},
): Node {
  return {
    id: formatNodeId(kind, idx),
    kind,
    x: Math.max(0, Math.min(world.width, x)),
    y: Math.max(0, Math.min(world.height, y)),
    range: world.range[kind],
    credential: { kind: kind !== 'mobile' ? 'relay' : opts.unregistered ? 'none' : 'citizen' },
    backhaul: kind === 'gateway' ? world.gatewayBackhaul : kind === 'router' ? 'fibre' : 'cellular',
    batteryBacked: kind === 'gateway' || (opts.batteryBacked ?? false),
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
  };
}

/** Nodes keyed in id order (so Map iteration order is the deterministic iteration order). */
export function generateNodes(world: WorldConfig, prng: Prng): Map<NodeId, Node> {
  const nodes: Node[] = [];

  const cols = Math.max(1, Math.ceil(Math.sqrt(world.routers)));
  const rows = Math.max(1, Math.ceil(world.routers / cols));
  const cellW = world.width / cols;
  const cellH = world.height / rows;
  for (let i = 0; i < world.routers; i++) {
    const x = (i % cols) * cellW + prng.float(0, cellW);
    const y = Math.floor(i / cols) * cellH + prng.float(0, cellH);
    const batteryBacked = prng.float(0, 1) < world.batteryBackedRouterFraction;
    nodes.push(createNode(world, 'router', i, x, y, { batteryBacked }));
  }

  for (let i = 0; i < world.mobiles; i++) {
    const x = prng.float(0, world.width);
    const y = prng.float(0, world.height);
    const unregistered = prng.float(0, 1) < world.unregisteredFraction;
    nodes.push(createNode(world, 'mobile', i, x, y, { unregistered }));
  }

  for (let i = 0; i < world.gateways; i++) {
    nodes.push(
      createNode(world, 'gateway', i, prng.float(0, world.width), prng.float(0, world.height)),
    );
  }

  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Map(nodes.map((n) => [n.id, n]));
}
