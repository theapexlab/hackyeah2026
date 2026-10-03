import { Tooltip } from '@mantine/core';
import type { CredentialKind, Mode, NodeId, NodeKind } from '@pomoc/core';
import { IconPlugConnectedX } from '@tabler/icons-react';
import { type MouseEvent, memo } from 'react';
import { formatKind } from '../../lib/format';
import { KIND_ICON } from '../../theme/icons';
import { MODE_LABEL, modeColorVar } from '../../theme/tokens';
import { useUiStore } from '../../ui/store';

export interface NodeGlyphProps {
  readonly id: NodeId;
  readonly kind: NodeKind;
  readonly x: number;
  readonly y: number;
  readonly mode: Mode;
  readonly alive: boolean;
  readonly hasBackhaul: boolean;
  readonly credentialKind: CredentialKind;
  readonly storeSize: number;
  readonly selected: boolean;
  readonly hovered: boolean;
}

const RADIUS: Readonly<Record<NodeKind, number>> = { mobile: 9, router: 12, gateway: 14 };

function handleClick(event: MouseEvent<SVGGElement>, id: NodeId): void {
  event.stopPropagation();
  useUiStore.getState().select(id);
}

function handleDoubleClick(event: MouseEvent<SVGGElement>, id: NodeId): void {
  event.stopPropagation();
  useUiStore.getState().requestFocus(id);
}

/** One clickable node. Props are primitives so memo() skips it unless its own state changed. */
export const NodeGlyph = memo(function NodeGlyph({
  id,
  kind,
  x,
  y,
  mode,
  alive,
  hasBackhaul,
  credentialKind,
  storeSize,
  selected,
  hovered,
}: NodeGlyphProps) {
  const r = RADIUS[kind];
  const iconSize = Math.round(r * 1.25);
  const Icon = KIND_ICON[kind];
  const ring = modeColorVar(mode);
  const transform = `translate(${x} ${y})${hovered ? ' scale(1.15)' : ''}`;
  const label = [
    id,
    formatKind(kind),
    MODE_LABEL[mode],
    credentialKind === 'none' ? 'unregistered' : null,
    alive ? null : 'OFF',
  ]
    .filter((part) => part !== null)
    .join(' · ');

  return (
    <Tooltip label={label} openDelay={250} withinPortal>
      <g
        data-node={id}
        transform={transform}
        className="pomoc-node"
        style={{ cursor: 'pointer', opacity: alive ? 1 : 0.35 }}
        onClick={(event) => handleClick(event, id)}
        onDoubleClick={(event) => handleDoubleClick(event, id)}
        onPointerEnter={() => useUiStore.getState().hover(id)}
        onPointerLeave={() => useUiStore.getState().hover(null)}
      >
        {hasBackhaul ? (
          <circle
            r={r + 5}
            fill="none"
            style={{ stroke: 'var(--mantine-color-green-5)' }}
            strokeWidth={1.5}
            strokeOpacity={0.9}
          />
        ) : null}
        {selected ? (
          <circle
            className="pomoc-node-selected"
            r={r + 8}
            fill="none"
            style={{ stroke: ring }}
            strokeWidth={2.5}
          />
        ) : null}
        <circle
          r={r}
          style={{ fill: 'var(--pomoc-node-fill)', stroke: ring }}
          strokeWidth={2.5}
          strokeDasharray={credentialKind === 'none' ? '3 2.5' : undefined}
        />
        <Icon
          x={-iconSize / 2}
          y={-iconSize / 2}
          width={iconSize}
          height={iconSize}
          stroke={1.75}
          color="var(--pomoc-node-icon)"
          style={{ pointerEvents: 'none' }}
        />
        {storeSize > 0 ? (
          <g className="pomoc-store-badge" transform={`translate(${r * 0.85} ${-r * 0.85})`}>
            <circle r={6.5} style={{ fill: 'var(--mantine-color-yellow-5)' }} />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={8}
              fontWeight={700}
              style={{ fill: 'var(--mantine-color-black)', pointerEvents: 'none' }}
            >
              {storeSize}
            </text>
          </g>
        ) : null}
        {alive ? null : (
          <IconPlugConnectedX
            x={r * 0.35}
            y={r * 0.35}
            width={10}
            height={10}
            stroke={2}
            color="var(--mantine-color-red-5)"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </g>
    </Tooltip>
  );
});
