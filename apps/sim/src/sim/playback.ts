import { useUIStore } from '../ui/store';
import { useSimStore } from './store';

export function setupPlaybackLoop() {
  let intervalId: number | null = null;

  const checkAndStep = () => {
    const { engine, tickIntervalMs } = useSimStore.getState();
    const { playing, speed } = useUIStore.getState();

    if (playing && engine) {
      const tickMs = tickIntervalMs / speed;
      engine.step();
    }
  };

  const start = () => {
    if (intervalId !== null) return;
    const { tickIntervalMs } = useSimStore.getState();
    const { speed } = useUIStore.getState();
    const tickMs = tickIntervalMs / speed;
    intervalId = window.setInterval(checkAndStep, tickMs);
  };

  const stop = () => {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const step = () => {
    const { engine } = useSimStore.getState();
    if (engine) engine.step();
  };

  const setSpeed = (speed: 0.5 | 1 | 2 | 4) => {
    useUIStore.setState({ speed });
    if (intervalId !== null) {
      stop();
      start();
    }
  };

  return { start, stop, step, setSpeed };
}

export const playback = setupPlaybackLoop();
