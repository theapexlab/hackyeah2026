import type { MessageClass, TransitEvent } from '@pomoc/core';

export interface Pulse {
  fromId: string;
  toId: string;
  cls: MessageClass;
  msgId: string;
  via: 'hop' | 'store-flush';
  born: number;
  /** Transits merged into this pulse (same edge + class in one tick). */
  count: number;
}

export interface Ripple {
  x: number;
  y: number;
  born: number;
  duration: number;
  kind: 'arrive' | 'inject' | 'uplink';
  cls?: MessageClass;
}

export interface Burst {
  x: number;
  y: number;
  born: number;
}

export const MAX_PULSES = 300;
export const MAX_RIPPLES = 160;
export const MAX_BURSTS = 120;
const HIDDEN_CLASSES: ReadonlySet<MessageClass> = new Set(['TOPOLOGY', 'PORTAL_SUMMARY']);

const capped = <T>(list: T[], max: number): T[] =>
  list.length > max ? list.slice(list.length - max) : list;

export class ParticleSystem {
  pulses: Pulse[] = [];
  ripples: Ripple[] = [];
  bursts: Burst[] = [];
  /** Lifetime spawn counters (diagnostics). */
  spawned = { pulses: 0, ripples: 0, bursts: 0 };

  /** Coalesces one tick of transits per (edge, class) and caps the live pulse count. */
  ingestTransits(transits: readonly TransitEvent[], now: number, showTopology: boolean): void {
    const merged = new Map<string, Pulse>();
    for (const t of transits) {
      if (t.via !== 'hop' && t.via !== 'store-flush') continue;
      if (!showTopology && HIDDEN_CLASSES.has(t.class)) continue;
      const key = `${t.from}>${t.to}|${t.class}|${t.via}`;
      const hit = merged.get(key);
      if (hit) hit.count++;
      else
        merged.set(key, {
          fromId: t.from,
          toId: t.to,
          cls: t.class,
          msgId: t.msgId,
          via: t.via,
          born: now,
          count: 1,
        });
    }
    this.spawned.pulses += merged.size;
    this.pulses = capped([...this.pulses, ...merged.values()], MAX_PULSES);
  }

  addRipple(r: Omit<Ripple, 'born' | 'duration'> & { duration?: number }, now: number): void {
    this.spawned.ripples++;
    this.ripples = capped([...this.ripples, { duration: 400, born: now, ...r }], MAX_RIPPLES);
  }

  addBurst(x: number, y: number, now: number): void {
    this.spawned.bursts++;
    this.bursts = capped([...this.bursts, { x, y, born: now }], MAX_BURSTS);
  }

  /** Drops finished particles; returns the pulses that just landed (callers spawn ripples). */
  prune(now: number, tickMs: number, burstMs: number): Pulse[] {
    const landed: Pulse[] = [];
    const live: Pulse[] = [];
    for (const p of this.pulses) (now - p.born >= tickMs ? landed : live).push(p);
    this.pulses = live;
    this.ripples = this.ripples.filter((r) => now - r.born < r.duration);
    this.bursts = this.bursts.filter((b) => now - b.born < burstMs);
    return landed;
  }

  clear(): void {
    this.pulses = [];
    this.ripples = [];
    this.bursts = [];
  }
}
