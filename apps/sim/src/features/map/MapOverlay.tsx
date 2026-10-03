import { ActionIcon, Group, Stack, Tooltip } from '@mantine/core';
import { IconMaximize, IconRadioactive, IconTarget } from '@tabler/icons-react';
import { useSimWorld } from '../../sim/selectors';
import { modeColors } from '../../theme/tokens';
import { useUIStore } from '../../ui/store';
import { AuthorityBadge } from './AuthorityBadge';

interface MapOverlayProps {
  onFitToWorld: () => void;
  onFocusNode: () => void;
}

export function MapOverlay({ onFitToWorld, onFocusNode }: MapOverlayProps) {
  const showRanges = useUIStore((s) => s.showRanges);
  const setShowRanges = useUIStore((s) => s.setShowRanges);
  const world = useSimWorld();

  const modeColor = world ? modeColors['PEACE'] : '#4dabf7';

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      <Stack gap="sm" align="flex-end">
        <AuthorityBadge />

        <Group gap="xs" style={{ pointerEvents: 'auto' }}>
          <Tooltip label="Toggle range circles" position="left">
            <ActionIcon
              onClick={() => setShowRanges(!showRanges)}
              variant={showRanges ? 'filled' : 'light'}
            >
              <IconRadioactive size={16} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Fit to world" position="left">
            <ActionIcon onClick={onFitToWorld}>
              <IconMaximize size={16} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Focus selected" position="left">
            <ActionIcon onClick={onFocusNode}>
              <IconTarget size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Stack>
    </div>
  );
}
