import { ActionIcon, Group, SegmentedControl, Text, Tooltip } from '@mantine/core';
import { IconPlayerPause, IconPlayerPlay, IconPlayerSkipForward } from '@tabler/icons-react';
import { playback } from '../../sim/playback';
import { useSimTick } from '../../sim/selectors';
import { SPEEDS, useUIStore } from '../../ui/store';

export function PlaybackControls() {
  const playing = useUIStore((s) => s.playing);
  const speed = useUIStore((s) => s.speed);
  const tick = useSimTick();

  return (
    <Group gap="xs" wrap="nowrap">
      <Tooltip label={playing ? 'Pause (space)' : 'Play (space)'}>
        <ActionIcon
          aria-label={playing ? 'Pause' : 'Play'}
          variant={playing ? 'filled' : 'default'}
          onClick={playback.toggle}
        >
          {playing ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Step one tick (.)">
        <ActionIcon aria-label="Step one tick" variant="default" onClick={playback.step}>
          <IconPlayerSkipForward size={16} />
        </ActionIcon>
      </Tooltip>
      <SegmentedControl
        aria-label="Playback speed"
        size="xs"
        value={String(speed)}
        onChange={(v) => useUIStore.getState().setSpeed(Number(v) as (typeof SPEEDS)[number])}
        data={SPEEDS.map((s) => ({ label: `${s}x`, value: String(s) }))}
      />
      <Text size="sm" fw={600} ff="monospace" miw={64} aria-label="Tick counter">
        T{tick}
      </Text>
    </Group>
  );
}
