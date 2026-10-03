import type { MessageClass } from './message';

/** Modes in escalation order. */
export const MODE_ORDER = ['PEACE', 'L1', 'L2', 'L3'] as const;
export type Mode = (typeof MODE_ORDER)[number];

/** Captive-portal write policy (display only in the simulation). */
export type PortalWrite = 'none' | 'read-only' | 'check-in' | 'check-in+request';
/** Radio emission policy (display only in the simulation). */
export type Emission = 'normal' | 'reduced';

/** The rule set a MODE_DECLARATION carries; the three levels are presets of it. */
export interface ModePolicy {
  readonly label: string;
  /** Classes a node in this mode may create. */
  readonly originClasses: readonly MessageClass[];
  /** Classes a node in this mode accepts and forwards (superset of originClasses). */
  readonly relayClasses: readonly MessageClass[];
  /** Hop limit a node in this mode gives a message it originates (the origination default). */
  readonly hopLimit: number;
  /**
   * Hop cap a node in this mode applies when relaying a bounded class (FR-NET-06: PEACE
   * default 3, max 6). A requested hopLimit is clamped to it at origination.
   */
  readonly maxHopLimit: number;
  readonly ttlTicks: number;
  readonly storeAndForward: boolean;
  readonly phoneTopologyGossip: boolean;
  readonly paymentsAllowed: boolean;
  readonly portalWrite: PortalWrite;
  readonly emission: Emission;
}

const AUTHORITY_AND_GOSSIP: readonly MessageClass[] = [
  'OFFICIAL_ALERT',
  'MODE_DECLARATION',
  'TOPOLOGY',
  'PORTAL_SUMMARY',
];

const PEACE_ORIGIN: readonly MessageClass[] = [
  'LEND',
  'BORROW',
  'GIVE',
  'SELL',
  'INFO',
  'LIFE_CRITICAL',
  'SAFETY',
];
const L1_ORIGIN: readonly MessageClass[] = ['LIFE_CRITICAL', 'SAFETY', 'CHECK_IN', 'INFO', 'GIVE'];
const L3_ORIGIN: readonly MessageClass[] = ['LIFE_CRITICAL', 'SAFETY', 'CHECK_IN'];

/** Policy presets per mode, encoded from docs/concept.md "Emergency mode: levels and policy". */
export const MODE_POLICIES: Readonly<Record<Mode, ModePolicy>> = {
  PEACE: {
    label: 'Peace',
    originClasses: PEACE_ORIGIN,
    relayClasses: [...PEACE_ORIGIN, 'CHECK_IN', ...AUTHORITY_AND_GOSSIP],
    hopLimit: 3,
    maxHopLimit: 6,
    ttlTicks: 120,
    storeAndForward: false,
    phoneTopologyGossip: true,
    paymentsAllowed: true,
    portalWrite: 'none',
    emission: 'normal',
  },
  L1: {
    label: 'L1 Disruption',
    originClasses: L1_ORIGIN,
    relayClasses: [...L1_ORIGIN, ...AUTHORITY_AND_GOSSIP],
    hopLimit: 10,
    maxHopLimit: 10,
    ttlTicks: 200,
    storeAndForward: true,
    phoneTopologyGossip: true,
    paymentsAllowed: false,
    portalWrite: 'check-in',
    emission: 'normal',
  },
  L2: {
    label: 'L2 Disaster',
    originClasses: L1_ORIGIN,
    relayClasses: [...L1_ORIGIN, ...AUTHORITY_AND_GOSSIP],
    hopLimit: 15,
    maxHopLimit: 15,
    ttlTicks: 300,
    storeAndForward: true,
    phoneTopologyGossip: true,
    paymentsAllowed: false,
    portalWrite: 'check-in+request',
    emission: 'normal',
  },
  L3: {
    label: 'L3 Security',
    originClasses: L3_ORIGIN,
    relayClasses: [...L3_ORIGIN, ...AUTHORITY_AND_GOSSIP],
    hopLimit: 6,
    maxHopLimit: 6,
    ttlTicks: 120,
    storeAndForward: true,
    phoneTopologyGossip: false,
    paymentsAllowed: false,
    portalWrite: 'read-only',
    emission: 'reduced',
  },
};

/** Classes whose hop limit is unbounded in every mode (FR-MODE-06). */
export const UNBOUNDED_CLASSES: readonly MessageClass[] = ['OFFICIAL_ALERT', 'MODE_DECLARATION'];

/**
 * Hop cap a node in `policy` applies when relaying `cls`: policy.maxHopLimit for bounded
 * classes, unbounded for UNBOUNDED_CLASSES. The origination default is policy.hopLimit
 * (see createMessage); a packet's effective limit is min(msg.hopLimit, this).
 */
export function hopLimitFor(policy: ModePolicy, cls: MessageClass): number {
  return UNBOUNDED_CLASSES.includes(cls) ? Number.POSITIVE_INFINITY : policy.maxHopLimit;
}

/** TTL in ticks a node in `policy` assigns to a message of `cls` it originates. */
export function ttlFor(policy: ModePolicy, _cls: MessageClass): number {
  return policy.ttlTicks;
}

/** True for every mode except PEACE. */
export function isEmergency(mode: Mode): boolean {
  return mode !== 'PEACE';
}

/** Numeric rank of a mode in escalation order (PEACE = 0 .. L3 = 3). */
export function modeRank(mode: Mode): number {
  return MODE_ORDER.indexOf(mode);
}

/** The higher of two modes. */
export function maxMode(a: Mode, b: Mode): Mode {
  return modeRank(a) >= modeRank(b) ? a : b;
}
