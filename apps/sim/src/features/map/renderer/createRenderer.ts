import type { MessageClass, NodeId, SimEngine, Snapshot, TransitEvent } from '@pomoc/core';
import type { StoreApi } from 'zustand';
import { createEventCursor } from '../../../lib/eventCursor';
import { clamp, type Transform } from '../../../lib/geometry';
import { nodeIndex } from '../../../sim/selectors';
import { MODE_VIGNETTE, type Palette, withAlpha } from '../../../theme/tokens';
import type { UiState } from '../../../ui/store';
import {
  buildEdgePaths,
  drawBackground,
  drawEdges,
  drawRangeCircles,
  type EdgePaths,
  edgePathsStale,
} from './drawEdges';
import {
  drawBursts,
  drawPulses,
  drawRegionTints,
  drawRipples,
  drawTrail,
  drawVignette,
} from './drawFx';
import { fxBus } from './fxBus';
import { chainEdges, collectTrail, TRAIL_TICKS, type Trail, type TrailEdge } from './highlight';
import {
  arrivePulses,
  type Burst,
  burstsFromEvents,
  ingestTransits,
  liveBursts,
  livePulses,
  liveRipples,
  type Pulse,
  type Ripple,
  ripplesForArrivals,
  ripplesForTouches,
} from './particles';
import { createSprites, type SpriteSet } from './sprites';
import { buildTerrainPaths, drawTerrain, type TerrainPaths } from './drawTerrain';

export interface RendererOptions {
  readonly engine: SimEngine;
  readonly uiStore: StoreApi<UiState>;
  /** Live view transform owned by useZoom; read every frame, never written here. */
  readonly transformRef: { readonly current: Transform };
  readonly canvas: HTMLCanvasElement;
  readonly getPalette: () => Palette;
  /** performance.now() of the last tick advance. */
  readonly getLastTickAt: () => number;
  /** Wall-clock ms one tick takes at the current speed. */
  readonly getTickIntervalMs: () => number;
  /**
   * Where to read the world from; defaults to engine.getSnapshot(). The sim store passes its
   * own snapshot so the dev fixture is honoured; its engine listener runs before ours, so the
   * store is fresh when we ingest.
   */
  readonly getSnapshot?: () => Snapshot;
  /** Initial device pixel ratio; later values come through resize(). */
  readonly getDpr?: () => number;
}

export interface Renderer {
  /** Force a redraw on the next frame (palette swap, zoom). */
  invalidate(): void;
  /** Size the canvas backing store (CSS px × device pixel ratio) and redraw. */
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  destroy(): void;
}

/**
 * Owns the map canvas. Subscribes to the engine directly (no React): every step/dispatch
 * ingests the snapshot's transits into pulses and its DROPPED events into bursts, then a
 * requestAnimationFrame loop draws the scene with t = (now - lastTickAt) / tickIntervalMs.
 */
export function createRenderer(options: RendererOptions): Renderer {
  const { engine, uiStore, transformRef, canvas, getPalette, getLastTickAt, getTickIntervalMs } =
    options;
  const getSnapshot = options.getSnapshot ?? (() => engine.getSnapshot());
  let dprValue = options.getDpr?.() ?? window.devicePixelRatio ?? 1;
  const getDpr = (): number => dprValue;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');

  let pulses: Pulse[] = [];
  let ripples: Ripple[] = [];
  let bursts: Burst[] = [];
  let ingestedTick = getSnapshot().tick;
  let dirty = true;
  /** The last frame drew transient fx; one more frame is needed to paint the scene without them. */
  let fxDrawn = false;
  let frame: number | null = null;
  let destroyed = false;

  let edgeCache: EdgePaths | null = null;
  let terrainCache: TerrainPaths | null = null;
  let spriteCache: { palette: Palette; sprites: SpriteSet } | null = null;
  let trailCache: {
    msgId: string;
    tick: number;
    path: readonly NodeId[] | null;
    trail: Trail;
    chain: TrailEdge[];
    /** Class of the highlighted message; null when the snapshot no longer holds it. */
    cls: MessageClass | null;
  } | null = null;

  const events = createEventCursor(() => getSnapshot().recentEvents, { startAtEnd: true });

  const sprites = (palette: Palette): SpriteSet => {
    if (spriteCache === null || spriteCache.palette !== palette) {
      spriteCache = { palette, sprites: createSprites(palette) };
    }
    return spriteCache.sprites;
  };

  const now = (): number => performance.now();

  // Keyed on object identity: core keeps one Terrain per world, so this rebuilds on Generate only.
  const ensureTerrain = (snapshot: Snapshot): TerrainPaths => {
    if (terrainCache === null || terrainCache.terrain !== snapshot.terrain) {
      terrainCache = buildTerrainPaths(snapshot.terrain);
    }
    return terrainCache;
  };

  const ensureEdges = (snapshot: Snapshot): EdgePaths => {
    if (edgeCache === null || edgePathsStale(edgeCache, snapshot)) {
      edgeCache = buildEdgePaths(snapshot.nodes, snapshot.edges);
    }
    return edgeCache;
  };

  const ingest = (): void => {
    const snapshot = getSnapshot();
    const ui = uiStore.getState();
    const at = now();

    if (snapshot.tick !== ingestedTick) {
      // Pulses of the previous tick land now, whatever their wall-clock progress was.
      ripples.push(...ripplesForArrivals(arrivePulses(pulses, 1, true), at));
      pulses = livePulses(pulses);

      const result = ingestTransits(snapshot.transits, snapshot.tick, {
        showTopology: ui.showTopologyPackets,
      });
      pulses.push(...result.pulses);
      ripples.push(...ripplesForTouches(result.injects, 'inject', at));
      ripples.push(...ripplesForTouches(result.uplinks, 'uplink', at));
      if (result.injects.length > 0) {
        fxBus.emit('inject', { tick: snapshot.tick, nodes: result.injects.length });
      }
      if (result.uplinks.length > 0) {
        fxBus.emit('uplink', { tick: snapshot.tick, nodes: result.uplinks.length });
      }
      ingestedTick = snapshot.tick;
    }

    bursts.push(...burstsFromEvents(events.next(), at));
    dirty = true;
    schedule();
  };

  const resolveTrail = (
    snapshot: Snapshot,
    ui: UiState,
  ): { trail: Trail; chain: TrailEdge[]; color: string } | null => {
    const msgId = ui.highlightedMessageId;
    if (msgId === null) return null;
    if (
      trailCache === null ||
      trailCache.msgId !== msgId ||
      trailCache.tick !== snapshot.tick ||
      trailCache.path !== ui.highlightedPath
    ) {
      const ticks: (readonly TransitEvent[])[] = [];
      for (let t = Math.max(1, snapshot.tick - TRAIL_TICKS + 1); t <= snapshot.tick; t++) {
        ticks.push(engine.getTransits(t));
      }
      const trail = collectTrail(ticks, msgId);
      const message = snapshot.messages.find((m) => m.id === msgId);
      // A highlight whose message this world does not know (stale across a Generate) draws
      // no chain; its recorded path belongs to another run.
      let path: readonly NodeId[] = message ? (ui.highlightedPath ?? []) : [];
      if (path.length === 0 && message?.payload.kind === 'RESPONSE') {
        path = message.payload.returnPath;
      }
      trailCache = {
        msgId,
        tick: snapshot.tick,
        path: ui.highlightedPath,
        trail,
        chain: chainEdges(path),
        cls: message?.class ?? null,
      };
    }
    const palette = getPalette();
    const color = trailCache.cls === null ? palette.highlight : palette.cls[trailCache.cls];
    return { trail: trailCache.trail, chain: trailCache.chain, color };
  };

  const draw = (): void => {
    frame = null;
    if (destroyed) return;
    // Idle when nothing changed and nothing is in flight. Every producer (ingest, invalidate,
    // resize, the ui-store subscription) restarts the loop with schedule().
    if (!dirty && !fxDrawn && pulses.length === 0 && ripples.length === 0 && bursts.length === 0) {
      return;
    }
    const at = now();
    pulses = livePulses(pulses);
    ripples = liveRipples(ripples, at);
    bursts = liveBursts(bursts, at);
    const live = pulses.length > 0 || ripples.length > 0 || bursts.length > 0;
    // fxDrawn: the frame after the last particle retires still repaints, so it leaves no ghost.
    if (!dirty && !live && !fxDrawn) return;
    dirty = false;

    const snapshot = getSnapshot();
    const ui = uiStore.getState();
    const palette = getPalette();
    const transform = transformRef.current;
    const dpr = getDpr();
    const k = transform.k;
    const interval = Math.max(1, getTickIntervalMs());
    const t = clamp((at - getLastTickAt()) / interval, 0, 1);

    // Pulses that finished their flight spawn arrival ripples and retire.
    const arrivals = arrivePulses(pulses, t);
    if (arrivals.length > 0) ripples.push(...ripplesForArrivals(arrivals, at));

    const terrain = ensureTerrain(snapshot);
    const edges = ensureEdges(snapshot);
    const nodes = nodeIndex(snapshot.nodes);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(ctx, canvas.width / dpr, canvas.height / dpr, palette);

    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * transform.x, dpr * transform.y);
    drawTerrain(ctx, terrain, palette, k);
    drawRegionTints(ctx, snapshot.declarations, snapshot.world, palette, k);
    if (ui.showRanges) drawRangeCircles(ctx, snapshot.nodes, palette, k);

    // Alert vignette sits under edges and nodes so they stay legible in L1-L3.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mode = snapshot.globalMode;
    drawVignette(
      ctx,
      canvas.width / dpr,
      canvas.height / dpr,
      dpr,
      withAlpha(palette.mode[mode], MODE_VIGNETTE[mode]),
    );
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * transform.x, dpr * transform.y);
    drawEdges(ctx, edges, palette, k);

    const highlight = resolveTrail(snapshot, ui);
    if (highlight) {
      drawTrail(ctx, highlight.trail.edges, highlight.chain, nodes, highlight.color, k);
    }

    drawPulses(ctx, pulses, nodes, t, sprites(palette), palette, k);
    drawRipples(ctx, ripples, nodes, at, palette, k);
    drawBursts(ctx, bursts, nodes, at, palette, k);

    // Keep animating only while something is in flight (arrivals above may have added ripples).
    fxDrawn = pulses.length > 0 || ripples.length > 0 || bursts.length > 0;
    if (fxDrawn) schedule();
  };

  const schedule = (): void => {
    if (frame === null && !destroyed) frame = requestAnimationFrame(draw);
  };

  const unsubscribeEngine = engine.subscribe(ingest);
  const unsubscribeUi = uiStore.subscribe((state, prev) => {
    if (
      state.showRanges !== prev.showRanges ||
      state.showTopologyPackets !== prev.showTopologyPackets ||
      state.highlightedMessageId !== prev.highlightedMessageId ||
      state.highlightedPath !== prev.highlightedPath
    ) {
      dirty = true;
      schedule();
    }
  });
  schedule();

  return {
    invalidate: () => {
      dirty = true;
      schedule();
    },
    resize: (cssWidth, cssHeight, dpr) => {
      dprValue = dpr > 0 ? dpr : 1;
      const w = Math.max(1, Math.round(cssWidth * dprValue));
      const h = Math.max(1, Math.round(cssHeight * dprValue));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      dirty = true;
      schedule();
    },
    destroy: () => {
      destroyed = true;
      unsubscribeEngine();
      unsubscribeUi();
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
    },
  };
}
