import { useEffect, useRef } from 'react';
import type { Transform } from '../../lib/geometry';
import { useEngine, useLastTickAt, useTickIntervalMs } from '../../sim/selectors';
import { useUIStore } from '../../ui/store';
import { createRenderer } from './renderer/createRenderer';

interface CanvasLayerProps {
  transformRef: React.MutableRefObject<Transform>;
}

export function CanvasLayer({ transformRef }: CanvasLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useEngine();
  const lastTickAt = useLastTickAt();
  const tickIntervalMs = useTickIntervalMs();
  const speed = useUIStore((s) => s.speed);
  const showRanges = useUIStore((s) => s.showRanges);
  const showTopologyPackets = useUIStore((s) => s.showTopologyPackets);

  useEffect(() => {
    if (!canvasRef.current || !engine) return;

    const scheme = document.documentElement.getAttribute('data-mantine-color-scheme') as
      | 'light'
      | 'dark'
      | null;

    const renderer = createRenderer({
      canvas: canvasRef.current,
      transformRef,
      engine,
      lastTickAt,
      tickIntervalMs,
      speed,
      showRanges,
      showTopologyPackets,
      scheme: scheme || 'dark',
    });

    return () => renderer.dispose();
  }, [engine, lastTickAt, tickIntervalMs, speed, showRanges, showTopologyPackets, transformRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
      }}
    />
  );
}
