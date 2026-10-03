/**
 * Message class policies: what's allowed by mode, pricing rules.
 */

import type { Payload } from '../domain/message';
import type { MessageClass, Mode, ModePolicy } from '../domain/mode';
import { MODE_POLICIES } from '../domain/mode';

export function isClassAllowed(cls: MessageClass, mode: Mode): boolean {
  const policy = MODE_POLICIES[mode];
  return policy.relayClasses.includes(cls);
}

export function canOriginateClass(cls: MessageClass, mode: Mode): boolean {
  const policy = MODE_POLICIES[mode];
  return policy.originClasses.includes(cls);
}

export function isPriced(payload: Payload): boolean {
  if (payload.kind !== 'REQUEST' && payload.kind !== 'RESPONSE') {
    return false;
  }
  return payload.kind === 'REQUEST' && payload.price !== undefined && payload.price > 0;
}

export function arePaymentsAllowed(mode: Mode): boolean {
  return MODE_POLICIES[mode].paymentsAllowed;
}
