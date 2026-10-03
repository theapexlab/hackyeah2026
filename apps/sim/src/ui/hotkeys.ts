import { useEffect } from 'react';
import { mapControls } from '../features/map/mapControls';
import { simEvents } from '../sim/events';
import { playback } from '../sim/playback';
import { useUIStore } from './store';

export interface HotkeyDef {
  /** `KeyboardEvent.key` values (case-insensitive) that trigger it. */
  keys: readonly string[];
  display: string;
  label: string;
  hint: string;
  run: () => void;
}

export interface HotkeyCtx {
  toggleScheme: () => void;
}

const ui = () => useUIStore.getState();

export const viewHotkeys = (ctx: HotkeyCtx): HotkeyDef[] => [
  {
    keys: [' '],
    display: 'Space',
    label: 'Play / pause',
    hint: 'Run or stop the clock',
    run: playback.toggle,
  },
  { keys: ['.'], display: '.', label: 'Step', hint: 'Advance one tick', run: playback.step },
  {
    keys: ['+', '='],
    display: '+',
    label: 'Faster',
    hint: 'Next playback speed',
    run: playback.faster,
  },
  {
    keys: ['-', '_'],
    display: '-',
    label: 'Slower',
    hint: 'Previous playback speed',
    run: playback.slower,
  },
  {
    keys: ['v'],
    display: 'v',
    label: 'Range circles',
    hint: 'Toggle radio range circles',
    run: () => ui().setShowRanges(!ui().showRanges),
  },
  {
    keys: ['t'],
    display: 't',
    label: 'Topology packets',
    hint: 'Show or hide gray topology traffic',
    run: () => ui().setShowTopologyPackets(!ui().showTopologyPackets),
  },
  {
    keys: ['h'],
    display: 'h',
    label: 'Fit view',
    hint: 'Fit the whole world',
    run: mapControls.fit,
  },
  {
    keys: ['d'],
    display: 'd',
    label: 'Dark / light',
    hint: 'Switch colour scheme',
    run: ctx.toggleScheme,
  },
  {
    keys: ['Escape'],
    display: 'Esc',
    label: 'Deselect',
    hint: 'Close the inspector',
    run: () => ui().select(null),
  },
  {
    keys: ['?'],
    display: '?',
    label: 'Shortcuts',
    hint: 'Show this help',
    run: () => ui().setShortcutsOpen(true),
  },
];

export const allHotkeys = (ctx: HotkeyCtx): HotkeyDef[] => [
  ...simEvents.map((e) => ({
    keys: [e.key],
    display: e.key,
    label: e.label,
    hint: e.hint,
    run: e.run,
  })),
  ...viewHotkeys(ctx),
];

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/** Raw keydown binding: never fires while typing, with Ctrl/Meta/Alt held, or on key repeat. */
export function useHotkeys(ctx: HotkeyCtx): void {
  const { toggleScheme } = ctx;
  useEffect(() => {
    const table = allHotkeys({ toggleScheme });
    const lookup = (e: KeyboardEvent) => {
      const key = e.key === '/' && e.shiftKey ? '?' : e.key;
      return table.find((h) => h.keys.some((k) => k.toLowerCase() === key.toLowerCase()));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const hk = lookup(e);
      if (!hk) return;
      if (e.key === ' ') e.preventDefault();
      if (e.repeat) return;
      hk.run();
    };
    // Space on a focused button would otherwise also "click" it on keyup.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && !isTyping(e.target)) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [toggleScheme]);
}
