import type { TransitEvent } from '../domain/events';
import { AUTHORITY_ID } from '../domain/ids';
import type { Circle, Message, MessageClass, Payload } from '../domain/message';
import type { Node } from '../domain/node';
import { createMessage } from './originate';
import type { EngineState } from './state';
import { logEvent, nextPacketSeq } from './state';

/** Options for an Authority-originated message. */
export interface AuthorityMessageOptions {
  readonly region?: Circle;
  /** A forged message carries signer.valid = false; receivers drop it UNVERIFIABLE. */
  readonly forged?: boolean;
  readonly ttl?: number;
}

/** Create (but do not inject) a message signed by the Authority, or a forgery of one. */
export function createAuthorityMessage(
  state: EngineState,
  cls: MessageClass,
  payload: Payload,
  opts: AuthorityMessageOptions = {},
): Message {
  const base = {
    signer: { nodeId: AUTHORITY_ID, credentialKind: 'authority' as const, valid: !opts.forged },
  };
  const withTtl = opts.ttl === undefined ? base : { ...base, ttl: opts.ttl };
  const withRegion = opts.region === undefined ? withTtl : { ...withTtl, region: opts.region };
  return createMessage(state, 'authority', cls, payload, withRegion);
}

/**
 * Inject an Authority message: a hop-0 packet lands in the nextInbox of every alive node
 * with backhaul (FR-NET-10), each with a transit via 'authority-inject' from AUTHORITY_ID,
 * and AUTHORITY_INJECTED carries the count. Forged messages are injected too; every
 * receiver drops them UNVERIFIABLE. Called between ticks (from dispatch), so the transits
 * are stamped tick + 1: the tick whose TickResult will carry them. An injection is the
 * Authority's origination: it counts once in metrics.byClass[class].originated (so a
 * per-class delivery rate exists for alerts and declarations), even when nobody has
 * backhaul to receive it.
 */
export function inject(state: EngineState, msg: Message, transits: TransitEvent[]): number {
  state.metrics.onOriginated(msg.class);
  let count = 0;
  for (const node of state.nodes) {
    if (!node.alive || !node.hasBackhaul) continue;
    node.nextInbox.push({
      msgId: msg.id,
      hop: 0,
      path: [],
      lastHop: null,
      seq: nextPacketSeq(state),
    });
    transits.push({
      tick: state.tick + 1,
      msgId: msg.id,
      class: msg.class,
      from: AUTHORITY_ID,
      to: node.id,
      hop: 0,
      via: 'authority-inject',
    });
    count++;
  }
  state.authority.injected += 1;
  logEvent(state, {
    type: 'AUTHORITY_INJECTED',
    tick: state.tick,
    msgId: msg.id,
    class: msg.class,
    count,
  });
  return count;
}

/**
 * A backhaul node hands a verified authority-bound message up (FR-NET-13/14): deduplicated by
 * message id; the first receipt records it in state.authority.received, logs
 * AUTHORITY_RECEIVED and emits one transit via 'uplink' from the node to AUTHORITY_ID.
 * Returns false (no event, no transit) for a message the Authority already has.
 */
export function uplink(
  state: EngineState,
  node: Node,
  msg: Message,
  tick: number,
  transits: TransitEvent[],
  hop = 0,
): boolean {
  if (state.authority.receivedIds.has(msg.id)) return false;
  state.authority.receivedIds.add(msg.id);
  state.authority.received.push({
    msgId: msg.id,
    tick,
    via: node.id,
    class: msg.class,
    originId: msg.originId,
  });
  logEvent(state, {
    type: 'AUTHORITY_RECEIVED',
    tick,
    msgId: msg.id,
    via: node.id,
    class: msg.class,
  });
  transits.push({
    tick,
    msgId: msg.id,
    class: msg.class,
    from: node.id,
    to: AUTHORITY_ID,
    hop,
    via: 'uplink',
  });
  return true;
}

/** True for messages the Authority wants: check-ins and LIFE_CRITICAL requests. */
export function isAuthorityBound(msg: Message): boolean {
  return (
    msg.payload.kind === 'CHECK_IN' ||
    (msg.class === 'LIFE_CRITICAL' && msg.payload.kind === 'REQUEST')
  );
}
