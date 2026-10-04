import type { SimEvent } from '../domain/events';
import type { NodeId } from '../domain/ids';
import { AUTHORITY_ID } from '../domain/ids';
import type { MessageView } from '../domain/message';
import { toMessageView } from '../domain/message';
import type { InboxEntryView, Node, NodeDetail, NodeView, StoreEntryView } from '../domain/node';
import type { EdgeView, Snapshot } from '../domain/snapshot';
import type { TransactionView } from '../domain/transaction';
import type { EngineState } from './state';
import { globalMode } from './state';

/** Snapshot.messages holds at most this many (the newest). */
export const MESSAGE_VIEW_CAP = 500;

/** Memo for the snapshot sub-sections that keep their reference until their version bumps. */
export interface SnapshotCache {
  edgesVersion: number;
  edges: readonly EdgeView[];
  messagesVersion: number;
  messages: readonly MessageView[];
}

export function createSnapshotCache(): SnapshotCache {
  return { edgesVersion: -1, edges: [], messagesVersion: -1, messages: [] };
}

function nodeView(state: EngineState, node: Node): NodeView {
  let openRequests = 0;
  for (const entry of node.requestView.values()) if (entry.status === 'open') openRequests++;
  return {
    id: node.id,
    kind: node.kind,
    x: node.x,
    y: node.y,
    range: node.range,
    credentialKind: node.credential.kind,
    backhaul: node.backhaul,
    batteryBacked: node.batteryBacked,
    walker: node.walk !== null,
    poweredOverride: node.poweredOverride,
    alive: node.alive,
    wanUp: node.wanUp,
    hasBackhaul: node.hasBackhaul,
    mode: node.mode,
    modeSource: node.modeSource,
    declaredLevel: node.declared?.level ?? null,
    componentId: state.components.componentOf.get(node.id) ?? -1,
    neighbourCount: node.neighbourIds.length,
    inboxSize: node.inbox.length + node.nextInbox.length,
    storeSize: node.store.length,
    openRequests,
  };
}

function transactionView(state: EngineState): TransactionView[] {
  const out: TransactionView[] = [];
  for (const tx of state.transactions.values()) out.push({ ...tx });
  return out;
}

/**
 * Project the state into an immutable, JSON-safe Snapshot (plan A4). Nodes,
 * transactions, declarations, authority and recentEvents are rebuilt on every call;
 * `edges` is reused while adjacency.version is unchanged and `messages` while no message
 * was created. The caller (SimEngine) caches the whole snapshot between invalidations.
 */
export function buildSnapshot(state: EngineState, cache: SnapshotCache): Snapshot {
  if (cache.edgesVersion !== state.adjacency.version) {
    cache.edgesVersion = state.adjacency.version;
    cache.edges = state.adjacency.edges;
  }
  if (cache.messagesVersion !== state.messagesVersion) {
    cache.messagesVersion = state.messagesVersion;
    const tail =
      state.messageList.length > MESSAGE_VIEW_CAP
        ? state.messageList.slice(-MESSAGE_VIEW_CAP)
        : state.messageList;
    cache.messages = tail.map(toMessageView);
  }
  const cap = Math.max(0, state.config.recentEventsCap);
  const recentEvents = state.eventLog.slice(Math.max(0, state.eventLog.length - cap));
  return {
    tick: state.tick,
    world: {
      seed: state.world.seed,
      width: state.world.width,
      height: state.world.height,
      cellsUp: state.cellsUp,
      gridUp: state.gridUp,
      mobility: state.config.mobility.enabled,
      nodeCount: state.nodes.length,
    },
    terrain: state.terrain,
    globalMode: globalMode(state),
    nodes: state.nodes.map((n) => nodeView(state, n)),
    edges: cache.edges,
    transits: state.lastTick?.transits ?? [],
    messages: cache.messages,
    transactions: transactionView(state),
    declarations: state.declarations.map((d) => ({ ...d })),
    authority: {
      received: state.authority.received.map((r) => ({ ...r })),
      injected: state.authority.injected,
    },
    metrics: state.metrics.view(),
    recentEvents,
  };
}

/** True when the event mentions the node (origin, receiver, accepter, via or command target). */
export function eventTouchesNode(event: SimEvent, id: NodeId): boolean {
  switch (event.type) {
    case 'ORIGINATED':
    case 'DELIVERED':
    case 'DROPPED':
    case 'STORED':
    case 'MODE_CHANGED':
    case 'TX_OPENED':
    case 'TX_CLOSED':
      return event.nodeId === id;
    case 'STORE_FLUSHED':
      return event.nodeId === id || event.to === id;
    case 'TX_ACCEPTED':
      return event.nodeId === id || event.accepterId === id;
    case 'TX_RESPONSE_LATE':
      return event.nodeId === id || event.responderId === id;
    case 'AUTHORITY_RECEIVED':
      return event.via === id || id === AUTHORITY_ID;
    case 'AUTHORITY_INJECTED':
      return id === AUTHORITY_ID;
    case 'COMMAND': {
      const c = event.command;
      switch (c.type) {
        case 'SetNodePowered':
        case 'MoveNode':
        case 'Accept':
          return c.nodeId === id;
        case 'SetRange':
          return c.nodeId === id;
        case 'SendRequest':
        case 'SendCheckIn':
        case 'SendRandomRequest':
          return c.from === id;
        case 'DeclareMode':
        case 'AllClear':
        case 'BroadcastAlert':
          return id === AUTHORITY_ID;
        default:
          return false;
      }
    }
    case 'ADJACENCY':
    case 'AUTO_RESPOND_NONE':
      return false;
  }
}

/**
 * Inspector detail for one node: inbox (including packets already queued for the next
 * tick), store, request views and the events that mention it. An unknown id (or the
 * Authority id) yields empty inbox/store/requests; the Authority's log lists its own
 * injections, receipts and commands.
 */
export function buildNodeDetail(state: EngineState, id: NodeId): NodeDetail {
  const node = state.byId.get(id);
  const log = state.eventLog.filter((e) => eventTouchesNode(e, id));
  if (node === undefined) return { id, inbox: [], store: [], requests: [], seenCount: 0, log };
  const inbox: InboxEntryView[] = [];
  for (const packet of [...node.inbox, ...node.nextInbox]) {
    const msg = state.messages.get(packet.msgId);
    if (msg === undefined) continue;
    inbox.push({
      message: toMessageView(msg),
      hop: packet.hop,
      path: packet.path,
      lastHop: packet.lastHop,
    });
  }
  const store: StoreEntryView[] = [];
  for (const entry of node.store) {
    const msg = state.messages.get(entry.msgId);
    if (msg === undefined) continue;
    store.push({
      message: toMessageView(msg),
      hop: entry.packet.hop,
      storedTick: entry.storedTick,
      sentTo: [...entry.sentTo].sort(),
    });
  }
  return {
    id,
    inbox,
    store,
    requests: [...node.requestView.values()],
    seenCount: node.seen.size,
    log,
  };
}
