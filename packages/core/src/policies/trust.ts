/**
 * Trust verification (stub).
 * In reality, this would verify signatures and certificates.
 * For the demo, we check the signer.valid flag and the credential's permitted classes.
 * Relay credentials are exempt here: they are rejected later as RELAY_CANNOT_ACT.
 */

import type { Signer } from '../domain/message';
import type { MessageClass } from '../domain/mode';
import { canOriginate } from '../domain/mode';

export function isTrusted(signer: Signer, cls: MessageClass): boolean {
  if (!signer.valid) return false;
  return signer.credentialKind === 'relay' || canOriginate(signer.credentialKind, cls);
}

export function isRelayOnlyClass(cls: MessageClass): boolean {
  return cls === 'TOPOLOGY' || cls === 'PORTAL_SUMMARY';
}
