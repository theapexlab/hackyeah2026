import { useMantineColorScheme } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useRef } from 'react';
import type { DemoEvent, EventContext } from '../sim/events';
import { useSimStore } from '../sim/store';
import { useUiStore } from './store';

/**
 * Returns a stable runner that executes a demo event against the live stores.
 * Shared by the hotkeys hook and the EventsPanel buttons.
 *
 * Mantine's toggleColorScheme changes identity on every render of the caller; it is kept in
 * a ref so the runner itself is created once and useHotkeys binds its listener once.
 */
export function useEventRunner(): (event: DemoEvent) => void {
  const { toggleColorScheme } = useMantineColorScheme();
  const toggleRef = useRef(toggleColorScheme);
  useEffect(() => {
    toggleRef.current = toggleColorScheme;
  });
  return useCallback((event: DemoEvent) => {
    const ui = useUiStore.getState();
    const ctx: EventContext = {
      snapshot: useSimStore.getState().snapshot,
      view: {
        togglePlaying: ui.togglePlaying,
        step: () => ui.step(1),
        speedUp: ui.speedUp,
        speedDown: ui.speedDown,
        toggleRanges: ui.toggleRanges,
        toggleTopologyPackets: ui.toggleTopologyPackets,
        fitView: ui.requestFit,
        toggleColorScheme: () => toggleRef.current(),
        deselect: ui.deselect,
      },
      notify: (notice) =>
        notifications.show({
          title: notice.title,
          message: notice.message,
          color: notice.color,
          autoClose: 2500,
        }),
    };
    event.run(ctx);
  }, []);
}
