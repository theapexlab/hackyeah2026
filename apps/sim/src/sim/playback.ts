import { useSimStore } from './store';

export type Speed = 0.5 | 1 | 2 | 4;
export const SPEEDS: readonly Speed[] = [0.5, 1, 2, 4];

export function parseSpeed(value: string): Speed {
  return SPEEDS.find((s) => String(s) === value) ?? 1;
}

let timer: ReturnType<typeof setInterval> | null = null;
let currentSpeed: Speed = 1;

function tickOnce(): void {
  // The store's engine subscription records the snapshot and lastTickAt.
  useSimStore.getState().engine.step();
}

/** Idempotent: restarts the interval, so calling it twice (StrictMode) is harmless. */
export function startPlayback(speed: Speed = currentSpeed): void {
  stopPlayback();
  currentSpeed = speed;
  const ms = useSimStore.getState().tickIntervalMs / speed;
  timer = setInterval(tickOnce, Math.max(16, ms));
}

export function stopPlayback(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

export function isPlaying(): boolean {
  return timer !== null;
}

export function stepPlayback(n = 1): void {
  useSimStore.getState().engine.step(n);
}

export function setPlaybackSpeed(speed: Speed): void {
  currentSpeed = speed;
  if (isPlaying()) startPlayback(speed);
}

export function getPlaybackSpeed(): Speed {
  return currentSpeed;
}

// Pick up a changed tick length (Generate / tickMs slider) without stopping.
useSimStore.subscribe((state, prev) => {
  if (state.tickIntervalMs !== prev.tickIntervalMs && isPlaying()) startPlayback(currentSpeed);
});

// The interval is a module singleton; a hot replacement would otherwise leave the old one ticking.
import.meta.hot?.dispose(() => stopPlayback());
