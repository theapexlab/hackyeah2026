import {
  ActionIcon,
  Box,
  Burger,
  Chip,
  Group,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { IconHelp, IconMoon, IconSun } from '@tabler/icons-react';
import { useShallow } from 'zustand/react/shallow';
import { formatTick } from '../../lib/format';
import { findEvent } from '../../sim/events';
import { useSimStore } from '../../sim/store';
import { useEventRunner } from '../../ui/eventContext';
import { useUiStore } from '../../ui/store';
import { ModeBanner } from './ModeBanner';
import { PlaybackControls } from './PlaybackControls';

const cellsEvent = findEvent('toggle-cells');
const gridEvent = findEvent('toggle-grid');

export function TopBar() {
  // Chips, EventsPanel buttons and hotkeys all go through the same runner (one set of side effects).
  const run = useEventRunner();
  const { tick, cellsUp, gridUp, mode } = useSimStore(
    useShallow((s) => ({
      tick: s.snapshot.tick,
      cellsUp: s.snapshot.world.cellsUp,
      gridUp: s.snapshot.world.gridUp,
      mode: s.snapshot.globalMode,
    })),
  );
  const navOpen = useUiStore((s) => s.navOpen);
  const toggleNav = useUiStore((s) => s.toggleNav);
  const toggleShortcuts = useUiStore((s) => s.toggleShortcuts);
  const { toggleColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('dark');

  return (
    <ModeBanner mode={mode}>
      <Burger
        opened={navOpen}
        onClick={toggleNav}
        size="sm"
        aria-label="Toggle configuration panel"
      />
      <Text fw={800} size="lg">
        Pomóc
      </Text>

      <Group gap="xs" ml="sm" wrap="nowrap">
        <Tooltip label="Toggle cellular network (c)">
          <Box component="span" style={{ display: 'inline-flex' }}>
            <Chip
              checked={cellsUp}
              onChange={() => cellsEvent && run(cellsEvent)}
              size="sm"
              color="green"
              variant={cellsUp ? 'light' : 'outline'}
            >
              Cells {cellsUp ? 'up' : 'down'}
            </Chip>
          </Box>
        </Tooltip>
        <Tooltip label="Toggle power grid (g)">
          <Box component="span" style={{ display: 'inline-flex' }}>
            <Chip
              checked={gridUp}
              onChange={() => gridEvent && run(gridEvent)}
              size="sm"
              color="green"
              variant={gridUp ? 'light' : 'outline'}
            >
              Grid {gridUp ? 'up' : 'down'}
            </Chip>
          </Box>
        </Tooltip>
      </Group>

      <Text ff="monospace" size="sm" c="dimmed" ml="sm" style={{ minWidth: 96 }}>
        tick {formatTick(tick)}
      </Text>

      <Box style={{ flex: 1 }} />

      <PlaybackControls />

      <Tooltip label="Toggle colour scheme (d)">
        <ActionIcon
          variant="default"
          size="lg"
          onClick={() => toggleColorScheme()}
          aria-label="Toggle colour scheme"
        >
          {scheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Keyboard shortcuts">
        <ActionIcon
          variant="default"
          size="lg"
          onClick={toggleShortcuts}
          aria-label="Keyboard shortcuts"
        >
          <IconHelp size={18} />
        </ActionIcon>
      </Tooltip>
    </ModeBanner>
  );
}
