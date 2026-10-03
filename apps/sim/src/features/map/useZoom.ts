import { select } from 'd3-selection';
import {
  type D3ZoomEvent,
  zoom as d3Zoom,
  type ZoomBehavior,
  type ZoomTransform,
  zoomIdentity,
  zoomTransform,
} from 'd3-zoom';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import {
  fitTransform,
  focusTransform,
  IDENTITY_TRANSFORM,
  type Transform,
} from '../../lib/geometry';

export interface ZoomController {
  /** Live view transform; read by the canvas every frame. Never set it directly. */
  readonly transformRef: RefObject<Transform>;
  fitToWorld(worldWidth: number, worldHeight: number, animate?: boolean): void;
  focusNode(x: number, y: number, scale?: number, animate?: boolean): void;
  zoomBy(factor: number): void;
  /** Subscribe to transform changes (canvas dirty flag). Returns an unsubscribe. */
  onTransform(listener: (t: Transform) => void): () => void;
}

export interface UseZoomOptions {
  readonly minScale?: number;
  readonly maxScale?: number;
}

const ANIMATION_MS = 400;
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/** d3's default filter plus: drags that start on a node glyph belong to the glyph, not the camera. */
function zoomFilter(event: Event): boolean {
  const target = event.target;
  if (event.type !== 'wheel' && target instanceof Element && target.closest('[data-node]')) {
    return false;
  }
  const mouse = event as MouseEvent;
  return (!mouse.ctrlKey || event.type === 'wheel') && !mouse.button;
}

function toZoomTransform(t: Transform): ZoomTransform {
  return zoomIdentity.translate(t.x, t.y).scale(t.k);
}

/**
 * Binds d3-zoom to the map container. Pan/zoom never touches React state: the handler
 * writes transformRef, sets the SVG <g> transform attribute and notifies canvas listeners.
 */
export function useZoom(
  containerRef: RefObject<HTMLDivElement | null>,
  gRef: RefObject<SVGGElement | null>,
  options: UseZoomOptions = {},
): ZoomController {
  const { minScale = 0.2, maxScale = 8 } = options;
  const transformRef = useRef<Transform>(IDENTITY_TRANSFORM);
  const listenersRef = useRef(new Set<(t: Transform) => void>());
  const behaviourRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const apply = (zt: ZoomTransform): void => {
      const t: Transform = { x: zt.x, y: zt.y, k: zt.k };
      transformRef.current = t;
      gRef.current?.setAttribute('transform', `translate(${zt.x} ${zt.y}) scale(${zt.k})`);
      for (const listener of listenersRef.current) listener(t);
    };

    const behaviour = d3Zoom<HTMLDivElement, unknown>()
      .scaleExtent([minScale, maxScale])
      .filter(zoomFilter)
      .on('zoom', (event: D3ZoomEvent<HTMLDivElement, unknown>) => apply(event.transform));
    behaviourRef.current = behaviour;

    const selection = select(el);
    selection.call(behaviour).on('dblclick.zoom', null);
    // d3 keeps the transform on the element (__zoom), so a StrictMode remount resumes where it was.
    apply(zoomTransform(el));

    return () => {
      selection.on('.zoom', null);
      behaviourRef.current = null;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [containerRef, gRef, minScale, maxScale]);

  return useMemo<ZoomController>(() => {
    const cancelAnimation = (): void => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };

    const setTransform = (target: Transform, animate: boolean): void => {
      const el = containerRef.current;
      const behaviour = behaviourRef.current;
      if (!el || !behaviour) return;
      cancelAnimation();
      const selection = select(el);
      if (!animate) {
        behaviour.transform(selection, toZoomTransform(target));
        return;
      }
      const from = transformRef.current;
      const start = performance.now();
      const frame = (now: number): void => {
        const p = Math.min(1, (now - start) / ANIMATION_MS);
        const e = easeOutCubic(p);
        behaviour.transform(
          selection,
          toZoomTransform({
            x: from.x + (target.x - from.x) * e,
            y: from.y + (target.y - from.y) * e,
            k: from.k + (target.k - from.k) * e,
          }),
        );
        animationRef.current = p < 1 ? requestAnimationFrame(frame) : null;
      };
      animationRef.current = requestAnimationFrame(frame);
    };

    return {
      transformRef,
      fitToWorld: (worldWidth, worldHeight, animate = true) => {
        const el = containerRef.current;
        if (!el) return;
        setTransform(
          fitTransform(worldWidth, worldHeight, el.clientWidth, el.clientHeight),
          animate,
        );
      },
      focusNode: (x, y, scale = 2.5, animate = true) => {
        const el = containerRef.current;
        if (!el) return;
        setTransform(focusTransform(x, y, el.clientWidth, el.clientHeight, scale), animate);
      },
      zoomBy: (factor) => {
        const el = containerRef.current;
        const behaviour = behaviourRef.current;
        if (!el || !behaviour) return;
        cancelAnimation();
        behaviour.scaleBy(select(el), factor);
      },
      onTransform: (listener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
    };
  }, [containerRef]);
}
