import type { Message, MessageClass } from '../domain/message';
import type { ModePolicy } from '../domain/mode';

/** Forwarding priority: lower rank is processed and forwarded first (FR-NET-09). */
export const PRIORITY_RANK: Readonly<Record<MessageClass, number>> = {
  LIFE_CRITICAL: 0,
  OFFICIAL_ALERT: 1,
  MODE_DECLARATION: 1,
  SAFETY: 2,
  CHECK_IN: 3,
  LEND: 4,
  BORROW: 4,
  GIVE: 4,
  SELL: 4,
  INFO: 4,
  TOPOLOGY: 4,
  PORTAL_SUMMARY: 4,
};

/** Classes a citizen may put in a REQUEST. */
export const CITIZEN_REQUEST_CLASSES: readonly MessageClass[] = [
  'LEND',
  'BORROW',
  'GIVE',
  'SELL',
  'INFO',
  'LIFE_CRITICAL',
  'SAFETY',
];
/** Classes only the Authority originates. */
export const AUTHORITY_CLASSES: readonly MessageClass[] = ['OFFICIAL_ALERT', 'MODE_DECLARATION'];
/** Classes a relay certificate may originate. */
export const RELAY_ONLY_CLASSES: readonly MessageClass[] = ['TOPOLOGY', 'PORTAL_SUMMARY'];
/** Commerce classes that may carry a price. */
export const COMMERCE_CLASSES: readonly MessageClass[] = ['LEND', 'BORROW', 'GIVE', 'SELL'];

export function priorityOf(cls: MessageClass): number {
  return PRIORITY_RANK[cls];
}

/** Sort comparator: higher-priority class first. */
export function comparePriority(a: MessageClass, b: MessageClass): number {
  return PRIORITY_RANK[a] - PRIORITY_RANK[b];
}

export function isAuthorityClass(cls: MessageClass): boolean {
  return AUTHORITY_CLASSES.includes(cls);
}

export function isRelayOnlyClass(cls: MessageClass): boolean {
  return RELAY_ONLY_CLASSES.includes(cls);
}

/** True when the message is a request carrying a positive price. */
export function isPriced(msg: Pick<Message, 'payload'>): boolean {
  return msg.payload.kind === 'REQUEST' && (msg.payload.price ?? 0) > 0;
}

export function classAllowedToRelay(policy: ModePolicy, cls: MessageClass): boolean {
  return policy.relayClasses.includes(cls);
}

export function classAllowedToOriginate(policy: ModePolicy, cls: MessageClass): boolean {
  return policy.originClasses.includes(cls);
}
