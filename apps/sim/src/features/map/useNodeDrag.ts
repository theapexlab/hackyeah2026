import type { NodeId, NodeView } from '@pomoc/core';
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useMemo,
} from 'react';
import { dragTarget, type Point, type Transform } from '../../lib/geometry';
import { moveNode } from '../../sim/commands';
import { useSimStore } from '../../sim/store';

/** Pointer travel (screen px) below this is a click, not a drag: selection and double-click keep working. */
export const DRAG_THRESHOLD_PX = 4;

export interface NodeDragHandlers {
  onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void;
  /** Capture phase: swallows the click (and a possible dblclick) the browser fires after a drag's pointerup. */
  onClickCapture(event: ReactMouseEvent<SVGSVGElement>): void;
  onDoubleClickCapture(event: ReactMouseEvent<SVGSVGElement>): void;
}

interface Drag {
  readonly id: NodeId;
  readonly pointerId: number;
  /** The <svg> the drag started on; it holds the pointer capture and the data-dragging cursor flag. */
  readonly surface: SVGSVGElement;
  /** Screen position of the pointerdown and the node's world position at that moment. */
  readonly startX: number;
  readonly startY: number;
  readonly origin: Point;
  /** True once the pointer travelled past DRAG_THRESHOLD_PX. */
  moved: boolean;
  /** Latest world target not yet dispatched (coalesced to one MoveNode per animation frame). */
  pending: Point | null;
  frame: number | null;
}

/** The glyph under a pointerdown, if it is a phone (routers and gateways are static). */
function mobileAt(target: EventTarget | null): NodeView | null {
  if (!(target instanceof Element)) return null;
  const raw = target.closest('[data-node]')?.getAttribute('data-node');
  if (!raw) return null;
  // NodeId is branded; the attribute round-trips a real id, so compare instead of casting.
  const node = useSimStore.getState().snapshot.nodes.find((n) => n.id === raw);
  return node !== undefined && node.kind === 'mobile' ? node : null;
}

/**
 * Drag-to-move for phones on the SVG layer. Screen travel since pointerdown is divided by the
 * live zoom scale (transformRef.current.k) to get a world offset from the node's start position,
 * clamped to the world bounds, and dispatched as MoveNode at most once per animation frame
 * plus once on release. The engine recomputes adjacency; nothing here knows about radio range.
 * Window listeners live only for the duration of a drag and are removed on pointerup,
 * pointercancel and unmount (StrictMode-safe).
 */
export function useNodeDrag(transformRef: RefObject<Transform>): NodeDragHandlers {
  const controller = useMemo(() => {
    let drag: Drag | null = null;
    let swallowTimer: ReturnType<typeof setTimeout> | null = null;

    /** Records the latest pointer position as a world target; false while still inside the click threshold. */
    const track = (d: Drag, event: PointerEvent): boolean => {
      const dx = event.clientX - d.startX;
      const dy = event.clientY - d.startY;
      if (!d.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return false;
        d.moved = true;
      }
      d.pending = dragTarget(
        d.origin,
        { x: dx, y: dy },
        transformRef.current.k,
        useSimStore.getState().snapshot.world,
      );
      return true;
    };

    const flush = (d: Drag): void => {
      if (d.frame !== null) {
        cancelAnimationFrame(d.frame);
        d.frame = null;
      }
      if (d.pending !== null) {
        moveNode(d.id, d.pending.x, d.pending.y);
        d.pending = null;
      }
    };

    const detach = (d: Drag): void => {
      drag = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      d.surface.removeAttribute('data-dragging');
      if (d.surface.hasPointerCapture(d.pointerId)) d.surface.releasePointerCapture(d.pointerId);
      if (d.frame !== null) {
        cancelAnimationFrame(d.frame);
        d.frame = null;
      }
    };

    /** The browser dispatches click (and dblclick) synchronously after pointerup; a 0 ms timer runs after both. */
    const swallowNextClick = (): void => {
      if (swallowTimer !== null) clearTimeout(swallowTimer);
      swallowTimer = setTimeout(() => {
        swallowTimer = null;
      }, 0);
    };

    function onPointerMove(event: PointerEvent): void {
      const d = drag;
      if (d === null || event.pointerId !== d.pointerId || !track(d, event)) return;
      if (d.frame === null) {
        d.frame = requestAnimationFrame(() => {
          d.frame = null;
          flush(d);
        });
      }
    }

    function onPointerUp(event: PointerEvent): void {
      const d = drag;
      if (d === null || event.pointerId !== d.pointerId) return;
      track(d, event);
      detach(d);
      if (!d.moved) return; // a click: let selection and double-click proceed as usual
      flush(d);
      swallowNextClick();
    }

    function onPointerCancel(event: PointerEvent): void {
      const d = drag;
      if (d === null || event.pointerId !== d.pointerId) return;
      detach(d);
      flush(d); // no click follows a cancel, so nothing to swallow
    }

    const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
      if (event.button !== 0 || drag !== null) return;
      const node = mobileAt(event.target);
      if (node === null) return;
      const surface = event.currentTarget;
      drag = {
        id: node.id,
        pointerId: event.pointerId,
        surface,
        startX: event.clientX,
        startY: event.clientY,
        origin: { x: node.x, y: node.y },
        moved: false,
        pending: null,
        frame: null,
      };
      surface.setPointerCapture(event.pointerId);
      surface.setAttribute('data-dragging', '');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
    };

    const swallow = (event: ReactMouseEvent<SVGSVGElement>): void => {
      if (swallowTimer !== null) event.stopPropagation();
    };

    const dispose = (): void => {
      if (drag !== null) detach(drag);
      if (swallowTimer !== null) {
        clearTimeout(swallowTimer);
        swallowTimer = null;
      }
    };

    return { onPointerDown, onClickCapture: swallow, onDoubleClickCapture: swallow, dispose };
  }, [transformRef]);

  useEffect(() => controller.dispose, [controller]);

  return controller;
}
