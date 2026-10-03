/**
 * SimEngine: the simulation state machine.
 * Stub body: deterministic world generation, basic snapshots, command logging.
 * Real flooding/mode logic comes in Phase 2.
 */

import type { Command } from '../domain/commands';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig, type WorldConfig } from '../domain/config';
import type { SimEvent, TransitEvent } from '../domain/events';
import { AUTHORITY_ID, formatNodeId, type NodeId } from '../domain/ids';
import type { Node, NodeDetail, NodeView } from '../domain/node';
import type { Snapshot } from '../domain/snapshot';
import { createPrng, type Prng } from '../prng';

export interface TickResult {
  tick: number;
  transits: TransitEvent[];
  events: SimEvent[];
}

export class SimEngine {
  private tick_: number = 0;
  private worldConfig: WorldConfig;
  private engineConfig: EngineConfig;
  private prng: Prng;
  private nodes: Map<NodeId, Node> = new Map();
  private transits: TransitEvent[] = [];
  private eventLog: SimEvent[] = [];
  private commandLog: Command[] = [];
  private snapshot_: Snapshot | null = null;
  private subscribers: Array<() => void> = [];

  private cellsUp: boolean = true;
  private gridUp: boolean = true;

  constructor(world: WorldConfig, cfg?: Partial<EngineConfig>) {
    this.worldConfig = world;
    this.engineConfig = { ...DEFAULT_ENGINE_CONFIG, ...cfg };
    this.prng = createPrng(world.seed);

    this.initializeWorld();
  }

  static replay(
    world: WorldConfig,
    commandLog: Command[],
    untilTick: number,
    cfg?: Partial<EngineConfig>,
  ): SimEngine {
    const engine = new SimEngine(world, cfg);
    for (const cmd of commandLog) {
      engine.dispatch(cmd);
      if (engine.tick_ >= untilTick) {
        break;
      }
    }
    return engine;
  }

  get tick(): number {
    return this.tick_;
  }

  private initializeWorld(): void {
    // Generate routers in a jittered grid
    const cols = Math.ceil(Math.sqrt(this.worldConfig.routers));
    const cellW = this.worldConfig.width / cols;
    const cellH = this.worldConfig.height / cols;
    let routerIdx = 0;

    for (let row = 0; row < cols; row++) {
      for (let col = 0; col < cols && routerIdx < this.worldConfig.routers; col++) {
        const baseX = col * cellW;
        const baseY = row * cellH;
        const x = baseX + this.prng.float(0, cellW);
        const y = baseY + this.prng.float(0, cellH);
        const isBatteryBacked =
          this.prng.float(0, 1) < this.worldConfig.batteryBackedRouterFraction;
        this.createNode('router', routerIdx, x, y, isBatteryBacked);
        routerIdx++;
      }
    }

    // Generate random mobiles
    for (let i = 0; i < this.worldConfig.mobiles; i++) {
      const x = this.prng.float(0, this.worldConfig.width);
      const y = this.prng.float(0, this.worldConfig.height);
      this.createNode('mobile', i, x, y, false);
    }

    // Generate gateways
    for (let i = 0; i < this.worldConfig.gateways; i++) {
      const x = this.prng.float(0, this.worldConfig.width);
      const y = this.prng.float(0, this.worldConfig.height);
      this.createNode('gateway', i, x, y, true);
    }
  }

  private createNode(
    kind: 'mobile' | 'router' | 'gateway',
    idx: number,
    x: number,
    y: number,
    batteryBacked: boolean,
  ): void {
    const id = formatNodeId(kind, idx);
    const isUnregistered =
      kind === 'mobile' && this.prng.float(0, 1) < this.worldConfig.unregisteredFraction;

    const node: Node = {
      id,
      kind,
      x: Math.max(0, Math.min(this.worldConfig.width, x)),
      y: Math.max(0, Math.min(this.worldConfig.height, y)),
      range: this.worldConfig.range[kind],
      credential: {
        kind: isUnregistered ? 'none' : kind === 'router' ? 'relay' : 'citizen',
      },
      backhaul:
        kind === 'gateway'
          ? this.worldConfig.gatewayBackhaul
          : kind === 'router' && batteryBacked
            ? 'cellular'
            : kind === 'router'
              ? 'cellular'
              : 'none',
      batteryBacked: kind === 'router' ? batteryBacked : kind === 'gateway',
      poweredOverride: null,
      alive: true,
      wanUp: true,
      hasBackhaul: kind === 'gateway' || (kind === 'router' && batteryBacked),
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

    this.nodes.set(id, node);
  }

  step(n: number = 1): TickResult {
    const events: SimEvent[] = [];
    const transits: TransitEvent[] = [];

    for (let i = 0; i < n; i++) {
      this.tick_++;
      events.push({
        type: 'ADJACENCY',
        tick: this.tick_,
        version: 1,
      });
    }

    this.eventLog.push(...events);
    this.snapshot_ = null;
    this.notifySubscribers();

    return { tick: this.tick_, transits, events };
  }

  dispatch(cmd: Command): void {
    this.commandLog.push(cmd);

    switch (cmd.type) {
      case 'SET_CELLS_UP':
        this.cellsUp = cmd.up;
        break;
      case 'SET_GRID_UP':
        this.gridUp = cmd.up;
        break;
      case 'RESET_WORLD':
        this.nodes.clear();
        this.worldConfig = cmd.world;
        this.prng = createPrng(cmd.world.seed);
        this.tick_ = 0;
        this.initializeWorld();
        break;
      case 'MOVE_NODE': {
        const node = this.nodes.get(cmd.nodeId);
        if (node) {
          node.x = Math.max(0, Math.min(this.worldConfig.width, cmd.x));
          node.y = Math.max(0, Math.min(this.worldConfig.height, cmd.y));
        }
        break;
      }
      case 'SET_NODE_POWERED': {
        const node = this.nodes.get(cmd.nodeId);
        if (node) {
          node.poweredOverride = cmd.powered;
        }
        break;
      }
      case 'SET_MOBILITY':
        this.engineConfig.mobility.enabled = cmd.enabled;
        if (cmd.stepMetres !== undefined) {
          this.engineConfig.mobility.stepMetres = cmd.stepMetres;
        }
        break;
      // Other commands logged but not implemented yet
    }

    this.eventLog.push({
      type: 'COMMAND',
      tick: this.tick_,
      command: cmd,
    });

    this.snapshot_ = null;
    this.notifySubscribers();
  }

  getSnapshot(): Snapshot {
    if (!this.snapshot_) {
      this.snapshot_ = this.buildSnapshot();
    }
    return this.snapshot_;
  }

  private buildSnapshot(): Snapshot {
    const nodeViews: NodeView[] = Array.from(this.nodes.values())
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((node) => ({
        id: node.id,
        kind: node.kind,
        x: node.x,
        y: node.y,
        range: node.range,
        credentialKind: node.credential.kind,
        alive: node.alive,
        wanUp: node.wanUp,
        hasBackhaul: node.hasBackhaul,
        mode: node.mode,
        modeSource: node.modeSource,
        componentId: 0,
        neighbourCount: node.neighbourIds.length,
        inboxSize: node.inbox.length,
        storeSize: node.store.length,
        openRequests: Array.from(node.requestView.values()).filter((v) => v.status === 'open')
          .length,
      }));

    const edgeViews = this.computeEdges();

    return {
      tick: this.tick_,
      world: {
        seed: this.worldConfig.seed,
        width: this.worldConfig.width,
        height: this.worldConfig.height,
        cellsUp: this.cellsUp,
        gridUp: this.gridUp,
        mobility: { ...this.engineConfig.mobility },
      },
      nodes: nodeViews,
      edges: edgeViews,
      transits: this.transits,
      messages: [],
      transactions: [],
      declarations: [],
      authority: {
        received: [],
      },
      metrics: {
        reachableFraction: 1,
        authorityReachableFraction: 1,
        componentCount: 1,
        storedTotal: 0,
        transitsThisTick: 0,
        deliveriesByClass: {
          LEND: 0,
          BORROW: 0,
          GIVE: 0,
          SELL: 0,
          INFO: 0,
          LIFE_CRITICAL: 0,
          SAFETY: 0,
          CHECK_IN: 0,
          OFFICIAL_ALERT: 0,
          MODE_DECLARATION: 0,
          TOPOLOGY: 0,
          PORTAL_SUMMARY: 0,
        },
        dropsByReason: {},
        medianHops: 0,
        medianLatency: 0,
      },
      recentEvents: [],
    };
  }

  private computeEdges(): Array<{ a: NodeId; b: NodeId; quality: 'near' | 'medium' | 'far' }> {
    const edges: Array<{
      a: NodeId;
      b: NodeId;
      quality: 'near' | 'medium' | 'far';
    }> = [];

    const nodesArray = Array.from(this.nodes.values());
    for (let i = 0; i < nodesArray.length; i++) {
      for (let j = i + 1; j < nodesArray.length; j++) {
        const a = nodesArray[i]!;
        const b = nodesArray[j]!;

        if (!a.alive || !b.alive) continue;

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxRange = Math.min(a.range, b.range);

        if (dist <= maxRange) {
          const frac = dist / maxRange;
          const quality = frac < 0.333 ? 'near' : frac < 0.667 ? 'medium' : 'far';
          const edgeA = a.id < b.id ? a.id : b.id;
          const edgeB = a.id < b.id ? b.id : a.id;
          edges.push({ a: edgeA, b: edgeB, quality });
        }
      }
    }

    return edges;
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.push(fn);
    return () => {
      const idx = this.subscribers.indexOf(fn);
      if (idx >= 0) this.subscribers.splice(idx, 1);
    };
  }

  private notifySubscribers(): void {
    for (const fn of this.subscribers) {
      fn();
    }
  }

  getNodeDetail(id: NodeId): NodeDetail {
    const node = this.nodes.get(id);
    if (!node) {
      throw new Error(`Node not found: ${id}`);
    }

    return {
      id: node.id,
      kind: node.kind,
      x: node.x,
      y: node.y,
      range: node.range,
      credentialKind: node.credential.kind,
      alive: node.alive,
      wanUp: node.wanUp,
      hasBackhaul: node.hasBackhaul,
      mode: node.mode,
      modeSource: node.modeSource,
      backhaul: node.backhaul,
      batteryBacked: node.batteryBacked,
      poweredOverride: node.poweredOverride,
      inbox: node.inbox.map((p) => ({
        id: p.msgId,
        class: 'UNKNOWN',
        originId: AUTHORITY_ID,
        hop: p.hop,
        hopLimit: 3,
        ttlRemaining: 60,
      })),
      store: node.store.map((s) => ({
        msgId: s.msgId,
        hop: s.packet.hop,
        class: 'UNKNOWN',
      })),
      requestView: Array.from(node.requestView.entries()).map(([msgId, data]) => ({
        msgId,
        status: data.status,
        hop: data.hop,
      })),
      nodeLog: [],
    };
  }

  getEventLog(): SimEvent[] {
    return this.eventLog;
  }

  getCommandLog(): Command[] {
    return this.commandLog;
  }

  getTransits(tick: number): TransitEvent[] {
    return this.transits.filter((t) => t.tick === tick);
  }
}

export function createEngine(world: WorldConfig, cfg?: Partial<EngineConfig>): SimEngine {
  return new SimEngine(world, cfg);
}
