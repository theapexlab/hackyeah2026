/**
 * Forwarding decision logic.
 * Implements diagram 06: verify, dedup, relay-cannot-act, class vs mode, TTL / hop / region,
 * then local delivery. Pure: no state is mutated.
 */

import type { DropReason } from '../domain/events';
import type { Circle, Message, Packet } from '../domain/message';
import type { Mode } from '../domain/mode';
import type { Node } from '../domain/node';
import { arePaymentsAllowed, isClassAllowed, isPriced } from './classes';
import { isRelayOnlyClass, isTrusted } from './trust';

export interface DecideContext {
  receiverNode: Pick<Node, 'id' | 'x' | 'y' | 'seen' | 'credential' | 'hasBackhaul'>;
  receiverMode: Mode;
  tick: number;
}

export interface DecideResult {
  drop: boolean;
  dropReason?: DropReason;
  deliverLocally: boolean;
}

const dropped = (dropReason: DropReason): DecideResult => ({
  drop: true,
  dropReason,
  deliverLocally: false,
});

export function inRegion(region: Circle, x: number, y: number): boolean {
  return Math.hypot(x - region.centerX, y - region.centerY) <= region.radiusMtres;
}

export function decide(msg: Message, packet: Packet, ctx: DecideContext): DecideResult {
  const node = ctx.receiverNode;

  if (!isTrusted(msg.signer, msg.class)) return dropped('UNVERIFIABLE');
  if (node.seen.has(msg.id)) return dropped('DUPLICATE');
  if (msg.signer.credentialKind === 'relay' && !isRelayOnlyClass(msg.class)) {
    return dropped('RELAY_CANNOT_ACT');
  }
  if (!isClassAllowed(msg.class, ctx.receiverMode)) return dropped('CLASS_NOT_ALLOWED');
  if (isPriced(msg.payload) && !arePaymentsAllowed(ctx.receiverMode)) {
    return dropped('PRICED_IN_EMERGENCY');
  }
  if (ctx.tick - msg.createdTick > msg.ttlTicks) return dropped('TTL_EXPIRED');
  if (packet.hop > msg.hopLimit) return dropped('HOP_LIMIT');

  const insideRegion = !msg.region || inRegion(msg.region, node.x, node.y);
  if (!insideRegion && msg.payload.kind === 'REQUEST') return dropped('OUT_OF_REGION');

  const citizen = node.credential.kind === 'citizen';
  let deliverLocally: boolean;
  switch (msg.payload.kind) {
    case 'REQUEST':
    case 'CLOSE':
      deliverLocally = citizen;
      break;
    case 'RESPONSE':
      deliverLocally = node.id === msg.payload.targetId;
      break;
    case 'CHECK_IN':
      deliverLocally = node.hasBackhaul;
      break;
    default:
      deliverLocally = insideRegion; // ALERT / MODE_DECLARATION: always forwarded, delivered in region
  }
  return { drop: false, deliverLocally };
}
