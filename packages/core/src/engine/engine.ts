/**
 * SimEngine: the main simulation state machine.
 * Implements Phase 2: full messaging, mode machine, transactions, deterministic PRNG.
 */

import type { Command } from '../domain/commands';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig, type WorldConfig } from '../domain/config';
import type { SimEvent, TransitEvent } from '../domain/events';
import {
  AUTHORITY_ID,
  formatMessageId,
  formatNodeId,
  type MessageId,
  type NodeId,
} from '../domain/ids';
import type { Message } from '../domain/message';
import type { MessageClass, Mode } from '../domain/mode';
import { MODE_POLICIES } from '../domain/mode';
import type { Node, NodeDetail, NodeView } from '../domain/node';
import type { MetricsView, Snapshot } from '../domain/snapshot';
import { buildAdjacency } from '../graph/adjacency';
import { findComponents } from '../graph/components';
import { applyDeclaration } from '../policies/modeMachine';
import { createPrng } from '../prng';
import { injectAuthorityMessage } from './authority';
import type { EngineState } from './state';
import { updateLiveness } from './state';
import { doTick } from './tick';

export interface TickResult {
  tick: number;
  transits: TransitEvent[];
  events: SimEvent[];
}

export class SimEngine {
  private state: EngineState;
  private snapshot_: Snapshot | null = null;
  private subscribers: Array<() => void> = [];
  private eventLog: SimEvent[] = [];
  private recentEvents: SimEvent[] = [];
  private commandLog: Command[] = [];
  private edgesCache: Array<{ a: NodeId; b: NodeId; quality: 'near' | 'medium' | 'far' }> | null =
    null;
  private edgesCacheVersion: number = -1;
  private messagesCache: Array<{
    id: MessageId;
    class: MessageClass;
    originId: NodeId;
    hop: number;
    hopLimit: number;
    ttlRemaining: number;
  }> | null = null;
  private lastMessageRegistrySize: number = 0;

  constructor(world: WorldConfig, cfg?: Partial<EngineConfig>) {
    const engineConfig = { ...DEFAULT_ENGINE_CONFIG, ...cfg };

    this.state = {
      tick: 0,
      nodes: new Map(),
      adjacency: { edges: [], neighbours: new Map(), version: 0 },
      components: {
        nodeToComponent: new Map(),
        componentCount: 0,
        authorityReachableComponentId: null,
      },
      adjacencyVersion: 0,
      adjacencyDirty: true,
      worldConfig: world,
      engineConfig,
      prng: createPrng(world.seed),
      cellsUp: true,
      gridUp: true,
      messageRegistry: new Map(),
      messageSeq: 1,
    };

    this.initializeWorld();
    this.buildAdjacency();
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
      if (engine.state.tick >= untilTick) {
        break;
      }
    }
    return engine;
  }

  get tick(): number {
    return this.state.tick;
  }

  private initializeWorld(): void {
    // Generate routers in a jittered grid
    const cols = Math.ceil(Math.sqrt(this.state.worldConfig.routers));
    const cellW = this.state.worldConfig.width / cols;
    const cellH = this.state.worldConfig.height / cols;
    let routerIdx = 0;

    for (let row = 0; row < cols; row++) {
      for (let col = 0; col < cols && routerIdx < this.state.worldConfig.routers; col++) {
        const baseX = col * cellW;
        const baseY = row * cellH;
        const x = baseX + this.state.prng.float(0, cellW);
        const y = baseY + this.state.prng.float(0, cellH);
        const isBatteryBacked =
          this.state.prng.float(0, 1) < this.state.worldConfig.batteryBackedRouterFraction;
        this.createNode('router', routerIdx, x, y, isBatteryBacked);
        routerIdx++;
      }
    }

    // Generate random mobiles
    for (let i = 0; i < this.state.worldConfig.mobiles; i++) {
      const x = this.state.prng.float(0, this.state.worldConfig.width);
      const y = this.state.prng.float(0, this.state.worldConfig.height);
      this.createNode('mobile', i, x, y, false);
    }

    // Generate gateways
    for (let i = 0; i < this.state.worldConfig.gateways; i++) {
      const x = this.state.prng.float(0, this.state.worldConfig.width);
      const y = this.state.prng.float(0, this.state.worldConfig.height);
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
      kind === 'mobile' &&
      this.state.prng.float(0, 1) < this.state.worldConfig.unregisteredFraction;

    const node: Node = {
      id,
      kind,
      x: Math.max(0, Math.min(this.state.worldConfig.width, x)),
      y: Math.max(0, Math.min(this.state.worldConfig.height, y)),
      range: this.state.worldConfig.range[kind],
      credential: {
        kind: isUnregistered ? 'none' : kind === 'router' ? 'relay' : 'citizen',
      },
      backhaul:
        kind === 'gateway'
          ? this.state.worldConfig.gatewayBackhaul
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

    this.state.nodes.set(id, node);
  }

  private buildAdjacency(): void {
    this.state.adjacency = buildAdjacency(this.state.nodes);
    this.state.components = findComponents(this.state.nodes, this.state.adjacency);

    // Update neighbor lists on nodes
    for (const node of this.state.nodes.values()) {
      node.neighbourIds = this.state.adjacency.neighbours.get(node.id) ?? [];
    }
  }

  step(n: number = 1): TickResult {
    const allEvents: SimEvent[] = [];
    const allTransits: TransitEvent[] = [];

    for (let i = 0; i < n; i++) {
      this.state.tick++;
      const tickState = doTick(this.state);

      allEvents.push(...tickState.events);
      allTransits.push(...tickState.transits);
    }

    this.eventLog.push(...allEvents);
    this.recentEvents.push(...allEvents);
    if (this.recentEvents.length > this.state.engineConfig.recentEventsCap) {
      this.recentEvents.splice(
        0,
        this.recentEvents.length - this.state.engineConfig.recentEventsCap,
      );
    }

    this.snapshot_ = null;
    this.edgesCache = null;
    this.messagesCache = null;
    this.notifySubscribers();

    return { tick: this.state.tick, transits: allTransits, events: allEvents };
  }

  dispatch(cmd: Command): void {
    this.commandLog.push(cmd);
    const events: SimEvent[] = [];

    switch (cmd.type) {
      case 'SET_CELLS_UP':
        this.state.cellsUp = cmd.up;
        this.state.adjacencyDirty = true;
        break;

      case 'SET_GRID_UP':
        this.state.gridUp = cmd.up;
        this.state.adjacencyDirty = true;
        break;

      case 'RESET_WORLD':
        this.state.nodes.clear();
        this.state.messageRegistry.clear();
        this.state.messageSeq = 1;
        this.state.worldConfig = cmd.world;
        this.state.prng = createPrng(cmd.world.seed);
        this.state.tick = 0;
        this.eventLog = [];
        this.recentEvents = [];
        this.initializeWorld();
        this.buildAdjacency();
        break;

      case 'MOVE_NODE': {
        const node = this.state.nodes.get(cmd.nodeId);
        if (node) {
          node.x = Math.max(0, Math.min(this.state.worldConfig.width, cmd.x));
          node.y = Math.max(0, Math.min(this.state.worldConfig.height, cmd.y));
          this.state.adjacencyDirty = true;
        }
        break;
      }

      case 'SET_NODE_POWERED': {
        const node = this.state.nodes.get(cmd.nodeId);
        if (node) {
          node.poweredOverride = cmd.powered;
          this.state.adjacencyDirty = true;
        }
        break;
      }

      case 'SET_MOBILITY':
        this.state.engineConfig.mobility.enabled = cmd.enabled;
        if (cmd.stepMetres !== undefined) {
          this.state.engineConfig.mobility.stepMetres = cmd.stepMetres;
        }
        break;

      case 'DECLARE_MODE': {
        const msg: Message = {
          id: formatMessageId(AUTHORITY_ID, this.state.messageSeq++),
          seq: 0,
          class: 'MODE_DECLARATION',
          payload: {
            kind: 'MODE_DECLARATION',
            level: cmd.level as 'L1' | 'L2' | 'L3' | 'ALL_CLEAR',
            untilTick: cmd.durationTicks
              ? this.state.tick + cmd.durationTicks
              : this.state.tick + this.state.engineConfig.declarationDurationTicks,
          },
          originId: AUTHORITY_ID,
          signer: { nodeId: AUTHORITY_ID, credentialKind: 'authority', valid: !cmd.forged },
          createdTick: this.state.tick,
          ttlTicks: 300,
          hopLimit: Infinity,
          region: cmd.region,
        };

        this.state.messageRegistry.set(msg.id, msg);
        injectAuthorityMessage(this.state, msg, events, []);
        break;
      }

      case 'ALL_CLEAR': {
        const msg: Message = {
          id: formatMessageId(AUTHORITY_ID, this.state.messageSeq++),
          seq: 0,
          class: 'MODE_DECLARATION',
          payload: {
            kind: 'MODE_DECLARATION',
            level: 'ALL_CLEAR',
            untilTick: this.state.tick,
          },
          originId: AUTHORITY_ID,
          signer: { nodeId: AUTHORITY_ID, credentialKind: 'authority', valid: !cmd.forged },
          createdTick: this.state.tick,
          ttlTicks: 300,
          hopLimit: Infinity,
          region: cmd.region,
        };

        this.state.messageRegistry.set(msg.id, msg);
        injectAuthorityMessage(this.state, msg, events, []);
        break;
      }

      case 'BROADCAST_ALERT': {
        const msg: Message = {
          id: formatMessageId(AUTHORITY_ID, this.state.messageSeq++),
          seq: 0,
          class: 'OFFICIAL_ALERT',
          payload: { kind: 'ALERT', text: cmd.text },
          originId: AUTHORITY_ID,
          signer: { nodeId: AUTHORITY_ID, credentialKind: 'authority', valid: !cmd.forged },
          createdTick: this.state.tick,
          ttlTicks: 300,
          hopLimit: Infinity,
          region: cmd.region,
        };

        this.state.messageRegistry.set(msg.id, msg);
        injectAuthorityMessage(this.state, msg, events, []);
        break;
      }

      case 'SEND_REQUEST': {
        const node = this.state.nodes.get(cmd.from);
        if (node) {
          const msg: Message = {
            id: formatMessageId(cmd.from, this.state.messageSeq++),
            seq: 0,
            class: cmd.class,
            payload: { kind: 'REQUEST', text: cmd.text },
            originId: cmd.from,
            signer: {
              nodeId: cmd.from,
              credentialKind: cmd.forge ? 'none' : node.credential.kind,
              valid: !cmd.forge,
            },
            createdTick: this.state.tick,
            ttlTicks: MODE_POLICIES[node.mode].ttlTicks,
            hopLimit: cmd.hopLimit ?? MODE_POLICIES[node.mode].hopLimit,
          };

          this.state.messageRegistry.set(msg.id, msg);
          node.pendingOriginations.push(msg);
        }
        break;
      }

      case 'SEND_CHECK_IN': {
        const node = this.state.nodes.get(cmd.from);
        if (node) {
          const msg: Message = {
            id: formatMessageId(cmd.from, this.state.messageSeq++),
            seq: 0,
            class: 'CHECK_IN',
            payload: { kind: 'CHECK_IN', status: cmd.status },
            originId: cmd.from,
            signer: { nodeId: cmd.from, credentialKind: node.credential.kind, valid: true },
            createdTick: this.state.tick,
            ttlTicks: MODE_POLICIES[node.mode].ttlTicks,
            hopLimit: Infinity,
          };

          this.state.messageRegistry.set(msg.id, msg);
          node.pendingOriginations.push(msg);
        }
        break;
      }

      case 'SEND_RANDOM_REQUEST': {
        const nodeId = cmd.from ?? this.pickRandomCitizenMobile();
        if (nodeId) {
          const node = this.state.nodes.get(nodeId);
          if (node) {
            const classes = MODE_POLICIES[node.mode].originClasses;
            const cls = this.state.prng.pick(classes);
            const texts = ['Help needed', 'Request', 'Anyone available?', 'Can someone help?'];
            const text = this.state.prng.pick(texts);

            const msg: Message = {
              id: formatMessageId(nodeId, this.state.messageSeq++),
              seq: 0,
              class: cls,
              payload: { kind: 'REQUEST', text },
              originId: nodeId,
              signer: { nodeId, credentialKind: node.credential.kind, valid: true },
              createdTick: this.state.tick,
              ttlTicks: MODE_POLICIES[node.mode].ttlTicks,
              hopLimit: MODE_POLICIES[node.mode].hopLimit,
            };

            this.state.messageRegistry.set(msg.id, msg);
            node.pendingOriginations.push(msg);
          }
        }
        break;
      }

      case 'ACCEPT': {
        const node = this.state.nodes.get(cmd.nodeId);
        if (node && cmd.requestId) {
          const requestView = node.requestView.get(cmd.requestId);
          if (requestView && requestView.status === 'open') {
            requestView.status = 'accepted-by-me';

            // Send response
            const req = this.state.messageRegistry.get(cmd.requestId);
            if (req && req.payload.kind === 'REQUEST') {
              const responseMsg: Message = {
                id: formatMessageId(cmd.nodeId, this.state.messageSeq++),
                seq: 0,
                class: req.class,
                payload: {
                  kind: 'RESPONSE',
                  requestId: cmd.requestId,
                  responderId: cmd.nodeId,
                  targetId: req.originId,
                  returnPath: [],
                },
                originId: cmd.nodeId,
                signer: { nodeId: cmd.nodeId, credentialKind: node.credential.kind, valid: true },
                createdTick: this.state.tick,
                ttlTicks: MODE_POLICIES[node.mode].ttlTicks,
                hopLimit: Infinity,
              };

              this.state.messageRegistry.set(responseMsg.id, responseMsg);
              node.pendingOriginations.push(responseMsg);
            }

            // Send close immediately if autoConfirm
            if (this.state.engineConfig.autoConfirm) {
              const closeMsg: Message = {
                id: formatMessageId(req!.originId, this.state.messageSeq++),
                seq: 0,
                class: 'INFO',
                payload: { kind: 'CLOSE', requestId: cmd.requestId, accepterId: cmd.nodeId },
                originId: req!.originId,
                signer: {
                  nodeId: req!.originId,
                  credentialKind: this.state.nodes.get(req!.originId)?.credential.kind ?? 'citizen',
                  valid: true,
                },
                createdTick: this.state.tick,
                ttlTicks: MODE_POLICIES[node.mode].ttlTicks,
                hopLimit: Infinity,
              };

              this.state.messageRegistry.set(closeMsg.id, closeMsg);
              const originNode = this.state.nodes.get(req!.originId);
              if (originNode) {
                originNode.pendingOriginations.push(closeMsg);
              }
            }
          }
        }
        break;
      }

      case 'AUTO_RESPOND': {
        // Find eligible nodes to auto-respond
        let chosen: NodeId | null = null;

        if (cmd.requestId) {
          const req = this.state.messageRegistry.get(cmd.requestId);
          if (req) {
            const eligible: NodeId[] = [];

            for (const node of this.state.nodes.values()) {
              if (node.alive && node.credential.kind === 'citizen' && node.id !== req.originId) {
                const view = node.requestView.get(cmd.requestId);
                if (view && view.status === 'open') {
                  eligible.push(node.id);
                }
              }
            }

            if (eligible.length > 0) {
              if (cmd.strategy === 'nearest-hops') {
                eligible.sort((a, b) => {
                  const viewA =
                    this.state.nodes.get(a)?.requestView.get(cmd.requestId!)?.hop ?? 999;
                  const viewB =
                    this.state.nodes.get(b)?.requestView.get(cmd.requestId!)?.hop ?? 999;
                  const cmp = viewA - viewB;
                  if (cmp !== 0) return cmp;
                  return a.localeCompare(b);
                });
                chosen = eligible[0] ?? null;
              } else {
                chosen = this.state.prng.pick(eligible);
              }
            } else {
              events.push({
                type: 'AUTO_RESPOND_NONE',
                tick: this.state.tick,
                requestId: cmd.requestId,
              });
            }
          }
        }

        if (chosen && cmd.requestId) {
          this.dispatch({
            type: 'ACCEPT',
            nodeId: chosen,
            requestId: cmd.requestId,
          });
        }
        break;
      }

      case 'CLOSE': {
        // Originate a close message
        for (const node of this.state.nodes.values()) {
          if (node.alive) {
            const closeMsg: Message = {
              id: formatMessageId(node.id, this.state.messageSeq++),
              seq: 0,
              class: 'INFO',
              payload: { kind: 'CLOSE', requestId: cmd.requestId, accepterId: AUTHORITY_ID },
              originId: node.id,
              signer: { nodeId: node.id, credentialKind: node.credential.kind, valid: true },
              createdTick: this.state.tick,
              ttlTicks: MODE_POLICIES[node.mode].ttlTicks,
              hopLimit: Infinity,
            };

            this.state.messageRegistry.set(closeMsg.id, closeMsg);
            node.pendingOriginations.push(closeMsg);
          }
        }
        break;
      }
    }

    events.push({
      type: 'COMMAND',
      tick: this.state.tick,
      command: cmd,
    });

    this.eventLog.push(...events);
    this.recentEvents.push(...events);
    if (this.recentEvents.length > this.state.engineConfig.recentEventsCap) {
      this.recentEvents.splice(
        0,
        this.recentEvents.length - this.state.engineConfig.recentEventsCap,
      );
    }

    this.snapshot_ = null;
    this.edgesCache = null;
    this.messagesCache = null;
    this.notifySubscribers();
  }

  private pickRandomCitizenMobile(): NodeId | null {
    const candidates: NodeId[] = [];
    for (const node of this.state.nodes.values()) {
      if (node.kind === 'mobile' && node.alive && node.credential.kind === 'citizen') {
        candidates.push(node.id);
      }
    }
    return candidates.length > 0 ? this.state.prng.pick(candidates) : null;
  }

  getSnapshot(): Snapshot {
    if (!this.snapshot_) {
      this.snapshot_ = this.buildSnapshot();
    }
    return this.snapshot_;
  }

  private buildSnapshot(): Snapshot {
    updateLiveness(this.state);

    const nodeViews: NodeView[] = Array.from(this.state.nodes.values())
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
        componentId: this.state.components.nodeToComponent.get(node.id) ?? 0,
        neighbourCount: node.neighbourIds.length,
        inboxSize: node.inbox.length + node.nextInbox.length,
        storeSize: node.store.length,
        openRequests: Array.from(node.requestView.values()).filter((v) => v.status === 'open')
          .length,
      }));

    // Cache edges
    if (this.edgesCacheVersion !== this.state.adjacencyVersion) {
      this.edgesCache = this.state.adjacency.edges;
      this.edgesCacheVersion = this.state.adjacencyVersion;
    }

    // Cache messages
    if (this.lastMessageRegistrySize !== this.state.messageRegistry.size) {
      this.messagesCache = Array.from(this.state.messageRegistry.values())
        .slice(-this.state.engineConfig.recentEventsCap)
        .map((msg) => ({
          id: msg.id,
          class: msg.class,
          originId: msg.originId,
          hop: 0,
          hopLimit: msg.hopLimit,
          ttlRemaining: Math.max(0, msg.ttlTicks - (this.state.tick - msg.createdTick)),
        }));
      this.lastMessageRegistrySize = this.state.messageRegistry.size;
    }

    const metrics = this.buildMetrics();

    return {
      tick: this.state.tick,
      world: {
        seed: this.state.worldConfig.seed,
        width: this.state.worldConfig.width,
        height: this.state.worldConfig.height,
        cellsUp: this.state.cellsUp,
        gridUp: this.state.gridUp,
        mobility: { ...this.state.engineConfig.mobility },
      },
      nodes: nodeViews,
      edges: this.edgesCache ?? [],
      transits: [], // Filled by step()
      messages: this.messagesCache ?? [],
      transactions: [],
      declarations: [],
      authority: { received: [] },
      metrics,
      recentEvents: this.recentEvents,
    };
  }

  private buildMetrics(): MetricsView {
    const reachableCount =
      this.state.components.componentCount > 0
        ? Math.max(...Array.from(this.state.components.nodeToComponent.values()).map((c) => c + 1))
        : 0;
    let aliveCount = 0;
    for (const node of this.state.nodes.values()) {
      if (node.alive) aliveCount++;
    }

    let authorityReachableCount = 0;
    if (this.state.components.authorityReachableComponentId !== null) {
      const compId = this.state.components.authorityReachableComponentId;
      for (const node of this.state.nodes.values()) {
        if (node.alive && this.state.components.nodeToComponent.get(node.id) === compId) {
          authorityReachableCount++;
        }
      }
    }

    return {
      reachableFraction: aliveCount > 0 ? aliveCount / aliveCount : 0,
      authorityReachableFraction: aliveCount > 0 ? authorityReachableCount / aliveCount : 0,
      componentCount: this.state.components.componentCount,
      storedTotal: Array.from(this.state.nodes.values()).reduce(
        (sum, n) => sum + n.store.length,
        0,
      ),
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
    };
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
    const node = this.state.nodes.get(id);
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
      inbox: [...node.inbox, ...node.nextInbox].map((p) => {
        const msg = this.state.messageRegistry.get(p.msgId);
        return {
          id: p.msgId,
          class: msg?.class ?? 'INFO',
          originId: msg?.originId ?? AUTHORITY_ID,
          hop: p.hop,
          hopLimit: msg?.hopLimit ?? Infinity,
          ttlRemaining: msg ? Math.max(0, msg.ttlTicks - (this.state.tick - msg.createdTick)) : 0,
        };
      }),
      store: node.store.map((s) => {
        const msg = this.state.messageRegistry.get(s.msgId);
        return {
          msgId: s.msgId,
          hop: s.packet.hop,
          class: msg?.class ?? 'INFO',
        };
      }),
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
    return []; // TODO: Implement transit ring buffer
  }
}

export function createEngine(world: WorldConfig, cfg?: Partial<EngineConfig>): SimEngine {
  return new SimEngine(world, cfg);
}
