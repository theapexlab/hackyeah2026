/**
 * Authority message construction, injection and uplink handling.
 * The Authority is virtual: no position, no edges. Its messages enter the mesh only at alive
 * nodes with backhaul; uplinks (CHECK_IN, LIFE_CRITICAL) leave only at such nodes.
 */

import { AUTHORITY_ID, formatMessageId } from '../domain/ids';
import type { Circle, Message, Packet, Payload } from '../domain/message';
import type { MessageClass } from '../domain/mode';
import type { Node } from '../domain/node';
import { recordOriginated } from '../metrics/metrics';
import { type EngineState, registerMessage, type Sink } from './state';

export const AUTHORITY_TTL_TICKS = 300;

export function buildAuthorityMessage(
  state: EngineState,
  cls: MessageClass,
  payload: Payload,
  opts: { forged?: boolean; region?: Circle; ttlTicks?: number },
): Message {
  const seq = state.messageSeq++;
  return {
    id: formatMessageId(AUTHORITY_ID, seq),
    seq,
    class: cls,
    payload,
    originId: AUTHORITY_ID,
    signer: { nodeId: AUTHORITY_ID, credentialKind: 'authority', valid: !opts.forged },
    createdTick: state.tick,
    ttlTicks: opts.ttlTicks ?? AUTHORITY_TTL_TICKS,
    hopLimit: Infinity,
    region: opts.region,
  };
}

/** Queue for injection at the next tick (step 4), so transits and events belong to a tick. */
export function queueAuthorityMessage(state: EngineState, msg: Message): void {
  registerMessage(state, msg);
  state.pendingAuthority.push(msg);
}

export function injectPendingAuthority(state: EngineState, sink: Sink): void {
  const pending = state.pendingAuthority;
  state.pendingAuthority = [];
  for (const msg of pending) {
    recordOriginated(state.metrics, msg.class);
    sink.events.push({
      type: 'ORIGINATED',
      tick: state.tick,
      msgId: msg.id,
      class: msg.class,
      originId: AUTHORITY_ID,
    });
    for (const node of state.nodes.values()) {
      if (!node.alive || !node.hasBackhaul) continue;
      const packet: Packet = {
        msgId: msg.id,
        hop: 0,
        path: [],
        lastHop: null,
        seq: state.packetSeq++,
      };
      node.nextInbox.push(packet);
      sink.events.push({
        type: 'AUTHORITY_INJECTED',
        tick: state.tick,
        msgId: msg.id,
        to: node.id,
      });
      sink.transits.push({
        tick: state.tick,
        msgId: msg.id,
        class: msg.class,
        from: AUTHORITY_ID,
        to: node.id,
        hop: 0,
        via: 'authority-inject',
      });
    }
  }
}

export const isUplinkMessage = (msg: Message): boolean =>
  msg.payload.kind === 'CHECK_IN' ||
  (msg.payload.kind === 'REQUEST' && msg.class === 'LIFE_CRITICAL');

/** CHECK_IN / LIFE_CRITICAL requests at a backhaul node go to the Authority, deduplicated. */
export function recordAuthorityUplink(
  state: EngineState,
  sink: Sink,
  node: Node,
  msg: Message,
  hop: number,
): void {
  if (!node.hasBackhaul || !isUplinkMessage(msg) || state.authoritySeen.has(msg.id)) return;
  state.authoritySeen.add(msg.id);
  state.authorityReceived.push({ msgId: msg.id, tick: state.tick, via: 'uplink' });
  sink.events.push({ type: 'AUTHORITY_RECEIVED', tick: state.tick, msgId: msg.id, via: 'uplink' });
  sink.transits.push({
    tick: state.tick,
    msgId: msg.id,
    class: msg.class,
    from: node.id,
    to: AUTHORITY_ID,
    hop,
    via: 'uplink',
  });
}
