import type { DeclarationView, NodeId, NodeView } from '@pomoc/core';
import { type Palette, withAlpha } from '../../../theme/tokens';
import type { TrailEdge } from './highlight';
import {
  BURST_MS,
  type Burst,
  easePulse,
  isRejection,
  type Pulse,
  particleAge,
  type Ripple,
  TAIL_COUNT,
  tailProgress,
} from './particles';
import type { SpriteSet } from './sprites';

type NodeLookup = ReadonlyMap<NodeId, NodeView>;

/** Pulse head diameter on screen (CSS px) before the per-class and per-count scaling. */
const PULSE_PX = 18;
const CLASS_SCALE: Partial<Record<Pulse['cls'], number>> = {
  LIFE_CRITICAL: 1.5,
  OFFICIAL_ALERT: 1.3,
  MODE_DECLARATION: 1.3,
  SAFETY: 1.2,
  TOPOLOGY: 0.7,
};

/** Translucent discs for active regional declarations; a faint wash for whole-city ones. */
export function drawRegionTints(
  ctx: CanvasRenderingContext2D,
  declarations: readonly DeclarationView[],
  world: { readonly width: number; readonly height: number },
  palette: Palette,
  k: number,
): void {
  for (const declaration of declarations) {
    const color = palette.mode[declaration.level];
    if (!declaration.region) {
      ctx.fillStyle = withAlpha(color, 0.05);
      ctx.fillRect(0, 0, world.width, world.height);
      continue;
    }
    const { x, y, r } = declaration.region;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(color, 0.12);
    ctx.fill();
    ctx.setLineDash([8 / k, 6 / k]);
    ctx.strokeStyle = withAlpha(color, 0.55);
    ctx.lineWidth = 1.5 / k;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** Highlighted message: its flood trail (soft) and, when known, the recorded hop chain (bright). */
export function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: readonly TrailEdge[],
  chain: readonly TrailEdge[],
  nodes: NodeLookup,
  color: string,
  k: number,
): void {
  const strokeEdges = (edges: readonly TrailEdge[], width: number, alpha: number): void => {
    if (edges.length === 0) return;
    ctx.beginPath();
    for (const edge of edges) {
      const a = nodes.get(edge.from);
      const b = nodes.get(edge.to);
      if (!a || !b) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.strokeStyle = withAlpha(color, alpha);
    ctx.lineWidth = width / k;
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  strokeEdges(trail, 9, 0.18);
  strokeEdges(trail, 2.5, 0.75);
  strokeEdges(chain, 12, 0.22);
  strokeEdges(chain, 4, 1);

  // Dots on every node of the chain so the route reads even where it overlaps the trail.
  if (chain.length > 0) {
    ctx.fillStyle = color;
    const r = 4 / k;
    const seen = new Set<NodeId>();
    for (const edge of chain) {
      for (const id of [edge.from, edge.to]) {
        if (seen.has(id)) continue;
        seen.add(id);
        const n = nodes.get(id);
        if (!n) continue;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/**
 * Packets in flight: glow sprite at the eased head position plus ghost heads behind it.
 * Positions are read from the CURRENT node views, so pulses follow moving phones.
 */
export function drawPulses(
  ctx: CanvasRenderingContext2D,
  pulses: readonly Pulse[],
  nodes: NodeLookup,
  t: number,
  sprites: SpriteSet,
  palette: Palette,
  k: number,
): void {
  if (pulses.length === 0) return;
  const previousBlend = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = palette.blend;
  const head = easePulse(t);
  const tails = tailProgress(t).map(easePulse);

  for (const pulse of pulses) {
    const a = nodes.get(pulse.fromId);
    const b = nodes.get(pulse.toId);
    if (!a || !b) continue;
    const scale =
      (CLASS_SCALE[pulse.cls] ?? 1) * (1 + Math.min(0.6, Math.log2(pulse.count) * 0.12));
    const size = (PULSE_PX * scale) / k;
    const sprite = sprites.get(pulse.cls);
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    for (let i = TAIL_COUNT - 1; i >= 0; i--) {
      const p = tails[i];
      if (p === undefined) continue;
      const s = size * (0.85 - i * 0.12);
      ctx.globalAlpha = 0.45 - i * 0.09;
      ctx.drawImage(sprite, a.x + dx * p - s / 2, a.y + dy * p - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    const hx = a.x + dx * head;
    const hy = a.y + dy * head;
    ctx.drawImage(sprite, hx - size / 2, hy - size / 2, size, size);
    if (pulse.cls === 'LIFE_CRITICAL') {
      const c = size * 0.45;
      ctx.drawImage(sprites.core, hx - c / 2, hy - c / 2, c, c);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = previousBlend;
}

/** Expanding rings: arrival (small, 400 ms), injection (large double ring), uplink (ring + beam). */
export function drawRipples(
  ctx: CanvasRenderingContext2D,
  ripples: readonly Ripple[],
  nodes: NodeLookup,
  now: number,
  palette: Palette,
  k: number,
): void {
  for (const ripple of ripples) {
    const n = nodes.get(ripple.nodeId);
    if (!n) continue;
    const age = particleAge(ripple.start, ripple.duration, now);
    const color = palette.cls[ripple.cls];
    const fade = 1 - age;
    ctx.lineWidth = 2 / k;

    if (ripple.kind === 'arrive') {
      const r = (6 + 16 * age) / k;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(color, 0.9 * fade);
      ctx.stroke();
      continue;
    }

    if (ripple.kind === 'inject') {
      // "From the sky": two rings contracting onto the gateway, then a bright flash.
      for (const phase of [0, 0.35]) {
        const p = Math.max(0, Math.min(1, (age - phase) / (1 - phase)));
        if (age < phase) continue;
        const r = (52 * (1 - p) + 10) / k;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = withAlpha(color, 0.85 * (1 - p));
        ctx.lineWidth = 2.5 / k;
        ctx.stroke();
      }
      const glow = Math.sin(age * Math.PI);
      ctx.beginPath();
      ctx.arc(n.x, n.y, (14 * glow + 6) / k, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(color, 0.35 * glow);
      ctx.fill();
      continue;
    }

    // uplink: ring plus a beam rising from the node
    const r = (6 + 10 * age) / k;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(color, 0.8 * fade);
    ctx.stroke();
    const beam = (40 * age) / k;
    ctx.beginPath();
    ctx.moveTo(n.x, n.y - r);
    ctx.lineTo(n.x, n.y - r - beam);
    ctx.strokeStyle = withAlpha(color, 0.9 * fade);
    ctx.lineWidth = 3 / k;
    ctx.stroke();
  }
}

/** Drop bursts: red spokes for rejections, dim spokes for exhausted packets. */
export function drawBursts(
  ctx: CanvasRenderingContext2D,
  bursts: readonly Burst[],
  nodes: NodeLookup,
  now: number,
  palette: Palette,
  k: number,
): void {
  for (const burst of bursts) {
    const n = nodes.get(burst.nodeId);
    if (!n) continue;
    const age = particleAge(burst.start, BURST_MS, now);
    const rejected = isRejection(burst.reason);
    const color = rejected ? palette.danger : palette.muted;
    const spokes = rejected ? 8 : 5;
    const reach = ((rejected ? 22 : 14) + Math.min(10, burst.count * 1.5)) / k;
    const inner = (8 + 6 * age) / k;
    const outer = inner + reach * age;
    const alpha = (rejected ? 1 : 0.6) * (1 - age);

    ctx.strokeStyle = withAlpha(color, alpha);
    ctx.lineWidth = (rejected ? 2.5 : 1.5) / k;
    ctx.beginPath();
    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * Math.PI * 2 + (rejected ? 0 : Math.PI / 5);
      ctx.moveTo(n.x + Math.cos(angle) * inner, n.y + Math.sin(angle) * inner);
      ctx.lineTo(n.x + Math.cos(angle) * outer, n.y + Math.sin(angle) * outer);
    }
    ctx.stroke();

    if (rejected) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, (10 + 12 * age) / k, 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(color, 0.5 * (1 - age));
      ctx.lineWidth = 1.5 / k;
      ctx.stroke();
    }
  }
}

/** Mode vignette blur, matching the old CSS `inset 0 0 160px` shadow. */
const VIGNETTE_BLUR_PX = 160;
let vignetteCache: { key: string; canvas: HTMLCanvasElement } | null = null;

/**
 * Mode-tinted inset glow along the viewport edges, drawn in screen space under the edges and
 * nodes so the alert tint never washes them out. Rendered once per size/colour into an
 * offscreen canvas because a 160px canvas shadow is too costly to repaint every frame.
 */
export function drawVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  color: string,
): void {
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (w <= 0 || h <= 0) return;
  const key = `${w}x${h}:${color}`;
  if (vignetteCache?.key !== key) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const off = canvas.getContext('2d');
    if (!off) return;
    const blur = VIGNETTE_BLUR_PX * dpr;
    const pad = blur * 3;
    // A frame just outside the viewport; only its blurred shadow bleeds in.
    off.beginPath();
    off.rect(-pad, -pad, w + pad * 2, h + pad * 2);
    off.rect(0, 0, w, h);
    off.shadowColor = color;
    off.shadowBlur = blur;
    off.fillStyle = color;
    off.fill('evenodd');
    vignetteCache = { key, canvas };
  }
  ctx.drawImage(vignetteCache.canvas, 0, 0, width, height);
}
