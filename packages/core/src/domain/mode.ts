/**
 * Mode policies and transitions.
 * L1/L2/L3 policy table from concept.md A6.
 */

export type Mode = 'PEACE' | 'L1' | 'L2' | 'L3';
export type MessageClass =
  | 'LEND'
  | 'BORROW'
  | 'GIVE'
  | 'SELL'
  | 'INFO'
  | 'LIFE_CRITICAL'
  | 'SAFETY'
  | 'CHECK_IN'
  | 'OFFICIAL_ALERT'
  | 'MODE_DECLARATION'
  | 'TOPOLOGY'
  | 'PORTAL_SUMMARY';

export type CredentialKind = 'citizen' | 'relay' | 'authority' | 'none';

export interface ModePolicy {
  label: string;
  originClasses: MessageClass[];
  relayClasses: MessageClass[];
  hopLimit: number;
  ttlTicks: number;
  storeAndForward: boolean;
  phoneTopologyGossip: boolean;
  paymentsAllowed: boolean;
  portalWrite: 'none' | 'check-in' | 'check-in+request';
  emission: 'normal' | 'reduced';
}

export const MODE_POLICIES: Record<Mode, ModePolicy> = {
  PEACE: {
    label: 'Peace',
    originClasses: ['LEND', 'BORROW', 'GIVE', 'SELL', 'INFO', 'LIFE_CRITICAL', 'SAFETY'],
    relayClasses: [
      'LEND',
      'BORROW',
      'GIVE',
      'SELL',
      'INFO',
      'LIFE_CRITICAL',
      'SAFETY',
      'CHECK_IN',
      'OFFICIAL_ALERT',
      'MODE_DECLARATION',
      'TOPOLOGY',
      'PORTAL_SUMMARY',
    ],
    hopLimit: 3,
    ttlTicks: 60,
    storeAndForward: false,
    phoneTopologyGossip: true,
    paymentsAllowed: true,
    portalWrite: 'none',
    emission: 'normal',
  },
  L1: {
    label: 'L1 Disruption',
    originClasses: ['LIFE_CRITICAL', 'SAFETY', 'CHECK_IN', 'INFO', 'GIVE'],
    relayClasses: [
      'LIFE_CRITICAL',
      'SAFETY',
      'CHECK_IN',
      'INFO',
      'GIVE',
      'OFFICIAL_ALERT',
      'MODE_DECLARATION',
      'TOPOLOGY',
      'PORTAL_SUMMARY',
    ],
    hopLimit: 10,
    ttlTicks: 200,
    storeAndForward: true,
    phoneTopologyGossip: true,
    paymentsAllowed: false,
    portalWrite: 'check-in',
    emission: 'normal',
  },
  L2: {
    label: 'L2 Disaster',
    originClasses: ['LIFE_CRITICAL', 'SAFETY', 'CHECK_IN', 'INFO', 'GIVE'],
    relayClasses: [
      'LIFE_CRITICAL',
      'SAFETY',
      'CHECK_IN',
      'INFO',
      'GIVE',
      'OFFICIAL_ALERT',
      'MODE_DECLARATION',
      'TOPOLOGY',
      'PORTAL_SUMMARY',
    ],
    hopLimit: 15,
    ttlTicks: 300,
    storeAndForward: true,
    phoneTopologyGossip: true,
    paymentsAllowed: false,
    portalWrite: 'check-in+request',
    emission: 'normal',
  },
  L3: {
    label: 'L3 Security',
    originClasses: ['LIFE_CRITICAL', 'SAFETY', 'CHECK_IN'],
    relayClasses: [
      'LIFE_CRITICAL',
      'SAFETY',
      'CHECK_IN',
      'OFFICIAL_ALERT',
      'MODE_DECLARATION',
      'TOPOLOGY',
      'PORTAL_SUMMARY',
    ],
    hopLimit: 6,
    ttlTicks: 120,
    storeAndForward: true,
    phoneTopologyGossip: false,
    paymentsAllowed: false,
    portalWrite: 'none',
    emission: 'reduced',
  },
};

export const MODE_LABELS: Record<Mode, string> = {
  PEACE: 'Peace',
  L1: 'L1 Disruption',
  L2: 'L2 Disaster',
  L3: 'L3 Security',
};

export const PRIORITY_RANK: Record<MessageClass, number> = {
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

/** Trust table: which credentials may originate which message classes. */
export const CREDENTIAL_ORIGINS: Record<CredentialKind, MessageClass[]> = {
  authority: ['OFFICIAL_ALERT', 'MODE_DECLARATION'],
  citizen: ['LEND', 'BORROW', 'GIVE', 'SELL', 'INFO', 'LIFE_CRITICAL', 'SAFETY', 'CHECK_IN'],
  relay: ['TOPOLOGY', 'PORTAL_SUMMARY'],
  none: [],
};

export function canOriginate(credentialKind: CredentialKind, messageClass: MessageClass): boolean {
  return CREDENTIAL_ORIGINS[credentialKind].includes(messageClass);
}

export function hopLimitFor(policy: ModePolicy, messageClass: MessageClass): number {
  // Authority classes (OFFICIAL_ALERT, MODE_DECLARATION) get unbounded (Infinity)
  if (messageClass === 'OFFICIAL_ALERT' || messageClass === 'MODE_DECLARATION') {
    return Infinity;
  }
  return policy.hopLimit;
}
