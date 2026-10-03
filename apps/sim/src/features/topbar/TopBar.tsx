import { ActionIcon, Badge, Group } from '@mantine/core';
import { IconQuestionMark } from '@tabler/icons-react';
import { simCommands } from '../../sim/commands';
import { useSimSnapshot } from '../../sim/selectors';
import { useUIStore } from '../../ui/store';
import { ModeBanner } from './ModeBanner';
import { PlaybackControls } from './PlaybackControls';

export function TopBar() {
  const snapshot = useSimSnapshot();
  const setShortcutsModalOpen = useUIStore((s) => s.setShortcutsModalOpen);

  if (!snapshot) return null;

  const handleToggleCells = () => {
    simCommands.setCellsUp(!snapshot.world.cellsUp);
  };

  const handleToggleGrid = () => {
    simCommands.setGridUp(!snapshot.world.gridUp);
  };

  return (
    <div style={{ width: '100%' }}>
      <ModeBanner />
      <Group justify="space-between" p="xs" h="100%">
        <Group gap="xs">
          <Badge
            onClick={handleToggleCells}
            variant={snapshot.world.cellsUp ? 'filled' : 'light'}
            style={{ cursor: 'pointer' }}
          >
            Cells {snapshot.world.cellsUp ? 'ON' : 'OFF'}
          </Badge>
          <Badge
            onClick={handleToggleGrid}
            variant={snapshot.world.gridUp ? 'filled' : 'light'}
            style={{ cursor: 'pointer' }}
          >
            Grid {snapshot.world.gridUp ? 'ON' : 'OFF'}
          </Badge>
        </Group>

        <PlaybackControls />

        <Group gap="xs">
          <ActionIcon onClick={() => setShortcutsModalOpen(true)} variant="light">
            <IconQuestionMark size={16} />
          </ActionIcon>
        </Group>
      </Group>
    </div>
  );
}
