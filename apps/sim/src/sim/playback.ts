import { useUIStore } from '../ui/store';
import { useSimStore } from './store';

/**
 * Single owner of the tick interval. Everything else flips `playing` / `speed` in the UI
 * store (or calls the helpers below) and `startPlayback` keeps the timer in sync.
 */
export function startPlayback(): () => void {
  let timer: number | undefined;

  const sync = () => {
    window.clearInterval(timer);
    timer = undefined;
    const { playing, speed } = useUIStore.getState();
    const { tickIntervalMs } = useSimStore.getState();
    if (!playing) return;
    timer = window.setInterval(
      () => useSimStore.getState().engine?.step(),
      Math.max(16, tickIntervalMs / speed),
    );
  };

  sync();
  const offUi = useUIStore.subscribe((s, prev) => {
    if (s.playing !== prev.playing || s.speed !== prev.speed) sync();
  });
  const offSim = useSimStore.subscribe((s, prev) => {
    if (s.tickIntervalMs !== prev.tickIntervalMs) sync();
  });

  return () => {
    window.clearInterval(timer);
    offUi();
    offSim();
  };
}

export const playback = {
  toggle: () => useUIStore.getState().setPlaying(!useUIStore.getState().playing),
  step: () => {
    useUIStore.getState().setPlaying(false);
    useSimStore.getState().engine?.step();
  },
  faster: () => {
    const { speed, setSpeed } = useUIStore.getState();
    setSpeed(speed === 0.5 ? 1 : speed === 1 ? 2 : 4);
  },
  slower: () => {
    const { speed, setSpeed } = useUIStore.getState();
    setSpeed(speed === 4 ? 2 : speed === 2 ? 1 : 0.5);
  },
};
