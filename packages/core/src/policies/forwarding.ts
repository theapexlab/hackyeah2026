/**
 * Forwarding decision logic.
 * Implements diagram 06: the decision tree for accepting/dropping messages.
 */

import type { DropReason } from '../domain/events';
import type { Message, Packet } from '../domain/message';
import type { Node } from '../domain/node';
import { arePaymentsAllowed, isClassAllowed, isPriced } from './classes';
import { isTrusted } from './trust';

export interface DecideContext {
  receiverNode: Node;
  receiverMode: 'PEACE' | 'L1' | 'L2' | 'L3';
}

export interface DecideResult {
  drop: boolean;
  dropReason?: DropReason;
  deliverLocally: boolean;
}

export function decide(msg: Message, packet: Packet, ctx: DecideContext): DecideResult {
  // 1. Verify signature
  if (!isTrusted(msg.signer)) {
    return { drop: true, dropReason: 'UNVERIFIABLE', deliverLocally: false };
  }

  // 2. Check for duplicate
  if (ctx.receiverNode.seen.has(msg.id)) {
    return { drop: true, dropReason: 'DUPLICATE', deliverLocally: false };
  }

  // 3. Relay cannot originate non-topology messages
  if (
    msg.signer.credentialKind === 'relay' &&
    msg.class !== 'TOPOLOGY' &&
    msg.class !== 'PORTAL_SUMMARY'
  ) {
    return { drop: true, dropReason: 'RELAY_CANNOT_ACT', deliverLocally: false };
  }

  // 4. Class not allowed in current mode
  if (!isClassAllowed(msg.class, ctx.receiverMode)) {
    return { drop: true, dropReason: 'CLASS_NOT_ALLOWED', deliverLocally: false };
  }

  // 5. Check pricing policy
  if (isPriced(msg.payload) && !arePaymentsAllowed(ctx.receiverMode)) {
    return { drop: true, dropReason: 'PRICED_IN_EMERGENCY', deliverLocally: false };
  }

  // 6. Check TTL
  if (packet.hop > msg.ttlTicks) {
    return { drop: true, dropReason: 'TTL_EXPIRED', deliverLocally: false };
  }

  // 7. Check hop limit
  if (packet.hop > msg.hopLimit) {
    return { drop: true, dropReason: 'HOP_LIMIT', deliverLocally: false };
  }

  // 8. Check region constraint (only applies to some message types)
  if (msg.region && (msg.class === 'MODE_DECLARATION' || msg.class === 'OFFICIAL_ALERT')) {
    // Regional deliveries are handled below in local delivery determination
  }

  // Message passes all checks
  // Determine local delivery based on message type
  let deliverLocally = false;

  // RESPONSE: deliver locally only if receiver is the target
  if (msg.payload.kind === 'RESPONSE') {
    if (ctx.receiverNode.id === msg.payload.targetId) {
      deliverLocally = true;
    }
  }

  // CLOSE: deliver locally only if receiver is the target
  if (msg.payload.kind === 'CLOSE') {
    deliverLocally = false; // CLOSE is for transaction state, not delivered locally
  }

  // Declarations: deliver locally if in region
  if (msg.class === 'MODE_DECLARATION' || msg.class === 'OFFICIAL_ALERT') {
    if (msg.region) {
      const dx = ctx.receiverNode.x - msg.region.centerX;
      const dy = ctx.receiverNode.y - msg.region.centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      deliverLocally = dist <= msg.region.radiusMtres;
    } else {
      deliverLocally = true;
    }
  }

  // CHECK_IN: deliver locally if node has backhaul
  if (msg.class === 'CHECK_IN') {
    if (ctx.receiverNode.hasBackhaul) {
      deliverLocally = true;
    }
  }

  // LIFE_CRITICAL, SAFETY, INFO, etc: deliver locally always
  if (
    ['LIFE_CRITICAL', 'SAFETY', 'INFO', 'CHECK_IN', 'LEND', 'BORROW', 'GIVE', 'SELL'].includes(
      msg.class,
    )
  ) {
    deliverLocally = true;
  }

  return { drop: false, deliverLocally };
}
