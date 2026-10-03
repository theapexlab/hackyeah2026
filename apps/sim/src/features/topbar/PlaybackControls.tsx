import { ActionIcon, Group, SegmentedControl, Tooltip } from '@mantine/core';
import { IconPlayerPause, IconPlayerPlay, IconPlayerSkipForward } from '@tabler/icons-react';
import { useShallow } from 'zustand/react/shallow';
import { parseSpeed, SPEEDS } from '../../sim/playback';
import { useUiStore } from '../../ui/store';

const SPEED_DATA = SPEEDS.map((speed) => ({ value: String(speed), label: `${speed}×` }));

export function PlaybackControls() {
  const { playing, speed, togglePlaying, step, setSpeed } = useUiStore(
    useShallow((s) => ({
      playing: s.playing,
      speed: s.speed,
      togglePlaying: s.togglePlaying,
      step: s.step,
      setSpeed: s.setSpeed,
    })),
  );

  return (
    <Group gap="xs" wrap="nowrap">
      <Tooltip label={playing ? 'Pause (space)' : 'Play (space)'}>
        <ActionIcon
          variant="filled"
          size="lg"
          onClick={togglePlaying}
          aria-label={playing ? 'Pause' : 'Play'}
          aria-pressed={playing}
        >
          {playing ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />}
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Step one tick (.)">
        <ActionIcon variant="default" size="lg" onClick={() => step(1)} aria-label="Step one tick">
          <IconPlayerSkipForward size={18} />
        </ActionIcon>
      </Tooltip>
      <SegmentedControl
        size="xs"
        value={String(speed)}
        onChange={(value) => setSpeed(parseSpeed(value))}
        data={SPEED_DATA}
        aria-label="Playback speed"
      />
    </Group>
  );
}
