import { useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { type RefObject, useEffect, useRef } from 'react';
import type { Transform } from '../../lib/geometry';
import { useSimStore } from '../../sim/store';
import { resolvePalette } from '../../theme/tokens';
import { useUIStore } from '../../ui/store';
import { createRenderer, type RenderView } from './renderer/createRenderer';

interface CanvasLayerProps {
  transformRef: RefObject<Transform>;
}

export function CanvasLayer({ transformRef }: CanvasLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useSimStore((s) => s.engine);
  const theme = useMantineTheme();
  const scheme = useComputedColorScheme('dark');
  const paletteRef = useRef(resolvePalette(theme, scheme));
  paletteRef.current = resolvePalette(theme, scheme);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !engine) return;
    const getView = (): RenderView => {
      const ui = useUIStore.getState();
      return {
        transform: transformRef.current,
        palette: paletteRef.current,
        tickMs: useSimStore.getState().tickIntervalMs / ui.speed,
        showRanges: ui.showRanges,
        showTopologyPackets: ui.showTopologyPackets,
        selectedId: ui.selectedNodeId,
        hoveredId: ui.hoveredNodeId,
        highlightedMessageId: ui.highlightedMessageId,
      };
    };
    const renderer = createRenderer(canvas, engine, getView);
    return renderer.dispose;
  }, [engine, transformRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
}
