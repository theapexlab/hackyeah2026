import type { DropReason } from '../domain/events';
import type { MessageId, NodeId } from '../domain/ids';
import type { Message, Packet } from '../domain/message';
import type { ModePolicy } from '../domain/mode';
import { MODE_POLICIES } from '../domain/mode';
import type { CredentialKind, Node } from '../domain/node';
import { insideCircle } from '../graph/distance';
import { classAllowedToRelay, isPriced, isRelayOnlyClass } from './classes';
import { verifySigner } from './trust';

/** Everything about the receiving node that the forwarding decision needs. */
export interface DecisionContext {
  readonly tick: number;
  /** Policy of the receiving node's CURRENT mode (MODE_POLICIES[node.mode]). */
  readonly policy: ModePolicy;
  readonly nodeId: NodeId;
  readonly credentialKind: CredentialKind;
  /** Message ids this node has already processed. Never mutated by decide(). */
  readonly seen: ReadonlySet<MessageId>;
  readonly x: number;
  readonly y: number;
}

/** Outcome of the per-packet decision: accept (and whether to act on it) or drop with a reason. */
export type Verdict =
  | { readonly ok: true; readonly deliverLocally: boolean }
  | { readonly ok: false; readonly reason: DropReason };

/** Build a DecisionContext from a node (convenience for the engine and tests). */
export function decisionContextFor(node: Node, tick: number): DecisionContext {
  return {
    tick,
    policy: MODE_POLICIES[node.mode],
    nodeId: node.id,
    credentialKind: node.credential.kind,
    seen: node.seen,
    x: node.x,
    y: node.y,
  };
}

/**
 * The forwarding decision from docs/diagrams/06-forwarding-decision.mmd, as one pure
 * function. Branch order is load-bearing (tests pin it):
 *
 *   (a) signature/rights          -> UNVERIFIABLE
 *   (b) id seen before            -> DUPLICATE
 *   (c) relay signer, non-relay class -> RELAY_CANNOT_ACT
 *       (under the current trust table (a) already rejects this; the branch stays so
 *        the diagram maps 1:1 and survives a looser trust table)
 *   (d) class vs mode policy      -> CLASS_NOT_ALLOWED, then PRICED_IN_EMERGENCY
 *   (e) TTL, then hop limit       -> TTL_EXPIRED, HOP_LIMIT
 *   (f) citizen REQUEST outside its region -> OUT_OF_REGION
 *   (g) ok; deliverLocally says whether THIS node acts on the payload:
 *       RESPONSE only at its target, REQUEST and CLOSE only for citizens (the only nodes
 *       that hold request views; relays and unregistered phones just forward them),
 *       declarations and alerts only inside their region (outside: still forwarded),
 *       everything else yes.
 *
 * Rate limiting (diagram step H) is a no-op in the simulation. NO_ROUTE, CONGESTION and
 * NODE_DOWN are decided by the engine, not here.
 */
export function decide(ctx: DecisionContext, msg: Message, packet: Packet): Verdict {
  // (a)
  if (!verifySigner(msg.signer, msg.class)) return { ok: false, reason: 'UNVERIFIABLE' };
  // (b)
  if (ctx.seen.has(msg.id)) return { ok: false, reason: 'DUPLICATE' };
  // (c)
  if (msg.signer.credentialKind === 'relay' && !isRelayOnlyClass(msg.class)) {
    return { ok: false, reason: 'RELAY_CANNOT_ACT' };
  }
  // (d)
  if (!classAllowedToRelay(ctx.policy, msg.class)) {
    return { ok: false, reason: 'CLASS_NOT_ALLOWED' };
  }
  if (isPriced(msg) && !ctx.policy.paymentsAllowed) {
    return { ok: false, reason: 'PRICED_IN_EMERGENCY' };
  }
  // (e)
  if (msg.createdTick + msg.ttlTicks < ctx.tick) return { ok: false, reason: 'TTL_EXPIRED' };
  if (packet.hop > msg.hopLimit) return { ok: false, reason: 'HOP_LIMIT' };
  // (f)
  const region = msg.region;
  const inRegion = region === undefined || insideCircle(ctx.x, ctx.y, region);
  const payload = msg.payload;
  if (!inRegion && payload.kind === 'REQUEST') return { ok: false, reason: 'OUT_OF_REGION' };
  // (g)
  switch (payload.kind) {
    case 'RESPONSE':
      return { ok: true, deliverLocally: ctx.nodeId === payload.targetId };
    case 'REQUEST':
    case 'CLOSE':
      return { ok: true, deliverLocally: ctx.credentialKind === 'citizen' };
    case 'MODE_DECLARATION':
    case 'ALERT':
      return { ok: true, deliverLocally: inRegion };
    default:
      return { ok: true, deliverLocally: true };
  }
}
