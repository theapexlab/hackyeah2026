/**
 * SimEngine: mutable class + cached projected snapshot (no reducer).
 * Deterministic for a given (world, config, timed command log): replay reproduces live state.
 */

import type { Command } from '../domain/commands';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig, type WorldConfig } from '../domain/config';
import type { SimEvent, TransitEvent } from '../domain/events';
import { AUTHORITY_ID, formatMessageId, type MessageId, type NodeId } from '../domain/ids';
import type { Message, Payload } from '../domain/message';
import type { CredentialKind, MessageClass } from '../domain/mode';
import { MODE_POLICIES } from '../domain/mode';
import type { MessageView, Node, NodeDetail, NodeView } from '../domain/node';
import type { MetricsView, Snapshot } from '../domain/snapshot';
import { ALL_CLASSES, createMetrics, histogramMedian } from '../metrics/metrics';
import { createPrng } from '../prng';
import { buildAuthorityMessage, queueAuthorityMessage } from './authority';
import { type EngineState, newSink, refreshTopology, registerMessage, type Sink } from './state';
import { doTick } from './tick';
import { acceptRequest, eligibleResponders, queueClose } from './transactions';
import { generateNodes } from './world';

export interface TickResult {
  tick: number;
  transits: TransitEvent[];
  events: SimEvent[];
}

export interface TimedCommand {
  tick: number;
  command: Command;
}

const MAX_MESSAGE_VIEWS = 500;
const MAX_TRANSACTION_VIEWS = 500;
const NODE_LOG_CAP = 100;
const CANNED_TEXTS = ['Help needed', 'Request', 'Anyone available?', 'Can someone help?'];
const CREDENTIAL_KINDS: CredentialKind[] = ['citizen', 'relay', 'authority', 'none'];

/** Array.push(...items) overflows the call stack for very large batches. */
function pushAll<T>(target: T[], items: readonly T[]): void {
  for (const item of items) target.push(item);
}

const mergeEngineConfig = (cfg?: Partial<EngineConfig>): EngineConfig => ({
  ...DEFAULT_ENGINE_CONFIG,
  ...cfg,
  mobility: { ...DEFAULT_ENGINE_CONFIG.mobility, ...cfg?.mobility },
});

function createState(world: WorldConfig, engineConfig: EngineConfig): EngineState {
  const worldConfig: WorldConfig = { ...world, range: { ...world.range } };
  const prng = createPrng(worldConfig.seed);
  const state: EngineState = {
    tick: 0,
    nodes: generateNodes(worldConfig, prng),
    adjacency: { edges: [], neighbours: new Map(), version: 0 },
    components: {
      nodeToComponent: new Map(),
      componentCount: 0,
      componentSizes: [],
      authorityReachableComponentIds: new Set(),
    },
    adjacencyDirty: true,
    worldConfig,
    engineConfig,
    prng,
    cellsUp: true,
    gridUp: true,
    messageRegistry: new Map(),
    messageVersion: 0,
    messageSeq: 1,
    packetSeq: 1,
    pendingAuthority: [],
    txMap: new Map(),
    declarations: [],
    authorityReceived: [],
    authoritySeen: new Set(),
    metrics: createMetrics(),
    transitRing: [],
  };
  refreshTopology(state);
  return state;
}

function nodeLogLine(e: SimEvent): [NodeId, string] | null {
  switch (e.type) {
    case 'ORIGINATED':
      return e.originId === AUTHORITY_ID ? null : [e.originId, `ORIGINATED ${e.class} ${e.msgId}`];
    case 'DELIVERED':
      return [e.to, `DELIVERED ${e.class} ${e.msgId} hop ${e.hop}`];
    case 'DROPPED':
      return [e.at, `DROPPED ${e.reason} ${e.class} ${e.msgId} hop ${e.hop}`];
    case 'STORED':
      return [e.at, `STORED ${e.class} ${e.msgId}`];
    case 'STORE_FLUSHED':
      return [e.from, `STORE_FLUSHED ${e.class} ${e.msgId} -> ${e.to}`];
    case 'MODE_CHANGED':
      return [e.nodeId, `MODE ${e.from} -> ${e.to} (${e.source})`];
    case 'AUTHORITY_INJECTED':
      return [e.to, `AUTHORITY_INJECTED ${e.msgId}`];
    default:
      return null;
  }
}

export class SimEngine {
  private state: EngineState;
  private snapshot_: Snapshot | null = null;
  private subscribers: Array<() => void> = [];
  private eventLog: SimEvent[] = [];
  private recentEvents: SimEvent[] = [];
  private commandLog: TimedCommand[] = [];
  private nodeLogs = new Map<NodeId, string[]>();
  private lastStepTransits: TransitEvent[] = [];
  private messagesCache: { version: number; views: MessageView[] } | null = null;

  constructor(world: WorldConfig, cfg?: Partial<EngineConfig>) {
    this.state = createState(world, mergeEngineConfig(cfg));
  }

  /** Time travel via determinism. Applies commands with `tick <= untilTick`, stepping in between. */
  static replay(
    world: WorldConfig,
    commandLog: ReadonlyArray<Command | TimedCommand>,
    untilTick: number,
    cfg?: Partial<EngineConfig>,
  ): SimEngine {
    const engine = new SimEngine(world, cfg);
    for (const entry of commandLog) {
      if ('command' in entry) {
        if (entry.tick > untilTick) break;
        while (engine.tick < entry.tick) engine.step(1);
        engine.dispatch(entry.command);
      } else {
        engine.dispatch(entry);
      }
    }
    while (engine.tick < untilTick) engine.step(1);
    return engine;
  }

  get tick(): number {
    return this.state.tick;
  }

  step(n: number = 1): TickResult {
    const events: SimEvent[] = [];
    const transits: TransitEvent[] = [];

    for (let i = 0; i < n; i++) {
      this.state.tick++;
      const sink = doTick(this.state);
      pushAll(events, sink.events);
      pushAll(transits, sink.transits);
    }

    this.recordEvents(events);
    this.lastStepTransits = transits;
    this.invalidate();
    return { tick: this.state.tick, transits, events };
  }

  dispatch(cmd: Command): void {
    const sink = newSink();
    // a reset starts a new run: its COMMAND event is the first event of tick 0
    const tick = cmd.type === 'RESET_WORLD' ? 0 : this.state.tick;
    sink.events.push({ type: 'COMMAND', tick, command: cmd });
    this.apply(cmd, sink);
    this.commandLog.push({ tick: this.state.tick, command: cmd });
    refreshTopology(this.state, sink);
    this.recordEvents(sink.events);
    this.lastStepTransits = [];
    this.invalidate();
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.push(fn);
    return () => {
      const idx = this.subscribers.indexOf(fn);
      if (idx >= 0) this.subscribers.splice(idx, 1);
    };
  }

  getSnapshot(): Snapshot {
    this.snapshot_ ??= this.buildSnapshot();
    return this.snapshot_;
  }

  getNodeDetail(id: NodeId): NodeDetail {
    const node = this.state.nodes.get(id);
    if (!node) throw new Error(`Node not found: ${id}`);

    const inbox = [...node.inbox, ...node.nextInbox].map((p) => {
      const msg = this.state.messageRegistry.get(p.msgId)!;
      const requestId = msg.payload.kind === 'REQUEST' ? msg.id : undefined;
      return this.messageView(msg, {
        hop: p.hop,
        ttlRemaining: Math.max(0, msg.ttlTicks - (this.state.tick - msg.createdTick)),
        status: requestId && node.requestView.get(requestId)?.status,
      });
    });

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
      inbox,
      store: node.store.map((s) => ({
        msgId: s.msgId,
        hop: s.packet.hop,
        class: this.state.messageRegistry.get(s.msgId)?.class ?? 'INFO',
      })),
      requestView: Array.from(node.requestView, ([msgId, v]) => ({
        msgId,
        status: v.status,
        hop: v.hop,
      })),
      nodeLog: [...(this.nodeLogs.get(id) ?? [])],
    };
  }

  getEventLog(): SimEvent[] {
    return this.eventLog;
  }

  /** Commands only (legacy shape). Use getTimedCommandLog() for replay. */
  getCommandLog(): Command[] {
    return this.commandLog.map((c) => c.command);
  }

  getTimedCommandLog(): TimedCommand[] {
    return [...this.commandLog];
  }

  /** Transits of a tick still in the ring buffer (last 64 ticks); [] otherwise. */
  getTransits(tick: number): TransitEvent[] {
    return this.state.transitRing.find((r) => r.tick === tick)?.transits ?? [];
  }

  // --- internals ---------------------------------------------------------------------------

  private invalidate(): void {
    this.snapshot_ = null;
    for (const fn of [...this.subscribers]) fn();
  }

  private recordEvents(events: SimEvent[]): void {
    pushAll(this.eventLog, events);
    pushAll(this.recentEvents, events);
    const { recentEventsCap, eventLogCap } = this.state.engineConfig;
    if (this.recentEvents.length > recentEventsCap) {
      this.recentEvents.splice(0, this.recentEvents.length - recentEventsCap);
    }
    // amortised trim: bounds memory in long demos without a splice per event
    if (this.eventLog.length > eventLogCap * 1.25) {
      this.eventLog.splice(0, this.eventLog.length - eventLogCap);
    }

    for (const e of events) {
      const line = nodeLogLine(e);
      if (!line) continue;
      const log = this.nodeLogs.get(line[0]) ?? [];
      log.push(`t${e.tick} ${line[1]}`);
      if (log.length > NODE_LOG_CAP) log.shift();
      this.nodeLogs.set(line[0], log);
    }
  }

  private reset(world: WorldConfig): void {
    this.state = createState(world, this.state.engineConfig);
    this.eventLog = [];
    this.recentEvents = [];
    this.commandLog = [];
    this.nodeLogs = new Map();
    this.lastStepTransits = [];
    this.messagesCache = null;
  }

  private makeMessage(
    node: Node,
    cls: MessageClass,
    payload: Payload,
    over: Partial<Message> = {},
  ): void {
    const policy = MODE_POLICIES[node.mode];
    const seq = this.state.messageSeq++;
    const msg: Message = {
      id: formatMessageId(node.id, seq),
      seq,
      class: cls,
      payload,
      originId: node.id,
      signer: { nodeId: node.id, credentialKind: node.credential.kind, valid: true },
      createdTick: this.state.tick,
      ttlTicks: policy.ttlTicks,
      hopLimit: policy.hopLimit,
      ...over,
    };
    registerMessage(this.state, msg);
    node.pendingOriginations.push(msg);
  }

  private apply(cmd: Command, sink: Sink): void {
    const { state } = this;
    switch (cmd.type) {
      case 'RESET_WORLD':
        this.reset(cmd.world);
        break;

      case 'SET_CELLS_UP':
        state.cellsUp = cmd.up;
        break;

      case 'SET_GRID_UP':
        state.gridUp = cmd.up;
        break;

      case 'MOVE_NODE': {
        const node = state.nodes.get(cmd.nodeId);
        if (node) {
          node.x = Math.max(0, Math.min(state.worldConfig.width, cmd.x));
          node.y = Math.max(0, Math.min(state.worldConfig.height, cmd.y));
          state.adjacencyDirty = true;
        }
        break;
      }

      case 'SET_NODE_POWERED': {
        const node = state.nodes.get(cmd.nodeId);
        if (node) node.poweredOverride = cmd.powered;
        break;
      }

      case 'SET_MOBILITY':
        state.engineConfig.mobility.enabled = cmd.enabled;
        if (cmd.stepMetres !== undefined) state.engineConfig.mobility.stepMetres = cmd.stepMetres;
        break;

      case 'SET_CONFIG': {
        const cfg = state.engineConfig as unknown as Record<string, unknown>;
        for (const [key, value] of Object.entries(cmd.patch)) {
          if (!(key in cfg)) continue;
          if (key === 'mobility' && typeof value === 'object' && value !== null) {
            Object.assign(state.engineConfig.mobility, value);
          } else if (typeof value === typeof cfg[key]) {
            cfg[key] = value;
          }
        }
        break;
      }

      case 'SET_RANGE':
        state.worldConfig.range[cmd.kind] = cmd.range;
        for (const node of state.nodes.values()) if (node.kind === cmd.kind) node.range = cmd.range;
        state.adjacencyDirty = true;
        break;

      case 'SET_PARTICIPATION': {
        const f = Math.max(0, Math.min(1, cmd.fraction));
        let i = 0;
        for (const node of state.nodes.values()) {
          if (node.kind !== 'mobile') continue;
          node.participating = Math.floor((i + 1) * f + 1e-9) > Math.floor(i * f + 1e-9);
          i++;
        }
        state.adjacencyDirty = true;
        break;
      }

      case 'DECLARE_MODE': {
        if (cmd.level === 'PEACE') {
          this.apply({ type: 'ALL_CLEAR', region: cmd.region, forged: cmd.forged }, sink);
          break;
        }
        const duration = cmd.durationTicks ?? state.engineConfig.declarationDurationTicks;
        const untilTick = state.tick + duration;
        const msg = buildAuthorityMessage(
          state,
          'MODE_DECLARATION',
          { kind: 'MODE_DECLARATION', level: cmd.level, untilTick },
          { forged: cmd.forged, region: cmd.region, ttlTicks: duration },
        );
        state.declarations.push({
          id: msg.id,
          level: cmd.level,
          issuedAtTick: state.tick,
          untilTick,
          forged: cmd.forged === true,
          region: cmd.region,
        });
        queueAuthorityMessage(state, msg);
        break;
      }

      case 'ALL_CLEAR': {
        const msg = buildAuthorityMessage(
          state,
          'MODE_DECLARATION',
          { kind: 'MODE_DECLARATION', level: 'ALL_CLEAR', untilTick: state.tick },
          { forged: cmd.forged, region: cmd.region },
        );
        if (!cmd.forged) {
          const clear = cmd.region;
          state.declarations = state.declarations.filter(
            (d) =>
              clear !== undefined &&
              !(
                d.region !== undefined &&
                Math.hypot(d.region.centerX - clear.centerX, d.region.centerY - clear.centerY) <=
                  clear.radiusMtres
              ),
          );
        }
        queueAuthorityMessage(state, msg);
        break;
      }

      case 'BROADCAST_ALERT':
        queueAuthorityMessage(
          state,
          buildAuthorityMessage(
            state,
            'OFFICIAL_ALERT',
            { kind: 'ALERT', text: cmd.text },
            { forged: cmd.forged, region: cmd.region },
          ),
        );
        break;

      case 'SEND_REQUEST': {
        const node = state.nodes.get(cmd.from);
        if (!node?.alive) break;
        const text = cmd.payload?.text ?? cmd.text ?? '';
        const category = cmd.payload?.category ?? cmd.category;
        const price = cmd.payload?.price ?? cmd.price;
        const claimed = cmd.forge?.claimKind as CredentialKind | undefined;
        this.makeMessage(
          node,
          cmd.class,
          {
            kind: 'REQUEST',
            text,
            ...(category === undefined ? {} : { category }),
            ...(price === undefined ? {} : { price }),
          },
          {
            ...(cmd.hopLimit === undefined ? {} : { hopLimit: cmd.hopLimit }),
            ...(cmd.region ? { region: cmd.region } : {}),
            ...(cmd.forge
              ? {
                  signer: {
                    nodeId: node.id,
                    credentialKind:
                      claimed && CREDENTIAL_KINDS.includes(claimed) ? claimed : 'citizen',
                    valid: false,
                  },
                }
              : {}),
          },
        );
        break;
      }

      case 'SEND_CHECK_IN': {
        const node = state.nodes.get(cmd.from);
        if (node?.alive)
          this.makeMessage(node, 'CHECK_IN', { kind: 'CHECK_IN', status: cmd.status });
        break;
      }

      case 'SEND_RANDOM_REQUEST': {
        const from = cmd.from ?? this.pickRandom(this.citizenPhones().map((n) => n.id));
        const node = from ? state.nodes.get(from) : undefined;
        if (!node?.alive) break;
        const policy = MODE_POLICIES[node.mode];
        const classes: MessageClass[] =
          node.mode === 'PEACE'
            ? policy.originClasses
            : [...policy.originClasses, 'LIFE_CRITICAL', 'LIFE_CRITICAL', 'LIFE_CRITICAL'];
        const cls = state.prng.pick(classes);
        const text = state.prng.pick(CANNED_TEXTS);
        this.makeMessage(node, cls, { kind: 'REQUEST', text });
        break;
      }

      case 'ACCEPT': {
        const node = state.nodes.get(cmd.nodeId);
        if (node) acceptRequest(state, node, cmd.requestId);
        break;
      }

      case 'AUTO_RESPOND':
        this.autoRespond(cmd.requestId, cmd.strategy, sink);
        break;

      case 'CLOSE': {
        const requester = state.nodes.get(state.txMap.get(cmd.requestId)?.originId as NodeId);
        if (requester?.alive) queueClose(state, requester, cmd.requestId);
        break;
      }
    }
  }

  private citizenPhones(): Node[] {
    return Array.from(this.state.nodes.values()).filter(
      (n) => n.kind === 'mobile' && n.alive && n.credential.kind === 'citizen',
    );
  }

  private pickRandom(ids: NodeId[]): NodeId | undefined {
    return ids.length > 0 ? this.state.prng.pick(ids) : undefined;
  }

  private autoRespond(
    requestId: MessageId | undefined,
    strategy: 'nearest-hops' | 'random',
    sink: Sink,
  ): void {
    const { state } = this;
    const candidates = requestId
      ? [requestId]
      : Array.from(state.txMap.values())
          .filter((tx) => tx.status === 'open')
          .map((tx) => tx.requestId);

    const target = candidates
      .map((id) => ({ id, eligible: eligibleResponders(state, id) }))
      .find((c) => c.eligible.length > 0);

    if (!target) {
      if (candidates[0]) {
        sink.events.push({ type: 'AUTO_RESPOND_NONE', tick: state.tick, requestId: candidates[0] });
      }
      return;
    }

    const hopOf = (n: Node) => n.requestView.get(target.id)?.hop ?? Number.MAX_SAFE_INTEGER;
    const chosen =
      strategy === 'random'
        ? state.prng.pick(target.eligible)
        : [...target.eligible].sort(
            (a, b) => hopOf(a) - hopOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
          )[0]!;
    acceptRequest(state, chosen, target.id);
  }

  private messageView(
    msg: Message,
    over: { hop?: number; ttlRemaining?: number; status?: string | false | undefined } = {},
  ): MessageView {
    const unbounded = !Number.isFinite(msg.hopLimit);
    return {
      id: msg.id,
      class: msg.class,
      originId: msg.originId,
      hop: over.hop ?? 0,
      hopLimit: unbounded ? Number.MAX_SAFE_INTEGER : msg.hopLimit,
      unbounded,
      ttlRemaining: over.ttlRemaining ?? msg.ttlTicks,
      createdTick: msg.createdTick,
      ttlTicks: msg.ttlTicks,
      ...(over.status ? { status: over.status } : {}),
    };
  }

  private buildSnapshot(): Snapshot {
    const { state } = this;

    if (this.messagesCache?.version !== state.messageVersion) {
      this.messagesCache = {
        version: state.messageVersion,
        views: Array.from(state.messageRegistry.values())
          .slice(-MAX_MESSAGE_VIEWS)
          .map((m) => this.messageView(m)),
      };
    }

    const nodes: NodeView[] = Array.from(state.nodes.values(), (node) => ({
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
      componentId: state.components.nodeToComponent.get(node.id) ?? -1,
      neighbourCount: node.neighbourIds.length,
      inboxSize: node.inbox.length + node.nextInbox.length,
      storeSize: node.store.length,
      openRequests: Array.from(node.requestView.values()).filter((v) => v.status === 'open').length,
    }));

    return {
      tick: state.tick,
      world: {
        seed: state.worldConfig.seed,
        width: state.worldConfig.width,
        height: state.worldConfig.height,
        cellsUp: state.cellsUp,
        gridUp: state.gridUp,
        mobility: { ...state.engineConfig.mobility },
      },
      nodes,
      edges: state.adjacency.edges,
      transits: this.lastStepTransits,
      messages: this.messagesCache.views,
      transactions: Array.from(state.txMap.values())
        .slice(-MAX_TRANSACTION_VIEWS)
        .map((tx) => ({
          requestId: tx.requestId,
          status: tx.status,
          originId: tx.originId,
          ...(tx.acceptedBy ? { acceptedBy: tx.acceptedBy } : {}),
        })),
      declarations: state.declarations
        .filter((d) => !d.forged && d.untilTick > state.tick && d.level !== 'ALL_CLEAR')
        .map((d) => ({
          id: d.id,
          level: d.level as 'L1' | 'L2' | 'L3',
          untilTick: d.untilTick,
          forged: d.forged,
          ...(d.region ? { region: d.region } : {}),
        })),
      authority: { received: state.authorityReceived.map((r) => ({ ...r })) },
      metrics: this.buildMetrics(),
      recentEvents: [...this.recentEvents],
    };
  }

  private buildMetrics(): MetricsView {
    const { state } = this;
    const { components, metrics } = state;
    const alive = Array.from(state.nodes.values()).filter((n) => n.alive).length;
    const largest = Math.max(0, ...components.componentSizes);
    const authoritySide = Array.from(components.authorityReachableComponentIds).reduce(
      (sum, id) => sum + (components.componentSizes[id] ?? 0),
      0,
    );
    const lastRing = state.transitRing[state.transitRing.length - 1];

    const byClass = Object.fromEntries(
      ALL_CLASSES.map((c) => [c, { ...metrics.byClass.get(c)! }]),
    ) as MetricsView['byClass'];

    return {
      reachableFraction: alive > 0 ? largest / alive : 0,
      authorityReachableFraction: alive > 0 ? authoritySide / alive : 0,
      componentCount: components.componentCount,
      storedTotal: Array.from(state.nodes.values()).reduce((sum, n) => sum + n.store.length, 0),
      transitsThisTick: lastRing?.tick === state.tick ? lastRing.transits.length : 0,
      deliveriesByClass: Object.fromEntries(
        ALL_CLASSES.map((c) => [c, byClass[c].deliveries]),
      ) as MetricsView['deliveriesByClass'],
      byClass,
      dropsByReason: Object.fromEntries(
        Array.from(metrics.dropsByReason).sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
      medianHops: histogramMedian(metrics.hopHistogram),
      medianLatency: histogramMedian(metrics.latencyHistogram),
    };
  }
}

export function createEngine(world: WorldConfig, cfg?: Partial<EngineConfig>): SimEngine {
  return new SimEngine(world, cfg);
}
