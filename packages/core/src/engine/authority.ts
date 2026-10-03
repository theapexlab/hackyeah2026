/**
 * Authority message injection and uplink handling.
 */

import type { SimEvent, TransitEvent } from '../domain/events';
import type { NodeId } from '../domain/ids';
import { AUTHORITY_ID, formatMessageId } from '../domain/ids';
import type { Message, Packet } from '../domain/message';
import type { Mode } from '../domain/mode';
import type { Node } from '../domain/node';
import type { EngineState } from './state';

export interface AuthorityUplink {
  msgId: string;
  tick: number;
  via: 'uplink';
}

export function injectAuthorityMessage(
  state: EngineState,
  msg: Message,
  events: SimEvent[],
  transits: TransitEvent[],
): void {
  // Find all alive nodes with backhaul
  for (const node of state.nodes.values()) {
    if (node.alive && node.hasBackhaul) {
      const packet: Packet = {
        msgId: msg.id,
        hop: 0,
        path: [],
        lastHop: null,
        seq: state.messageSeq++,
      };

      node.nextInbox.push(packet);

      events.push({
        type: 'AUTHORITY_INJECTED',
        tick: state.tick,
        msgId: msg.id,
        to: node.id,
      });

      transits.push({
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

export function recordAuthorityUplink(
  nodeId: NodeId,
  msgId: string,
  tick: number,
): AuthorityUplink {
  return { msgId, tick, via: 'uplink' };
}
