import {
  ActionIcon,
  Box,
  Burger,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { IconHelp, IconMoon, IconSun } from '@tabler/icons-react';
import { useShallow } from 'zustand/react/shallow';
import { formatTick } from '../../lib/format';
import { useSimStore } from '../../sim/store';
import { useUiStore } from '../../ui/store';
import { ModeBanner } from './ModeBanner';
import { PlaybackControls } from './PlaybackControls';

export function TopBar() {
  const { tick, mode } = useSimStore(
    useShallow((s) => ({ tick: s.snapshot.tick, mode: s.snapshot.globalMode })),
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
