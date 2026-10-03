import type { MessageClass, Signer } from '../domain/message';
import type { CredentialKind } from '../domain/node';

/** Which classes each credential kind may originate (the trust stub replacing certificates). */
export const ORIGIN_RIGHTS: Readonly<Record<CredentialKind, readonly MessageClass[]>> = {
  authority: ['OFFICIAL_ALERT', 'MODE_DECLARATION'],
  citizen: [
    'LEND',
    'BORROW',
    'GIVE',
    'SELL',
    'INFO',
    'LIFE_CRITICAL',
    'SAFETY',
    'CHECK_IN',
    'TOPOLOGY',
  ],
  relay: ['TOPOLOGY', 'PORTAL_SUMMARY'],
  none: [],
};

/** True when a credential of `kind` may originate a message of `cls`. */
export function canOriginate(kind: CredentialKind, cls: MessageClass): boolean {
  return ORIGIN_RIGHTS[kind].includes(cls);
}

/** Stand-in for signature verification: the claim must be valid and the kind must have the right. */
export function verifySigner(signer: Signer, cls: MessageClass): boolean {
  return signer.valid && canOriginate(signer.credentialKind, cls);
}
