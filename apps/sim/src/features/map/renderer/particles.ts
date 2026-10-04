/**
 * Particle lifecycle for the map renderer. Pure TypeScript: no canvas, no DOM, no React,
 * so every function here is unit-testable. Time is passed in (ms for wall clock, ticks for
 * simulation time); nothing reads performance.now() or Date.
 */
import type {
  DropReason,
  MessageClass,
  MessageId,
  NodeId,
  SimEvent,
  TransitEvent,
  TransitVia,
} from '@pomoc/core';
import { comparePriority } from '@pomoc/core';
import { isRejection } from '../../../theme/tokens';

/** Max pulses drawn per tick; extra lowest-priority pulses are dropped silently. */
export const PULSE_CAP = 300;
/**
 * Max pulses in flight at once. Short ticks or high speeds keep several ticks' pulses
 * flying together (see flightMs); past this the lowest-priority, oldest ones go first.
 */
export const LIVE_PULSE_CAP = 900;
/** Shortest pulse flight: below this a hop is a blink nobody can follow. */
export const MIN_FLIGHT_MS = 120;
/** Shortest ripple / burst life when ticks are short (never longer than its base). */
export const MIN_FX_MS = 150;
/** Max bursts spawned per ingest. */
export const BURST_CAP = 120;
export const RIPPLE_MS = 400;
export const INJECT_RIPPLE_MS = 700;
export const UPLINK_RIPPLE_MS = 500;
export const BURST_MS = 350;
/** Ghost heads drawn behind each pulse. */
export const TAIL_COUNT = 4;
/** Progress gap between ghost heads. */
export const TAIL_SPACING = 0.07;

/** One animated packet crossing an edge; coalesces every copy of (from, to, class) in a tick. */
export interface Pulse {
  readonly fromId: NodeId;
  readonly toId: NodeId;
  readonly cls: MessageClass;
  readonly msgId: MessageId;
  readonly via: TransitVia;
  /** Simulation tick the transit happened in. */
  readonly born: number;
  /** Number of transits folded into this pulse. */
  readonly count: number;
  /** Wall-clock ms the flight starts. */
  readonly start: number;
  /** Wall-clock ms the flight takes (flightMs). */
  readonly duration: number;
  /** Set once the flight is over; the pulse then retires. */
  arrived: boolean;
}

export type RippleKind = 'arrive' | 'inject' | 'uplink';

/** Expanding ring at a node: packet arrival, authority injection "from the sky", or an uplink. */
export interface Ripple {
  readonly nodeId: NodeId;
  readonly cls: MessageClass;
  readonly kind: RippleKind;
  /** Wall-clock ms. */
  readonly start: number;
  readonly duration: number;
}

/** Short radial flash at a node that dropped a packet. */
export interface Burst {
  readonly nodeId: NodeId;
  readonly cls: MessageClass;
  readonly reason: DropReason;
  /** Wall-clock ms. */
  readonly start: number;
  /** Number of drops folded into this burst. */
  readonly count: number;
  readonly duration: number;
}

/** A node touched by an injection or uplink during ingest (no pulse: the Authority has no position). */
export interface NodeTouch {
  readonly nodeId: NodeId;
  readonly cls: MessageClass;
  readonly count: number;
}

export interface IngestOptions {
  readonly showTopology: boolean;
  readonly cap?: number;
  /** Wall-clock ms the pulses start flying (default 0). */
  readonly start?: number;
  /** Flight time of every pulse (default MIN_FLIGHT_MS). */
  readonly flightMs?: number;
}

/**
 * How long a pulse flies: one tick of wall time, but never under MIN_FLIGHT_MS. With
 * ticks shorter than that, the next tick's pulses leave before these land, so hops of a
 * flood overlap instead of flashing past unseen.
 */
export function flightMs(tickIntervalMs: number): number {
  return Math.max(MIN_FLIGHT_MS, tickIntervalMs);
}

/**
 * Life of a ripple or burst whose base length is `baseMs`: two ticks of wall time, kept
 * between MIN_FX_MS and the base, so short ticks do not stack rings across many ticks
 * and long ticks do not stretch them.
 */
export function fxMs(baseMs: number, tickIntervalMs: number): number {
  return Math.min(baseMs, Math.max(Math.min(MIN_FX_MS, baseMs), 2 * tickIntervalMs));
}

export interface IngestResult {
  readonly pulses: Pulse[];
  readonly injects: NodeTouch[];
  readonly uplinks: NodeTouch[];
  /** Transits left out by the cap. */
  readonly truncated: number;
}

/** Drop reasons that mean "rejected by policy" (red burst) rather than "ran out" (dim burst). */
export { isRejection, REJECTION_REASONS } from '../../../theme/tokens';

function pushTouch(map: Map<string, NodeTouch>, nodeId: NodeId, cls: MessageClass): void {
  const key = `${nodeId}|${cls}`;
  const prev = map.get(key);
  map.set(key, { nodeId, cls, count: (prev?.count ?? 0) + 1 });
}

/**
 * Turn one tick's transits into pulses, coalesced per (from, to, class) and capped by
 * priority (LIFE_CRITICAL first, commerce last). Authority injections and uplinks have no
 * drawable edge and come back as node touches instead.
 */
export function ingestTransits(
  transits: readonly TransitEvent[],
  tick: number,
  options: IngestOptions,
): IngestResult {
  const cap = options.cap ?? PULSE_CAP;
  const byEdge = new Map<string, Pulse>();
  const order: Pulse[] = [];
  const injects = new Map<string, NodeTouch>();
  const uplinks = new Map<string, NodeTouch>();

  for (const transit of transits) {
    if (!options.showTopology && transit.class === 'TOPOLOGY') continue;
    if (transit.via === 'authority-inject') {
      pushTouch(injects, transit.to, transit.class);
      continue;
    }
    if (transit.via === 'uplink') {
      pushTouch(uplinks, transit.from, transit.class);
      continue;
    }
    const key = `${transit.from}|${transit.to}|${transit.class}`;
    const existing = byEdge.get(key);
    if (existing) {
      const merged: Pulse = { ...existing, count: existing.count + 1 };
      byEdge.set(key, merged);
      order[order.indexOf(existing)] = merged;
      continue;
    }
    const pulse: Pulse = {
      fromId: transit.from,
      toId: transit.to,
      cls: transit.class,
      msgId: transit.msgId,
      via: transit.via,
      born: tick,
      count: 1,
      start: options.start ?? 0,
      duration: options.flightMs ?? MIN_FLIGHT_MS,
      arrived: false,
    };
    byEdge.set(key, pulse);
    order.push(pulse);
  }

  // Stable sort keeps insertion order inside a priority rank, so the cut is deterministic.
  const sorted = order.slice().sort((a, b) => comparePriority(a.cls, b.cls));
  const pulses = sorted.slice(0, cap);
  return {
    pulses,
    injects: [...injects.values()],
    uplinks: [...uplinks.values()],
    truncated: Math.max(0, sorted.length - cap),
  };
}

/** Smoothstep easing for pulse travel. */
export function easePulse(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/** Progress values of the ghost heads behind a pulse at progress t (closest first). */
export function tailProgress(t: number, count = TAIL_COUNT, spacing = TAIL_SPACING): number[] {
  const out: number[] = [];
  for (let i = 1; i <= count; i++) out.push(Math.max(0, t - i * spacing));
  return out;
}

/** 0..1 flight progress of a pulse at wall-clock `now`. */
export function pulseProgress(pulse: Pulse, now: number): number {
  return particleAge(pulse.start, pulse.duration, now);
}

/**
 * Mark pulses whose flight is over at `now`. Returns the pulses that arrived in this call
 * so the caller can spawn ripples.
 */
export function arrivePulses(pulses: readonly Pulse[], now: number): Pulse[] {
  const arrived: Pulse[] = [];
  for (const pulse of pulses) {
    if (pulse.arrived) continue;
    if (pulseProgress(pulse, now) >= 1) {
      pulse.arrived = true;
      arrived.push(pulse);
    }
  }
  return arrived;
}

/** Ripples for pulses that just arrived (one per destination node and class). */
export function ripplesForArrivals(
  arrivals: readonly Pulse[],
  now: number,
  duration = RIPPLE_MS,
): Ripple[] {
  const seen = new Set<string>();
  const out: Ripple[] = [];
  for (const pulse of arrivals) {
    const key = `${pulse.toId}|${pulse.cls}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      nodeId: pulse.toId,
      cls: pulse.cls,
      kind: 'arrive',
      start: now,
      duration,
    });
  }
  return out;
}

export function ripplesForTouches(
  touches: readonly NodeTouch[],
  kind: Exclude<RippleKind, 'arrive'>,
  now: number,
  duration = kind === 'inject' ? INJECT_RIPPLE_MS : UPLINK_RIPPLE_MS,
): Ripple[] {
  return touches.map((touch) => ({
    nodeId: touch.nodeId,
    cls: touch.cls,
    kind,
    start: now,
    duration,
  }));
}

/**
 * Bursts for DROPPED events, coalesced per (node, reason); DUPLICATE drops are the normal
 * cost of flooding and never burst. Rejections sort first so the cap keeps the interesting ones.
 */
export function burstsFromEvents(
  events: readonly SimEvent[],
  now: number,
  cap = BURST_CAP,
  duration = BURST_MS,
): Burst[] {
  const byKey = new Map<string, Burst>();
  for (const event of events) {
    if (event.type !== 'DROPPED' || event.reason === 'DUPLICATE') continue;
    const key = `${event.nodeId}|${event.reason}`;
    const prev = byKey.get(key);
    byKey.set(key, {
      nodeId: event.nodeId,
      cls: event.class,
      reason: event.reason,
      start: now,
      count: (prev?.count ?? 0) + 1,
      duration,
    });
  }
  const bursts = [...byKey.values()].sort((a, b) => {
    const ra = isRejection(a.reason) ? 0 : 1;
    const rb = isRejection(b.reason) ? 0 : 1;
    return ra - rb;
  });
  return bursts.slice(0, cap);
}

/** Pulses still worth drawing: not yet arrived. */
export function livePulses(pulses: readonly Pulse[]): Pulse[] {
  return pulses.filter((pulse) => !pulse.arrived);
}

/**
 * Keep at most `cap` pulses in flight: highest priority first, newest first inside a rank
 * (an old pulse is closest to landing anyway). Returns the input when under the cap.
 */
export function capPulses(pulses: Pulse[], cap = LIVE_PULSE_CAP): Pulse[] {
  if (pulses.length <= cap) return pulses;
  return pulses
    .map((pulse, i) => ({ pulse, i }))
    .sort((a, b) => comparePriority(a.pulse.cls, b.pulse.cls) || b.i - a.i)
    .slice(0, cap)
    .sort((a, b) => a.i - b.i)
    .map(({ pulse }) => pulse);
}

export function liveRipples(ripples: readonly Ripple[], now: number): Ripple[] {
  return ripples.filter((ripple) => now - ripple.start < ripple.duration);
}

export function liveBursts(bursts: readonly Burst[], now: number): Burst[] {
  return bursts.filter((burst) => now - burst.start < burst.duration);
}

/** 0..1 life of a timed particle at `now`; 1 means expired. */
export function particleAge(start: number, duration: number, now: number): number {
  if (duration <= 0) return 1;
  const age = (now - start) / duration;
  return age < 0 ? 0 : age > 1 ? 1 : age;
}
