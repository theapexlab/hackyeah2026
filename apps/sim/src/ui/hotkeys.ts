import { type HotkeyItem, useHotkeys } from '@mantine/hooks';
import { useMemo } from 'react';
import { DEMO_EVENTS } from '../sim/events';
import { useEventRunner } from './eventContext';
import { useUiStore } from './store';

/** Input types whose keys toggle or pick rather than type; hotkeys stay live on them. */
const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * Elements where a plain key means typing, value editing or picking from an open list:
 * text fields, textareas, native selects, contenteditable, sliders and spinbuttons, and
 * Mantine's open menus / comboboxes (their items are buttons the keyboard navigates).
 */
const TYPING_SELECTOR = [
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="menu"]',
  '[role="menuitem"]',
].join(', ');

/** Focused controls that would also react to Space; blurred so Space only toggles playback. */
const ACTIVATABLE_SELECTOR = [
  'button',
  'input[type="checkbox"]',
  'input[type="radio"]',
  '[role="button"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="tab"]',
].join(', ');

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(target.type);
  return target.closest(TYPING_SELECTOR) !== null;
}

/**
 * Binds every DEMO_EVENTS hotkey globally via @mantine/hooks useHotkeys. Mantine's own
 * tag filter is replaced by isTypingTarget so checkboxes, radios and switches (Chips,
 * SegmentedControl, Switch) do not swallow hotkeys after a click, while text fields do.
 * preventDefault is applied by hand only when an event actually runs, so typing is never
 * blocked. Esc inside a text field blurs it; a second Esc then deselects. While the
 * shortcuts cheat sheet is open only Esc acts, and it just closes the sheet.
 */
export function useAppHotkeys(): void {
  const run = useEventRunner();
  const hotkeys = useMemo<HotkeyItem[]>(
    () =>
      DEMO_EVENTS.flatMap((event) =>
        event.hotkeys.map<HotkeyItem>((binding) => [
          binding,
          (keyboardEvent) => {
            const target = keyboardEvent.target;
            if (isTypingTarget(target)) {
              if (binding === 'escape' && target instanceof HTMLElement) target.blur();
              return;
            }
            const ui = useUiStore.getState();
            if (ui.shortcutsOpen) {
              if (binding === 'escape') {
                keyboardEvent.preventDefault();
                ui.setShortcutsOpen(false);
              }
              return;
            }
            keyboardEvent.preventDefault();
            if (
              binding === 'space' &&
              target instanceof HTMLElement &&
              target.closest(ACTIVATABLE_SELECTOR) !== null
            ) {
              target.blur();
            }
            run(event);
          },
          { preventDefault: false },
        ]),
      ),
    [run],
  );
  useHotkeys(hotkeys, [], true);
}
