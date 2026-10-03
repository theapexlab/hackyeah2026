import type { SimEvent } from '@pomoc/core';

/**
 * Yields only the events appended since the previous call, over a log that may be capped
 * (Snapshot.recentEvents drops old entries from the front). Identity of the last processed
 * event re-anchors the cursor after truncation; if that event was evicted too, the cursor
 * falls back to "every event newer than the last processed tick".
 */
export interface EventCursor {
  next(): readonly SimEvent[];
  /** Forget everything and start at the end of the current log (nothing is replayed). */
  reset(): void;
}

export interface EventCursorOptions {
  /** Start at the end of the log instead of replaying its current contents (default true). */
  readonly startAtEnd?: boolean;
}

export function createEventCursor(
  getLog: () => readonly SimEvent[],
  options: EventCursorOptions = {},
): EventCursor {
  const startAtEnd = options.startAtEnd ?? true;
  let index = 0;
  let last: SimEvent | undefined;
  let lastTick = Number.NEGATIVE_INFINITY;
  let primed = !startAtEnd;

  const skipToEnd = (log: readonly SimEvent[]): void => {
    index = log.length;
    last = log[log.length - 1];
    lastTick = last?.tick ?? lastTick;
  };

  return {
    next() {
      const log = getLog();
      if (!primed) {
        primed = true;
        skipToEnd(log);
        return [];
      }
      const anchored = last === undefined ? index === 0 : log[index - 1] === last;
      if (!anchored) {
        const found = last === undefined ? -1 : log.lastIndexOf(last);
        if (found >= 0) {
          index = found + 1;
        } else {
          // The anchor was evicted: take everything newer than what we already handled.
          let i = 0;
          while (i < log.length && (log[i]?.tick ?? Number.NEGATIVE_INFINITY) <= lastTick) i++;
          index = i;
        }
      }
      const fresh = log.slice(index);
      skipToEnd(log);
      return fresh;
    },
    reset() {
      primed = true;
      skipToEnd(getLog());
    },
  };
}
