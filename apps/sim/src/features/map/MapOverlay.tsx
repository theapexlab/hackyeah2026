import { ActionIcon, Group, Stack, Tooltip } from '@mantine/core';
import { IconCircles, IconFocus2, IconMaximize } from '@tabler/icons-react';
import { dominantMode } from '../../lib/modes';
import { useModeCounts } from '../../sim/selectors';
import { modeCss } from '../../theme/tokens';
import { useUIStore } from '../../ui/store';
import { AuthorityBadge } from './AuthorityBadge';
import { Legend } from './Legend';
import { mapControls } from './mapControls';

export function MapOverlay() {
  const showRanges = useUIStore((s) => s.showRanges);
  const selected = useUIStore((s) => s.selectedNodeId);
  const mode = dominantMode(useModeCounts());

  return (
    <>
      <div
        className="map-vignette"
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          boxShadow: `inset 0 0 160px ${modeCss(mode)}`,
          opacity: mode === 'PEACE' ? 0.3 : 0.5,
        }}
      />
      <Stack
        gap="xs"
        align="flex-end"
        style={{ position: 'absolute', top: 12, right: 12, pointerEvents: 'none' }}
      >
        <AuthorityBadge />
        <Group gap="xs" style={{ pointerEvents: 'auto' }} data-no-zoom>
          <Tooltip label="Range circles (v)">
            <ActionIcon
              aria-label="Toggle range circles"
              variant={showRanges ? 'filled' : 'default'}
              onClick={() => useUIStore.getState().setShowRanges(!showRanges)}
            >
              <IconCircles size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Fit view (h)">
            <ActionIcon aria-label="Fit view" variant="default" onClick={mapControls.fit}>
              <IconMaximize size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Focus selected node (or double-click a node)">
            <ActionIcon
              aria-label="Focus selected node"
              variant="default"
              disabled={!selected || selected === 'authority'}
              onClick={() => selected && mapControls.focus(selected)}
            >
              <IconFocus2 size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Stack>
      <div style={{ position: 'absolute', left: 12, bottom: 12, pointerEvents: 'none' }}>
        <Legend />
      </div>
    </>
  );
}
