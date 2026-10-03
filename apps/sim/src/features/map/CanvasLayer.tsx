import { useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSimStore } from '../../sim/store';
import { type Palette, resolvePalette } from '../../theme/tokens';
import { useUiStore } from '../../ui/store';
import { createRenderer, type Renderer } from './renderer/createRenderer';
import type { ZoomController } from './useZoom';

function readDpr(): number {
  return typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
}

interface CanvasLayerProps {
  readonly width: number;
  readonly height: number;
  readonly zoom: ZoomController;
}

/**
 * Bottom layer. Mounts one renderer per engine (StrictMode-safe: the effect destroys it on
 * cleanup and recreates it on remount). The renderer owns the canvas backing store, sized in
 * device pixels through resize(); React only positions the element.
 */
export function CanvasLayer({ width, height, zoom }: CanvasLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const theme = useMantineTheme();
  const scheme = useComputedColorScheme('dark');
  const palette = useMemo(() => resolvePalette(theme, scheme), [theme, scheme]);
  const paletteRef = useRef<Palette>(palette);
  const engine = useSimStore((s) => s.engine);
  const [dpr, setDpr] = useState(() => readDpr());
  const rendererRef = useRef<Renderer | null>(null);
  const sizeRef = useRef({ width, height, dpr });
  sizeRef.current = { width, height, dpr };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer({
      engine,
      uiStore: useUiStore,
      transformRef: zoom.transformRef,
      canvas,
      getPalette: () => paletteRef.current,
      getLastTickAt: () => useSimStore.getState().lastTickAt,
      // Store interval is per tick at speed 1; the real wall-clock tick is shorter when sped up.
      getTickIntervalMs: () => useSimStore.getState().tickIntervalMs / useUiStore.getState().speed,
      // Read through the store so the dev fixture (setSnapshotSource) is honoured.
      getSnapshot: () => useSimStore.getState().snapshot,
    });
    rendererRef.current = renderer;
    const size = sizeRef.current;
    renderer.resize(size.width, size.height, size.dpr);
    const unsubscribeZoom = zoom.onTransform(renderer.invalidate);
    return () => {
      unsubscribeZoom();
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [engine, zoom]);

  // A window moving between screens changes the ratio; the media query flips exactly then.
  useEffect(() => {
    const query = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = (): void => setDpr(readDpr());
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [dpr]);

  // Palette swaps and resizes do not remount the renderer; they just ask for a frame.
  useEffect(() => {
    paletteRef.current = palette;
    rendererRef.current?.invalidate();
  }, [palette]);

  useEffect(() => {
    rendererRef.current?.resize(width, height, dpr);
  }, [width, height, dpr]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}
