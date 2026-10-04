import { useSimStore } from './store';

/** Playback speed: 1 = real time (a tick of simulated time takes a tick of wall time). */
export type Speed = 1 | 10 | 60;
export const SPEEDS: readonly Speed[] = [1, 10, 60];

export function parseSpeed(value: string): Speed {
  return SPEEDS.find((s) => String(s) === value) ?? 1;
}

let raf: number | null = null;
let currentSpeed: Speed = 1;

/** Engine time one animation frame may spend stepping, so the page keeps painting. */
const BUDGET_MS = 12;
/** Most ticks one frame may run. */
const MAX_BATCH = 60;

let lastFrame = 0;
let carry = 0;
/** Running estimate of the engine's wall time per tick (ms). */
let tickCost = 1;

/**
 * One animation frame: step as many ticks as the elapsed wall time is worth at the current
 * speed (tick length / speed each), in one engine.step(n) so React and the canvas render
 * once per frame, at any speed. The remainder carries over, so the long-run rate is exact.
 * At most BUDGET_MS of engine time per frame: when the engine cannot keep up, the backlog
 * is dropped and playback runs as fast as it can instead of freezing the page.
 */
function frame(now: number): void {
  raf = requestAnimationFrame(frame);
  const msPerTick = useSimStore.getState().tickIntervalMs / currentSpeed;
  carry += now - lastFrame;
  lastFrame = now;
  const owed = Math.floor(carry / msPerTick);
  if (owed <= 0) return;
  const affordable = Math.max(1, Math.floor(BUDGET_MS / tickCost));
  const n = Math.min(owed, affordable, MAX_BATCH);
  const started = performance.now();
  // The store's engine subscription records the snapshot and lastTickAt.
  useSimStore.getState().engine.step(n);
  tickCost = 0.8 * tickCost + 0.2 * ((performance.now() - started) / n);
  carry = n < owed ? 0 : carry - n * msPerTick;
}

/** Idempotent: restarts the frame loop, so calling it twice (StrictMode) is harmless. */
export function startPlayback(speed: Speed = currentSpeed): void {
  stopPlayback();
  currentSpeed = speed;
  lastFrame = performance.now();
  carry = 0;
  raf = requestAnimationFrame(frame);
}

export function stopPlayback(): void {
  if (raf !== null) {
    cancelAnimationFrame(raf);
    raf = null;
  }
}

export function isPlaying(): boolean {
  return raf !== null;
}

export function stepPlayback(n = 1): void {
  useSimStore.getState().engine.step(n);
}

export function setPlaybackSpeed(speed: Speed): void {
  currentSpeed = speed;
  carry = 0;
}

export function getPlaybackSpeed(): Speed {
  return currentSpeed;
}

// A changed tick length (Generate / tickMs slider) is read every frame; just drop the carry.
useSimStore.subscribe((state, prev) => {
  if (state.tickIntervalMs !== prev.tickIntervalMs) carry = 0;
});

// The interval is a module singleton; a hot replacement would otherwise leave the old one ticking.
import.meta.hot?.dispose(() => stopPlayback());
