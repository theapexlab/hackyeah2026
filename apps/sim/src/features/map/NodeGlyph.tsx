import { Tooltip } from '@mantine/core';
import type { NodeKind, NodeView } from '@pomoc/core';
import {
  IconAntenna,
  IconDeviceMobile,
  IconPlugOff,
  type IconProps,
  IconWifi,
} from '@tabler/icons-react';
import { type ComponentType, memo } from 'react';
import { formatNodeId } from '../../lib/format';
import { modeCss } from '../../theme/tokens';

const ICONS: Record<NodeKind, ComponentType<IconProps>> = {
  mobile: IconDeviceMobile,
  router: IconWifi,
  gateway: IconAntenna,
};

interface NodeGlyphProps {
  node: NodeView;
  selected: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
}

const sameGlyph = (a: NodeGlyphProps, b: NodeGlyphProps): boolean =>
  a.selected === b.selected &&
  a.onSelect === b.onSelect &&
  a.onHover === b.onHover &&
  a.onDragStart === b.onDragStart &&
  a.node.id === b.node.id &&
  a.node.x === b.node.x &&
  a.node.y === b.node.y &&
  a.node.alive === b.node.alive &&
  a.node.mode === b.node.mode &&
  a.node.hasBackhaul === b.node.hasBackhaul &&
  a.node.storeSize === b.node.storeSize &&
  a.node.credentialKind === b.node.credentialKind;

export const NodeGlyph = memo(function NodeGlyph({
  node,
  selected,
  onSelect,
  onHover,
  onDragStart,
}: NodeGlyphProps) {
  const Icon = ICONS[node.kind];
  const label = `${formatNodeId(node.id)}${node.alive ? '' : ' (powered off)'}`;
  return (
    <Tooltip label={label} position="top" openDelay={120} withinPortal>
      {/* biome-ignore lint/a11y/useSemanticElements: SVG <g> cannot be a <button> */}
      <g
        className="node-glyph"
        data-node={node.id}
        role="button"
        tabIndex={0}
        aria-label={`${label}, mode ${node.mode}`}
        style={{
          transform: `translate(${node.x}px, ${node.y}px) scale(var(--inv-k, 1))`,
          pointerEvents: 'all',
        }}
        onMouseDown={(e) => onDragStart(node.id, e)}
        onClick={() => onSelect(node.id)}
        onKeyDown={(e) => (e.key === 'Enter' ? onSelect(node.id) : undefined)}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(null)}
      >
        <circle className="node-hit" r={16} fill="transparent" />
        <g className="node-body" opacity={node.alive ? 1 : 0.35}>
          {node.hasBackhaul && (
            <circle r={15.5} fill="none" stroke="var(--mantine-color-green-5)" strokeWidth={2} />
          )}
          <circle
            r={11}
            fill="var(--mantine-color-body)"
            strokeWidth={2.5}
            strokeDasharray={node.credentialKind === 'none' ? '4 3' : undefined}
            style={{ stroke: modeCss(node.mode) }}
          />
          <Icon x={-7} y={-7} size={14} stroke={2} color="var(--mantine-color-text)" />
        </g>
        {!node.alive && (
          <IconPlugOff x={-15} y={4} size={10} stroke={2.4} color="var(--mantine-color-red-5)" />
        )}
        {node.storeSize > 0 && (
          <g className="store-badge" transform="translate(10 -10)">
            <circle r={6.5} fill="var(--mantine-color-yellow-5)" />
            <text y={3} textAnchor="middle" fontSize={9} fontWeight={700} fill="#000">
              {node.storeSize}
            </text>
          </g>
        )}
        {selected && (
          <circle
            className="sel-ring"
            r={19}
            fill="none"
            stroke="var(--mantine-color-text)"
            strokeWidth={2}
          />
        )}
      </g>
    </Tooltip>
  );
}, sameGlyph);
