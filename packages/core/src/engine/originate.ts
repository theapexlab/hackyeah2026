import { AUTHORITY_ID, makeMessageId } from '../domain/ids';
import type { Circle, Message, MessageClass, Payload, Signer } from '../domain/message';
import { MODE_POLICIES, ttlFor, UNBOUNDED_CLASSES } from '../domain/mode';
import type { Node } from '../domain/node';
import { isAuthorityClass } from '../policies/classes';
import type { EngineState } from './state';
import { globalMode } from './state';

/** Optional overrides when creating a message. */
export interface OriginateOptions {
  /** Requested hop limit; clamped to the origin policy's maxHopLimit. */
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
 * hopLimit = min(opts.hopLimit ?? policy.hopLimit, policy.maxHopLimit), or
 * POSITIVE_INFINITY for authority / unbounded classes. The policy is the origin node's
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
  const hopLimit = unbounded
    ? Number.POSITIVE_INFINITY
    : Math.min(opts.hopLimit ?? policy.hopLimit, policy.maxHopLimit);
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
