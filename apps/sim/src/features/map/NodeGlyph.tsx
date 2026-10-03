import { Badge, Tooltip } from '@mantine/core';
import type { NodeView } from '@pomoc/core';
import { IconAntenna, IconDeviceMobile, IconWifi } from '@tabler/icons-react';
import { memo } from 'react';
import { formatNodeId } from '../../lib/format';
import { modeColors } from '../../theme/tokens';
import { useUIStore } from '../../ui/store';

interface NodeGlyphProps {
  node: NodeView;
  transform: {
    x: number;
    y: number;
    k: number;
  };
  onClick: () => void;
  onHover: () => void;
  onLeave: () => void;
  isSelected: boolean;
  isHovered: boolean;
}

const IconMap: Record<string, any> = {
  mobile: IconDeviceMobile,
  router: IconWifi,
  gateway: IconAntenna,
};

export const NodeGlyph = memo(function NodeGlyph({
  node,
  transform,
  onClick,
  onHover,
  onLeave,
  isSelected,
  isHovered,
}: NodeGlyphProps) {
  const x = (node.x - transform.x) * transform.k;
  const y = (node.y - transform.y) * transform.k;
  const scale = isHovered ? 1.15 : 1;

  const Icon = IconMap[node.kind] || IconDeviceMobile;
  const modeColor = modeColors[node.mode];

  return (
    <Tooltip label={formatNodeId(node.id)} position="top">
      <g
        transform={`translate(${x}, ${y}) scale(${scale})`}
        style={{ cursor: 'pointer' }}
        data-node={node.id}
        onClick={onClick}
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
      >
        {/* Backhaul ring */}
        {node.hasBackhaul && (
          <circle r={18} fill="none" stroke="#51cf66" strokeWidth="2" opacity={0.6} />
        )}

        {/* Mode ring */}
        <circle
          r={14}
          fill="none"
          stroke={modeColor}
          strokeWidth={2}
          style={{
            strokeDasharray: node.credentialKind === 'none' ? '4,4' : 'none',
            opacity: node.alive ? 1 : 0.35,
          }}
        />

        {/* Icon */}
        <foreignObject x={-8} y={-8} width={16} height={16}>
          <Icon size={16} color={node.alive ? 'white' : 'gray'} style={{ width: 16, height: 16 }} />
        </foreignObject>

        {/* Store badge */}
        {node.storeSize > 0 && (
          <g transform="translate(8, -8)">
            <circle r={6} fill="#ffd43b" />
            <text x={0} y={3} textAnchor="middle" fontSize="8" fill="black" fontWeight="bold">
              {node.storeSize}
            </text>
          </g>
        )}

        {/* Selection ring */}
        {isSelected && (
          <circle r={20} fill="none" stroke="white" strokeWidth="2" opacity={0.8}>
            <animate attributeName="r" values="20;24;20" dur="1.5s" repeatCount="indefinite" />
          </circle>
        )}
      </g>
    </Tooltip>
  );
});
