import { select } from 'd3-selection';
import { type ZoomBehavior, zoom, zoomIdentity } from 'd3-zoom';
import { useEffect, useRef } from 'react';
import type { Transform } from '../../lib/geometry';

export interface UseZoomOptions {
  onTransform?: (transform: Transform) => void;
}

export function useZoom(containerRef: React.RefObject<HTMLElement>, options: UseZoomOptions = {}) {
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 });
  const zoomRef = useRef<ZoomBehavior<Element, unknown> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = select<Element, unknown>(containerRef.current);
    const zoomBehavior = zoom<Element, unknown>().on('zoom', (e: any) => {
      const t = e.transform;
      transformRef.current = { x: t.x, y: t.y, k: t.k };
      options.onTransform?.(transformRef.current);
    });

    try {
      container.call(zoomBehavior);
      zoomRef.current = zoomBehavior;
    } catch (error) {
      console.error('Failed to attach zoom behavior:', error);
    }

    return () => {
      try {
        container.on('.zoom', null);
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [options]);

  const fitToWorld = (width: number, height: number, worldWidth: number, worldHeight: number) => {
    if (!containerRef.current || !zoomRef.current) return;

    const container = select<Element, unknown>(containerRef.current);
    const scaleX = width / worldWidth;
    const scaleY = height / worldHeight;
    const k = Math.min(scaleX, scaleY) * 0.9;
    const x = (width - worldWidth * k) / (2 * k);
    const y = (height - worldHeight * k) / (2 * k);

    const t = zoomIdentity.translate(x, y).scale(k);
    container.call(zoomRef.current.transform, t);
  };

  const focusNode = (
    nodeX: number,
    nodeY: number,
    width: number,
    height: number,
    padding = 100,
  ) => {
    if (!containerRef.current || !zoomRef.current) return;

    const container = select<Element, unknown>(containerRef.current);
    const k = Math.min(width, height) / (2 * padding);
    const x = width / 2 - nodeX * k;
    const y = height / 2 - nodeY * k;

    const t = zoomIdentity.translate(x, y).scale(k);
    container.call(zoomRef.current.transform, t);
  };

  return { transformRef, fitToWorld, focusNode };
}
