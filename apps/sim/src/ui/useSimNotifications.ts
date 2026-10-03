import { notifications } from '@mantine/notifications';
import { useEffect } from 'react';
import { createEventCursor } from '../lib/eventCursor';
import { formatClass } from '../lib/format';
import { useSimStore } from '../sim/store';
import { CLASS_COLOR, MODE_COLOR, MODE_LABEL } from '../theme/tokens';

const AUTO_CLOSE_MS = 3000;

/**
 * Toasts for the moments the audience should notice: a request being accepted, the global
 * mode changing, the Authority injecting a message, and the first UNVERIFIABLE drop after a
 * forged command. Watches Snapshot.recentEvents through an event cursor, so each store update
 * costs one slice of the new events.
 */
export function useSimNotifications(): void {
  useEffect(() => {
    const initial = useSimStore.getState();
    let epoch = initial.worldEpoch;
    let lastMode = initial.snapshot.globalMode;
    let forgeryArmed = false;
    const cursor = createEventCursor(() => useSimStore.getState().snapshot.recentEvents, {
      startAtEnd: true,
    });

    return useSimStore.subscribe((state) => {
      if (state.worldEpoch !== epoch) {
        epoch = state.worldEpoch;
        lastMode = state.snapshot.globalMode;
        forgeryArmed = false;
        cursor.reset();
        return;
      }

      const mode = state.snapshot.globalMode;
      if (mode !== lastMode) {
        notifications.show({
          title: `Network mode: ${MODE_LABEL[mode]}`,
          message: `Highest mode among alive nodes went ${lastMode} → ${mode}.`,
          color: MODE_COLOR[mode],
          autoClose: AUTO_CLOSE_MS,
        });
        lastMode = mode;
      }

      for (const event of cursor.next()) {
        switch (event.type) {
          case 'COMMAND': {
            const command = event.command;
            if (
              (command.type === 'SendRequest' && command.forge !== undefined) ||
              ((command.type === 'DeclareMode' ||
                command.type === 'AllClear' ||
                command.type === 'BroadcastAlert') &&
                command.forged === true)
            ) {
              forgeryArmed = true;
            }
            break;
          }
          case 'TX_ACCEPTED':
            notifications.show({
              title: 'Request accepted',
              message: `${event.accepterId} accepted ${event.requestId}; the response travels back along the path.`,
              color: 'teal',
              autoClose: AUTO_CLOSE_MS,
            });
            break;
          case 'AUTHORITY_INJECTED':
            notifications.show({
              title: `Authority injected ${formatClass(event.class)}`,
              message:
                event.count === 0
                  ? 'No alive node has a backhaul: the message reached nobody.'
                  : `Entered the mesh at ${event.count} backhaul node${event.count === 1 ? '' : 's'}.`,
              color: event.count === 0 ? 'red' : CLASS_COLOR[event.class],
              autoClose: AUTO_CLOSE_MS,
            });
            break;
          case 'DROPPED':
            if (forgeryArmed && event.reason === 'UNVERIFIABLE') {
              forgeryArmed = false;
              notifications.show({
                title: 'Forged message rejected',
                message: `${event.nodeId} could not verify ${event.msgId} and dropped it. Every receiver will.`,
                color: 'red',
                autoClose: AUTO_CLOSE_MS,
              });
            }
            break;
          default:
            break;
        }
      }
    });
  }, []);
}
