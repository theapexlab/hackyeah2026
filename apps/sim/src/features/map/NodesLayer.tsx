import { nodeIdFromString } from '@pomoc/core';
import { type MouseEvent as ReactMouseEvent, type RefObject, useCallback, useRef } from 'react';
import { screenToWorld, type Transform } from '../../lib/geometry';
import { simCommands } from '../../sim/commands';
import { useSimNodes } from '../../sim/selectors';
import { useSimStore } from '../../sim/store';
import { useUIStore } from '../../ui/store';
import { NodeGlyph } from './NodeGlyph';

interface NodesLayerProps {
  svgRef: RefObject<SVGSVGElement | null>;
  groupRef: RefObject<SVGGElement | null>;
  transformRef: RefObject<Transform>;
}

const DRAG_THRESHOLD_PX = 4;

export function NodesLayer({ svgRef, groupRef, transformRef }: NodesLayerProps) {
  const nodes = useSimNodes();
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const dragged = useRef(false);
  const onSelect = useCallback((id: string) => {
    if (!dragged.current) useUIStore.getState().select(id);
    dragged.current = false;
  }, []);
  // Dragging a phone moves it in the engine (MOVE_NODE), e.g. to bridge two islands.
  const onDragStart = useCallback(
    (id: string, e: ReactMouseEvent) => {
      const node = useSimStore.getState().snapshot?.nodes.find((n) => n.id === id);
      if (node?.kind !== 'mobile' || e.button !== 0) return;
      dragged.current = false;
      const start = { x: e.clientX, y: e.clientY };
      let pending = false;
      let latest: { x: number; y: number } | null = null;
      const onMove = (ev: MouseEvent) => {
        if (
          !dragged.current &&
          Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD_PX
        )
          return;
        dragged.current = true;
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        latest = screenToWorld(
          { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
          transformRef.current,
        );
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          if (latest) simCommands.moveNode(nodeIdFromString(id), latest.x, latest.y);
        });
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        // `click` fires right after mouseup; clear the flag once it has had its chance.
        setTimeout(() => {
          dragged.current = false;
        }, 0);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [svgRef, transformRef],
  );
  const onHover = useCallback((id: string | null) => useUIStore.getState().setHovered(id), []);

  return (
    <svg
      ref={svgRef}
      aria-label="Mesh nodes"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <g ref={groupRef}>
        {nodes.map((n) => (
          <NodeGlyph
            key={n.id}
            node={n}
            selected={selectedNodeId === n.id}
            onSelect={onSelect}
            onHover={onHover}
            onDragStart={onDragStart}
          />
        ))}
      </g>
    </svg>
  );
}
