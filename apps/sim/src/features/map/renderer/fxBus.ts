/**
 * Tiny typed event bus from the canvas renderer to HTML chrome (the Authority badge flash).
 * Module singleton; no React, no DOM. Listeners run synchronously on emit.
 */
export interface FxEvents {
  /** The renderer ingested authority-inject transits this tick. */
  readonly inject: { readonly tick: number; readonly nodes: number };
  /** The renderer ingested uplink transits this tick. */
  readonly uplink: { readonly tick: number; readonly nodes: number };
}

type Listener<K extends keyof FxEvents> = (payload: FxEvents[K]) => void;

const listeners: { [K in keyof FxEvents]: Set<Listener<K>> } = {
  inject: new Set(),
  uplink: new Set(),
};

export const fxBus = {
  on<K extends keyof FxEvents>(event: K, listener: Listener<K>): () => void {
    listeners[event].add(listener);
    return () => {
      listeners[event].delete(listener);
    };
  },
  emit<K extends keyof FxEvents>(event: K, payload: FxEvents[K]): void {
    for (const listener of listeners[event]) listener(payload);
  },
};
