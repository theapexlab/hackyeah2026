import type { NodeView, SimEngine, SimEvent, Snapshot } from '@pomoc/core';
import type { Transform } from '../../../lib/geometry';
import type { Palette } from '../../../theme/tokens';
import { buildEdgePaths, drawEdges, drawRangeCircles, type EdgePaths } from './drawEdges';
import {
  BURST_MS,
  drawBursts,
  drawHighlightedPath,
  drawModeHalos,
  drawPulses,
  drawRegion,
  drawRipples,
} from './drawFx';
import { buildStreets, drawGrid } from './drawGrid';
import { ParticleSystem } from './particles';

/** Everything the renderer reads each frame; supplied by the host so this module stays React-free. */
export interface RenderView {
  transform: Transform;
  palette: Palette;
  tickMs: number;
  showRanges: boolean;
  showTopologyPackets: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  highlightedMessageId: string | null;
}

export interface RendererStats {
  pulses: number;
  frameMs: number;
}

const FLASH_MS = 600;
/** Routine flood bookkeeping; a burst per duplicate would drown the real rejections. */
const QUIET_DROPS: ReadonlySet<string> = new Set(['DUPLICATE', 'HOP_LIMIT']);

export function createRenderer(
  canvas: HTMLCanvasElement,
  engine: SimEngine,
  getView: () => RenderView,
) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2d canvas unavailable');
  const particles = new ParticleSystem();
  const stats: RendererStats = { pulses: 0, frameMs: 0 };

  let snapshot: Snapshot = engine.getSnapshot();
  let nodeById = new Map<string, NodeView>();
  let edgePaths: EdgePaths | null = null;
  let streets: { key: string; path: Path2D } | null = null;
  let eventsSeen = engine.getEventLog().length;
  let flash: { at: number; mode: NodeView['mode'] } | null = null;
  let trailMsg: string | null = null;
  let trail: [string, string][] = [];
  let raf = 0;
  let dpr = 1;
  let lastDiag = '';
  let peakMs = 0;
  let frames = 0;

  const indexSnapshot = () => {
    nodeById = new Map(snapshot.nodes.map((n) => [n.id, n]));
    edgePaths = null;
  };
  indexSnapshot();

  const resize = () => {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  const handleEvent = (e: SimEvent, now: number) => {
    switch (e.type) {
      case 'DROPPED': {
        const n = nodeById.get(e.at);
        if (n && !QUIET_DROPS.has(e.reason)) particles.addBurst(n.x, n.y, now);
        break;
      }
      case 'AUTHORITY_INJECTED': {
        const n = nodeById.get(e.to);
        if (n) particles.addRipple({ x: n.x, y: n.y, kind: 'inject', duration: 800 }, now);
        break;
      }
      case 'MODE_CHANGED':
        flash = { at: now, mode: e.to };
        break;
    }
  };

  const onEngine = () => {
    const now = performance.now();
    const view = getView();
    snapshot = engine.getSnapshot();
    indexSnapshot();
    particles.ingestTransits(snapshot.transits, now, view.showTopologyPackets);
    for (const t of snapshot.transits) {
      if (t.msgId === trailMsg && t.via === 'hop') trail.push([t.from, t.to]);
      if (t.via === 'uplink') {
        const n = nodeById.get(t.from);
        if (n) particles.addRipple({ x: n.x, y: n.y, kind: 'uplink', cls: t.class }, now);
      }
    }
    const log = engine.getEventLog();
    if (log.length < eventsSeen) eventsSeen = 0;
    for (let i = eventsSeen; i < log.length; i++) {
      const e = log[i];
      if (e) handleEvent(e, now);
    }
    eventsSeen = log.length;
  };
  const unsubscribe = engine.subscribe(onEngine);

  const draw = (now: number) => {
    const t0 = performance.now();
    const view = getView();
    const { transform: tf, palette } = view;
    const { width, height, seed } = snapshot.world;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * tf.k, 0, 0, dpr * tf.k, dpr * tf.x, dpr * tf.y);

    const streetKey = `${seed}:${width}x${height}`;
    if (streets?.key !== streetKey)
      streets = { key: streetKey, path: buildStreets({ width, height, seed }) };
    drawGrid(ctx, { width, height, seed }, streets.path, palette, tf.k);

    for (const d of snapshot.declarations) {
      if (d.region) drawRegion(ctx, d.region, palette.mode[d.level] ?? palette.mode.L2, tf.k);
    }
    drawModeHalos(ctx, snapshot.nodes, palette);

    edgePaths ??= buildEdgePaths(snapshot.edges, nodeById);
    drawEdges(ctx, edgePaths, palette, tf.k);

    if (view.showRanges) {
      const em = new Set([view.selectedId, view.hoveredId].filter((v): v is string => !!v));
      drawRangeCircles(ctx, snapshot.nodes, palette, tf.k, em);
    }

    if (view.highlightedMessageId !== trailMsg) {
      trailMsg = view.highlightedMessageId;
      trail = [];
    }
    if (trailMsg) drawHighlightedPath(ctx, trail, nodeById, palette.cls.OFFICIAL_ALERT, tf.k);

    for (const p of particles.prune(now, view.tickMs, BURST_MS)) {
      const n = nodeById.get(p.toId);
      if (n) particles.addRipple({ x: n.x, y: n.y, kind: 'arrive', cls: p.cls }, now);
    }
    drawPulses(
      ctx,
      particles.pulses,
      nodeById,
      palette,
      now,
      view.tickMs,
      tf.k,
      view.highlightedMessageId,
    );
    drawRipples(ctx, particles.ripples, palette, now, tf.k);
    drawBursts(ctx, particles.bursts, palette, now, tf.k);

    if (flash && now - flash.at < FLASH_MS) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = (1 - (now - flash.at) / FLASH_MS) * 0.16;
      ctx.fillStyle = palette.mode[flash.mode];
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }

    stats.pulses = particles.pulses.length;
    stats.frameMs = performance.now() - t0;
    peakMs = Math.max(peakMs, stats.frameMs);
    if (++frames % 30 === 0) {
      canvas.dataset.drawMsPeak = peakMs.toFixed(2);
      peakMs = 0;
    }
    const diag = `${stats.pulses}|${particles.spawned.pulses}|${particles.spawned.ripples}|${particles.spawned.bursts}`;
    if (diag !== lastDiag) {
      lastDiag = diag;
      canvas.dataset.pulses = String(stats.pulses);
      canvas.dataset.spawned = JSON.stringify(particles.spawned);
    }
  };

  const frame = (now: number) => {
    draw(now);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    stats,
    dispose: () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      unsubscribe();
      particles.clear();
    },
  };
}
