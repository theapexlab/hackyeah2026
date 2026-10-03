import { type HotkeyItem, useHotkeys as useMantineHotkeys } from '@mantine/hooks';
import { simEvents } from '../sim/events';
import { playback } from '../sim/playback';
import { useUIStore } from './store';

export function useHotkeys() {
  const setSelectedNodeId = useUIStore((s) => s.setSelectedNodeId);
  const setShowRanges = useUIStore((s) => s.setShowRanges);
  const setShowTopologyPackets = useUIStore((s) => s.setShowTopologyPackets);
  const setPlaying = useUIStore((s) => s.setPlaying);
  const setSpeed = useUIStore((s) => s.setSpeed);
  const speed = useUIStore((s) => s.speed);
  const setShortcutsModalOpen = useUIStore((s) => s.setShortcutsModalOpen);
  const showRanges = useUIStore((s) => s.showRanges);
  const showTopologyPackets = useUIStore((s) => s.showTopologyPackets);

  const hotkeys: HotkeyItem[] = [
    // Event buttons
    ...simEvents.map((e) => [e.key, () => e.run()] as HotkeyItem),

    // Playback controls
    [
      'Space',
      () => {
        const current = useUIStore.getState().playing;
        setPlaying(!current);
      },
    ],
    ['.', () => playback.step()],
    [
      '+',
      () => {
        const nextSpeed = speed === 0.5 ? 1 : speed === 1 ? 2 : speed === 2 ? 4 : 4;
        if (nextSpeed !== speed) {
          setSpeed(nextSpeed as any);
          playback.setSpeed(nextSpeed as any);
        }
      },
    ],
    [
      '-',
      () => {
        const prevSpeed = speed === 4 ? 2 : speed === 2 ? 1 : speed === 1 ? 0.5 : 0.5;
        if (prevSpeed !== speed) {
          setSpeed(prevSpeed as any);
          playback.setSpeed(prevSpeed as any);
        }
      },
    ],

    // View toggles
    ['v', () => setShowRanges(!showRanges)],
    ['t', () => setShowTopologyPackets(!showTopologyPackets)],
    [
      'h',
      () => {
        const fitToWorld = useUIStore.getState().fitToWorld;
        fitToWorld?.();
      },
    ],
    [
      'd',
      () => {
        const scheme = document.documentElement.getAttribute('data-mantine-color-scheme');
        document.documentElement.setAttribute(
          'data-mantine-color-scheme',
          scheme === 'dark' ? 'light' : 'dark',
        );
      },
    ],

    // Deselect
    ['Escape', () => setSelectedNodeId(null)],

    // Help
    ['?', () => setShortcutsModalOpen(true)],
  ];

  useMantineHotkeys(hotkeys);
}
