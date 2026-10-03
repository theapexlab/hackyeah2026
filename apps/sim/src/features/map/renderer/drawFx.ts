import type { Circle, NodeView } from '@pomoc/core';
import type { Palette } from '../../../theme/tokens';
import type { Burst, Pulse, Ripple } from './particles';
import { pulseSprite } from './sprites';

export const BURST_MS = 350;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function drawPulses(
  ctx: CanvasRenderingContext2D,
  pulses: readonly Pulse[],
  nodeById: Map<string, NodeView>,
  palette: Palette,
  now: number,
  tickMs: number,
  k: number,
  highlighted: string | null,
): void {
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = palette.blend;
  for (const p of pulses) {
    const a = nodeById.get(p.fromId);
    const b = nodeById.get(p.toId);
    if (!a || !b) continue;
    const t = clamp01((now - p.born) / tickMs);
    const color = p.via === 'store-flush' ? palette.store : palette.cls[p.cls];
    const sprite = pulseSprite(color, p.cls === 'LIFE_CRITICAL');
    const glow = p.msgId === highlighted;
    const base = (9 + Math.min(p.count - 1, 3) * 2 + (glow ? 6 : 0)) / k;
    for (let i = 4; i >= 0; i--) {
      const ti = clamp01(t - i * 0.06);
      const s = base * (1 - i * 0.14);
      ctx.globalAlpha = i === 0 ? 1 : 0.42 * (1 - i / 5);
      ctx.drawImage(sprite, lerp(a.x, b.x, ti) - s, lerp(a.y, b.y, ti) - s, s * 2, s * 2);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = prev;
}

export function drawRipples(
  ctx: CanvasRenderingContext2D,
  ripples: readonly Ripple[],
  palette: Palette,
  now: number,
  k: number,
): void {
  for (const r of ripples) {
    const t = clamp01((now - r.born) / r.duration);
    const big = r.kind === 'inject';
    ctx.strokeStyle = big ? palette.cls.OFFICIAL_ALERT : palette.cls[r.cls ?? 'INFO'];
    ctx.globalAlpha = (1 - t) * (big ? 0.9 : 0.6);
    ctx.lineWidth = (big ? 3 : 1.6) / k;
    ctx.beginPath();
    ctx.arc(r.x, r.y, (big ? lerp(10, 90, t) : lerp(6, 26, t)) / k, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawBursts(
  ctx: CanvasRenderingContext2D,
  bursts: readonly Burst[],
  palette: Palette,
  now: number,
  k: number,
): void {
  for (const b of bursts) {
    const t = clamp01((now - b.born) / BURST_MS);
    const r = lerp(6, 30, t) / k;
    ctx.fillStyle = palette.drop;
    ctx.strokeStyle = palette.drop;
    ctx.globalAlpha = (1 - t) * 0.35;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1 - t;
    ctx.lineWidth = 2 / k;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Soft halo in each node's own mode colour: this is what tints regions that differ. */
export function drawModeHalos(
  ctx: CanvasRenderingContext2D,
  nodes: readonly NodeView[],
  palette: Palette,
): void {
  for (const n of nodes) {
    if (!n.alive || n.mode === 'PEACE') continue;
    const r = n.range * 0.75;
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
    g.addColorStop(0, `${palette.mode[n.mode]}16`);
    g.addColorStop(1, `${palette.mode[n.mode]}00`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawRegion(
  ctx: CanvasRenderingContext2D,
  region: Circle,
  color: string,
  k: number,
): void {
  ctx.fillStyle = `${color}1c`;
  ctx.strokeStyle = `${color}88`;
  ctx.lineWidth = 1.5 / k;
  ctx.setLineDash([8 / k, 6 / k]);
  ctx.beginPath();
  ctx.arc(region.centerX, region.centerY, region.radiusMtres, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawHighlightedPath(
  ctx: CanvasRenderingContext2D,
  edges: readonly (readonly [string, string])[],
  nodeById: Map<string, NodeView>,
  color: string,
  k: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 / k;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (const [a, b] of edges) {
    const na = nodeById.get(a);
    const nb = nodeById.get(b);
    if (!na || !nb) continue;
    ctx.moveTo(na.x, na.y);
    ctx.lineTo(nb.x, nb.y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}
