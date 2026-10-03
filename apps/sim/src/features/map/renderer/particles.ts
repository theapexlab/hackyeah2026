import type { MessageClass } from '@pomoc/core';
import { Transform, type Vec2 } from '../../../lib/geometry';

export interface Pulse {
  from: Vec2;
  to: Vec2;
  class: MessageClass;
  born: number;
}

export interface Ripple {
  pos: Vec2;
  born: number;
  duration: number;
}

export interface Burst {
  pos: Vec2;
  born: number;
}

export class ParticleSystem {
  pulses: Pulse[] = [];
  ripples: Ripple[] = [];
  bursts: Burst[] = [];

  addPulse(pulse: Pulse) {
    this.pulses.push(pulse);
    if (this.pulses.length > 300) {
      this.pulses.shift();
    }
  }

  addRipple(pos: Vec2, duration = 400) {
    this.ripples.push({ pos, born: Date.now(), duration });
  }

  addBurst(pos: Vec2) {
    this.bursts.push({ pos, born: Date.now() });
  }

  update(now: number) {
    // Remove old ripples (400ms duration)
    this.ripples = this.ripples.filter((r) => now - r.born < r.duration);

    // Remove old bursts (200ms duration)
    this.bursts = this.bursts.filter((b) => now - b.born < 200);

    // Remove old pulses (1000ms life)
    this.pulses = this.pulses.filter((p) => now - p.born < 1000);
  }

  clear() {
    this.pulses = [];
    this.ripples = [];
    this.bursts = [];
  }
}
