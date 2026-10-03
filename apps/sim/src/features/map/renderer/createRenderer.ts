import { Mode, type SimEngine, type Snapshot, type TransitEvent } from '@pomoc/core';
import type { Transform } from '../../../lib/geometry';
import { modeColors, resolvePalette } from '../../../theme/tokens';
import { drawEdges, drawRangeCircles } from './drawEdges';
import { drawBursts, drawPulses, drawRipples } from './drawFx';
import { drawGrid, drawModeVignette } from './drawGrid';
import { ParticleSystem } from './particles';

interface RendererOptions {
  canvas: HTMLCanvasElement;
  transformRef: React.MutableRefObject<Transform>;
  engine: SimEngine;
  lastTickAt: number;
  tickIntervalMs: number;
  speed: number;
  showRanges: boolean;
  showTopologyPackets: boolean;
  scheme: 'light' | 'dark';
}

export function createRenderer(opts: RendererOptions) {
  const { canvas, transformRef, engine, lastTickAt, tickIntervalMs, speed } = opts;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const particles = new ParticleSystem();
  const palette = resolvePalette(opts.scheme);
  let lastMode = 'PEACE';
  let modeChangeTime = 0;
  let latestSnapshot = engine.getSnapshot();

  // Resize canvas
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);
  }
  resizeCanvas();
  const resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(canvas);

  function ingestTransits(transits: TransitEvent[]) {
    const nodeMap = new Map(latestSnapshot.nodes.map((n) => [n.id, n]));

    for (const transit of transits) {
      const from = nodeMap.get(transit.from);
      const to = nodeMap.get(transit.to);
      if (!from || !to) continue;

      if (transit.via === 'authority-inject') {
        particles.addRipple({ x: to.x, y: to.y });
      } else if (transit.via === 'hop' || transit.via === 'store-flush') {
        particles.addPulse({
          from: { x: from.x, y: from.y },
          to: { x: to.x, y: to.y },
          class: transit.class,
          born: Date.now(),
        });
      }
    }
  }

  function draw(snapshot: Snapshot) {
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    const transform = transformRef.current;

    // Background
    ctx.fillStyle = opts.scheme === 'dark' ? '#1a1b1e' : '#fafafa';
    ctx.fillRect(0, 0, width, height);

    // Grid
    drawGrid(ctx, width, height, transform, palette.grid);

    // Edges
    drawEdges(ctx, snapshot.edges, snapshot.nodes, transform, palette.edge);

    // Range circles
    if (opts.showRanges) {
      drawRangeCircles(ctx, snapshot.nodes, transform, palette.backhaul);
    }

    // Particles
    const now = Date.now();
    particles.update(now);
    drawPulses(ctx, particles.pulses, transform, now);
    drawRipples(ctx, particles.ripples, transform, now);
    drawBursts(ctx, particles.bursts, transform, now);

    // Mode vignette
    const node0 = snapshot.nodes.length > 0 ? snapshot.nodes[0] : null;
    const mode = node0?.mode ?? 'PEACE';
    const modeColor = modeColors[mode] || '#4dabf7';
    if (mode !== lastMode) {
      lastMode = mode;
      modeChangeTime = Date.now();
    }
    const vignetteIntensity = Math.max(0, 1 - (now - modeChangeTime) / 600) * 0.2;
    drawModeVignette(ctx, width, height, modeColor, vignetteIntensity);
  }

  function animate() {
    draw(latestSnapshot);
    requestAnimationFrame(animate);
  }

  // Start animation loop
  const raf = requestAnimationFrame(animate);

  // Subscribe to engine updates
  const unsubscribe = engine.subscribe(() => {
    latestSnapshot = engine.getSnapshot();
    ingestTransits(latestSnapshot.transits);
  });

  return {
    ingestTransits,
    dispose: () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      unsubscribe();
      particles.clear();
    },
  };
}
