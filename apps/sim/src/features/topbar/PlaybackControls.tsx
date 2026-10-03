import { ActionIcon, Group, SegmentedControl, Text, Tooltip } from '@mantine/core';
import { IconPlayerPause, IconPlayerPlay, IconPlayerSkipForward } from '@tabler/icons-react';
import { playback } from '../../sim/playback';
import { useSimTick } from '../../sim/selectors';
import { useUIStore } from '../../ui/store';

export function PlaybackControls() {
  const playing = useUIStore((s) => s.playing);
  const setPlaying = useUIStore((s) => s.setPlaying);
  const speed = useUIStore((s) => s.speed);
  const setSpeed = useUIStore((s) => s.setSpeed);
  const tick = useSimTick();

  const handlePlayPause = () => {
    const newState = !playing;
    setPlaying(newState);
    if (newState) {
      playback.start();
    } else {
      playback.stop();
    }
  };

  const handleStep = () => {
    playback.step();
  };

  const handleSpeedChange = (value: string) => {
    const newSpeed = parseFloat(value) as any;
    setSpeed(newSpeed);
    playback.setSpeed(newSpeed);
  };

  return (
    <Group gap="xs">
      <Tooltip label={playing ? 'Pause' : 'Play'}>
        <ActionIcon onClick={handlePlayPause} variant={playing ? 'filled' : 'light'}>
          {playing ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
        </ActionIcon>
      </Tooltip>

      <Tooltip label="Step once">
        <ActionIcon onClick={handleStep} variant="light">
          <IconPlayerSkipForward size={16} />
        </ActionIcon>
      </Tooltip>

      <SegmentedControl
        value={speed.toString()}
        onChange={handleSpeedChange}
        data={[
          { label: '0.5x', value: '0.5' },
          { label: '1x', value: '1' },
          { label: '2x', value: '2' },
          { label: '4x', value: '4' },
        ]}
        size="xs"
      />

      <Text size="sm" fw={500} style={{ minWidth: 60 }}>
        T{tick}
      </Text>
    </Group>
  );
}
