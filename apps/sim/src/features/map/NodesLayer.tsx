import type { RefObject } from 'react';
import type { Transform } from '../../lib/geometry';
import { useSimStore } from '../../sim/store';
import { useUiStore } from '../../ui/store';
import { NodeGlyph } from './NodeGlyph';
import { useNodeDrag } from './useNodeDrag';

interface NodesLayerProps {
  readonly gRef: RefObject<SVGGElement | null>;
  /** Live view transform from useZoom; drags convert screen travel to world units with its scale. */
  readonly transformRef: RefObject<Transform>;
}

/** Middle layer: the clickable SVG glyphs. The <g> transform is owned by useZoom, never by React. */
export function NodesLayer({ gRef, transformRef }: NodesLayerProps) {
  const nodes = useSimStore((s) => s.snapshot.nodes);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const hoveredNodeId = useUiStore((s) => s.hoveredNodeId);
  const deselect = useUiStore((s) => s.deselect);
  const drag = useNodeDrag(transformRef);

  return (
    <svg
      className="pomoc-nodes"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
      onClick={deselect}
      onClickCapture={drag.onClickCapture}
      onDoubleClickCapture={drag.onDoubleClickCapture}
      onPointerDown={drag.onPointerDown}
    >
      <g ref={gRef}>
        {nodes.map((node) => (
          <NodeGlyph
            key={node.id}
            id={node.id}
            kind={node.kind}
            x={node.x}
            y={node.y}
            mode={node.mode}
            alive={node.alive}
            hasBackhaul={node.hasBackhaul}
            credentialKind={node.credentialKind}
            storeSize={node.storeSize}
            openRequests={node.openRequests}
            selected={selectedNodeId === node.id}
            hovered={hoveredNodeId === node.id}
          />
        ))}
      </g>
    </svg>
  );
}
