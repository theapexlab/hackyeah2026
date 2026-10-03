import {
  ActionIcon,
  Badge,
  Group,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconAntennaBars5,
  IconLayoutSidebar,
  IconMoon,
  IconPlug,
  IconQuestionMark,
  IconSun,
} from '@tabler/icons-react';
import { simCommands } from '../../sim/commands';
import { useCellsUp, useGridUp } from '../../sim/selectors';
import { useUIStore } from '../../ui/store';
import { ModeBanner } from './ModeBanner';
import { PlaybackControls } from './PlaybackControls';

export function TopBar() {
  const cellsUp = useCellsUp();
  const gridUp = useGridUp();
  const navOpen = useUIStore((s) => s.navOpen);
  const { toggleColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('dark');

  return (
    <>
      <ModeBanner />
      <Group justify="space-between" px="sm" h={40} wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <ActionIcon
            aria-label="Toggle side panel"
            variant="default"
            onClick={() => useUIStore.getState().setNavOpen(!navOpen)}
          >
            <IconLayoutSidebar size={16} />
          </ActionIcon>
          <Tooltip label="Toggle cellular network (c)">
            <Badge
              component="button"
              type="button"
              aria-label={`Cells ${cellsUp ? 'up' : 'down'}, click to toggle`}
              color={cellsUp ? 'green' : 'red'}
              variant={cellsUp ? 'light' : 'filled'}
              leftSection={<IconAntennaBars5 size={12} />}
              style={{ cursor: 'pointer' }}
              onClick={() => simCommands.setCellsUp(!cellsUp)}
            >
              Cells {cellsUp ? 'up' : 'down'}
            </Badge>
          </Tooltip>
          <Tooltip label="Toggle power grid (g)">
            <Badge
              component="button"
              type="button"
              aria-label={`Grid ${gridUp ? 'up' : 'down'}, click to toggle`}
              color={gridUp ? 'green' : 'red'}
              variant={gridUp ? 'light' : 'filled'}
              leftSection={<IconPlug size={12} />}
              style={{ cursor: 'pointer' }}
              onClick={() => simCommands.setGridUp(!gridUp)}
            >
              Grid {gridUp ? 'up' : 'down'}
            </Badge>
          </Tooltip>
        </Group>

        <PlaybackControls />

        <Group gap="xs" wrap="nowrap">
          <Tooltip label="Dark / light (d)">
            <ActionIcon
              aria-label="Toggle colour scheme"
              variant="default"
              onClick={toggleColorScheme}
            >
              {scheme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Shortcuts (?)">
            <ActionIcon
              aria-label="Show shortcuts"
              variant="default"
              onClick={() => useUIStore.getState().setShortcutsOpen(true)}
            >
              <IconQuestionMark size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </>
  );
}
