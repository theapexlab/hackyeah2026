import type { Transform } from '../../lib/geometry';
import { useSimNodes } from '../../sim/selectors';
import { useUIStore } from '../../ui/store';
import { NodeGlyph } from './NodeGlyph';

interface NodesLayerProps {
  transform: Transform;
}

export function NodesLayer({ transform }: NodesLayerProps) {
  const nodes = (useSimNodes() as any[]) || [];
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const hoveredNodeId = useUIStore((s) => s.hoveredNodeId);
  const setSelectedNodeId = useUIStore((s) => s.setSelectedNodeId);
  const setHoveredNodeId = useUIStore((s) => s.setHoveredNodeId);

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <g pointerEvents="auto">
        {nodes.map((node: any) => (
          <NodeGlyph
            key={node.id}
            node={node}
            transform={transform}
            onClick={() => setSelectedNodeId(node.id)}
            onHover={() => setHoveredNodeId(node.id)}
            onLeave={() => setHoveredNodeId(null)}
            isSelected={selectedNodeId === node.id}
            isHovered={hoveredNodeId === node.id}
          />
        ))}
      </g>
    </svg>
  );
}
