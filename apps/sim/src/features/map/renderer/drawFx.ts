import { lerp, type Transform } from '../../../lib/geometry';
import { classColors } from '../../../theme/tokens';
import type { Burst, Pulse, Ripple } from './particles';

export function drawPulses(
  ctx: CanvasRenderingContext2D,
  pulses: Pulse[],
  transform: Transform,
  now: number,
) {
  for (const pulse of pulses) {
    const age = now - pulse.born;
    const progress = Math.min(age / 1000, 1);

    const x = lerp(pulse.from.x, pulse.to.x, progress);
    const y = lerp(pulse.from.y, pulse.to.y, progress);

    const sx = (x - transform.x) * transform.k;
    const sy = (y - transform.y) * transform.k;

    const color = classColors[pulse.class] || '#4dabf7';
    const alpha = 1 - progress * 0.5;

    // Head
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Tail
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.3;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    const tx = lerp(pulse.from.x, pulse.to.x, Math.max(0, progress - 0.1));
    const ty = lerp(pulse.from.y, pulse.to.y, Math.max(0, progress - 0.1));
    const tsx = (tx - transform.x) * transform.k;
    const tsy = (ty - transform.y) * transform.k;
    ctx.lineTo(tsx, tsy);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

export function drawRipples(
  ctx: CanvasRenderingContext2D,
  ripples: Ripple[],
  transform: Transform,
  now: number,
) {
  for (const ripple of ripples) {
    const age = now - ripple.born;
    const progress = Math.min(age / ripple.duration, 1);

    const sx = (ripple.pos.x - transform.x) * transform.k;
    const sy = (ripple.pos.y - transform.y) * transform.k;

    const radius = 20 + progress * 80;
    const alpha = (1 - progress) * 0.5;

    ctx.strokeStyle = 'rgba(255, 255, 255, ' + alpha + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawBursts(
  ctx: CanvasRenderingContext2D,
  bursts: Burst[],
  transform: Transform,
  now: number,
) {
  for (const burst of bursts) {
    const age = now - burst.born;
    const progress = Math.min(age / 200, 1);

    const sx = (burst.pos.x - transform.x) * transform.k;
    const sy = (burst.pos.y - transform.y) * transform.k;

    ctx.fillStyle = `rgba(255, 107, 107, ${(1 - progress) * 0.6})`;
    const radius = 10 + progress * 30;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
