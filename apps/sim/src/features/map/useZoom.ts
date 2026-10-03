import { select } from 'd3-selection';
import { type ZoomBehavior, zoom, zoomIdentity } from 'd3-zoom';
import { type RefObject, useCallback, useEffect, useRef } from 'react';
import type { Transform } from '../../lib/geometry';

interface UseZoomArgs {
  containerRef: RefObject<HTMLDivElement | null>;
  /** SVG `<g>` that receives the transform attribute. */
  groupRef: RefObject<SVGGElement | null>;
  /** SVG root that receives the --inv-k custom property (glyph counter-scale). */
  svgRef: RefObject<SVGSVGElement | null>;
  getWorld: () => { width: number; height: number };
  getNodePos: (id: string) => { x: number; y: number } | undefined;
}

const PADDING = 0.92;

/**
 * d3-zoom on the container. Pan/zoom write `transformRef` (read by the canvas rAF loop) and the
 * SVG group attribute directly; React state is never involved.
 */
export function useZoom({ containerRef, groupRef, svgRef, getWorld, getNodePos }: UseZoomArgs) {
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 });
  const behaviorRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const userMovedRef = useRef(false);
  const getWorldRef = useRef(getWorld);
  const getNodePosRef = useRef(getNodePos);
  getWorldRef.current = getWorld;
  getNodePosRef.current = getNodePos;

  const apply = useCallback(
    (t: Transform) => {
      transformRef.current = t;
      groupRef.current?.setAttribute('transform', `translate(${t.x} ${t.y}) scale(${t.k})`);
      svgRef.current?.style.setProperty('--inv-k', String(1 / t.k));
    },
    [groupRef, svgRef],
  );

  const tweenRef = useRef(0);

  const moveTo = useCallback(
    (x: number, y: number, k: number, animate: boolean) => {
      const el = containerRef.current;
      const behavior = behaviorRef.current;
      if (!el || !behavior) return;
      cancelAnimationFrame(tweenRef.current);
      const sel = select(el);
      const to = zoomIdentity.translate(x, y).scale(k);
      if (!animate) {
        sel.call(behavior.transform, to);
        return;
      }
      const from = transformRef.current;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / 450);
        const e = 1 - (1 - t) ** 3;
        // Interpolate k geometrically so zoom feels uniform.
        const kk = from.k * (to.k / from.k) ** e;
        const xx = from.x + (to.x - from.x) * e;
        const yy = from.y + (to.y - from.y) * e;
        sel.call(behavior.transform, zoomIdentity.translate(xx, yy).scale(kk));
        if (t < 1) tweenRef.current = requestAnimationFrame(step);
      };
      tweenRef.current = requestAnimationFrame(step);
    },
    [containerRef],
  );

  const fitToWorld = useCallback(
    (animate = true) => {
      const el = containerRef.current;
      const { width, height } = getWorldRef.current();
      if (!el || !width || !height || !el.clientWidth || !el.clientHeight) return;
      const k = Math.min(el.clientWidth / width, el.clientHeight / height) * PADDING;
      moveTo((el.clientWidth - width * k) / 2, (el.clientHeight - height * k) / 2, k, animate);
      userMovedRef.current = false;
    },
    [containerRef, moveTo],
  );

  const focusNode = useCallback(
    (id: string) => {
      const el = containerRef.current;
      const p = getNodePosRef.current(id);
      if (!el || !p) return;
      const k = 3;
      moveTo(el.clientWidth / 2 - p.x * k, el.clientHeight / 2 - p.y * k, k, true);
    },
    [containerRef, moveTo],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const behavior = zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.2, 12])
      .filter((e: Event) => {
        const target = e.target as Element | null;
        if (e.type !== 'wheel' && target?.closest('[data-node], [data-no-zoom]')) return false;
        if (e.type === 'dblclick') return false;
        return (!(e as MouseEvent).ctrlKey || e.type === 'wheel') && !(e as MouseEvent).button;
      })
      .on('zoom', (e) => {
        const { x, y, k } = e.transform;
        if (e.sourceEvent) userMovedRef.current = true;
        apply({ x, y, k });
      });
    behaviorRef.current = behavior;
    const sel = select(el);
    sel.call(behavior);
    sel.on('dblclick.zoom', null);

    const onDblClick = (e: MouseEvent) => {
      const id = (e.target as Element | null)?.closest('[data-node]')?.getAttribute('data-node');
      if (id) focusNode(id);
    };
    el.addEventListener('dblclick', onDblClick);

    const ro = new ResizeObserver(() => {
      if (!userMovedRef.current) fitToWorld(false);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      el.removeEventListener('dblclick', onDblClick);
      cancelAnimationFrame(tweenRef.current);
      sel.on('.zoom', null);
      behaviorRef.current = null;
    };
  }, [containerRef, apply, fitToWorld, focusNode]);

  return { transformRef, fitToWorld, focusNode };
}
