import { AUTHORITY_ID, makeMessageId } from '../domain/ids';
import type { Circle, Message, MessageClass, Payload, Signer } from '../domain/message';
import { MODE_POLICIES, ttlFor, UNBOUNDED_CLASSES } from '../domain/mode';
import type { Node } from '../domain/node';
import { isAuthorityClass } from '../policies/classes';
import type { EngineState } from './state';
import { globalMode } from './state';

/** Optional overrides when creating a message. */
export interface OriginateOptions {
  /**
   * Requested hop limit; NaN counts as not requested; clamped to the origin policy's
   * maxHopLimit for REQUEST payloads only.
   */
  readonly hopLimit?: number;
  /** Lifetime in ticks; defaults to ttlFor(policy, class). */
  readonly ttl?: number;
  readonly region?: Circle;
  /** Replaces the honest signer (used for forgeries). */
  readonly signer?: Signer;
}

/**
 * Create and register a message. Assigns the next message seq, the id
 * `<originId>#<seq>`, createdTick = the current tick (the dispatch tick for commands),
 * ttl = opts.ttl ?? ttlFor(policy, class) and
 * hopLimit = opts.hopLimit ?? policy.hopLimit (NaN counts as not requested), clamped to
 * policy.maxHopLimit for REQUEST payloads only, or POSITIVE_INFINITY for authority /
 * unbounded classes. The policy is the origin node's
 * current mode policy; for the Authority it is the policy of the highest mode among
 * alive nodes. The message is appended to state.messages / messageList (bumping
 * messagesVersion) but NOT queued: call queueOrigination() or authority.inject().
 */
export function createMessage(
  state: EngineState,
  origin: Node | 'authority',
  cls: MessageClass,
  payload: Payload,
  opts: OriginateOptions = {},
): Message {
  const isAuthority = origin === 'authority';
  const originId = isAuthority ? AUTHORITY_ID : origin.id;
  const policy = MODE_POLICIES[isAuthority ? globalMode(state) : origin.mode];
  state.seq.message += 1;
  const seq = state.seq.message;
  const unbounded = isAuthorityClass(cls) || UNBOUNDED_CLASSES.includes(cls);
  // NaN counts as "not requested". Only a REQUEST is clamped to the origin policy's
  // maxHopLimit: a RESPONSE / CLOSE keeps the budget its caller derived from the request
  // (relays still apply their own mode cap in forwardOrStore).
  const requested =
    opts.hopLimit === undefined || Number.isNaN(opts.hopLimit) ? policy.hopLimit : opts.hopLimit;
  const cap = payload.kind === 'REQUEST' ? policy.maxHopLimit : Number.POSITIVE_INFINITY;
  const hopLimit = unbounded ? Number.POSITIVE_INFINITY : Math.min(requested, cap);
  const signer: Signer = opts.signer ?? {
    nodeId: originId,
    credentialKind: isAuthority ? 'authority' : origin.credential.kind,
    valid: true,
  };
  const base = {
    id: makeMessageId(originId, seq),
    seq,
    class: cls,
    payload,
    originId,
    signer,
    createdTick: state.tick,
    ttlTicks: opts.ttl ?? ttlFor(policy, cls),
    hopLimit,
  };
  const msg: Message = opts.region === undefined ? base : { ...base, region: opts.region };
  state.messages.set(msg.id, msg);
  state.messageList.push(msg);
  state.messagesVersion += 1;
  return msg;
}

/** Queue a message for origination at the node in the next tick's origination phase. */
export function queueOrigination(node: Node, msg: Message): void {
  node.pendingOriginations.push(msg);
}
