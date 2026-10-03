import { notifications } from '@mantine/notifications';
import { MODE_LABELS, type SimEngine, type SimEvent } from '@pomoc/core';
import { useUIStore } from '../ui/store';

type ToastColor = 'blue' | 'yellow' | 'red' | 'grape' | 'teal' | 'violet' | 'gray';

const toast = (title: string, message: string, color: ToastColor) =>
  notifications.show({ title, message, color, autoClose: 3500 });

function announce(events: readonly SimEvent[]): void {
  let forged = 0;
  const modeTo = new Map<string, number>();
  for (const e of events) {
    switch (e.type) {
      case 'COMMAND':
        switch (e.command.type) {
          case 'DECLARE_MODE':
            useUIStore.getState().flashAuthority();
            toast(
              `${MODE_LABELS[e.command.level]} declared`,
              e.command.region ? 'Regional declaration' : 'Whole area',
              e.command.level === 'L3' ? 'grape' : e.command.level === 'L2' ? 'red' : 'yellow',
            );
            break;
          case 'ALL_CLEAR':
            useUIStore.getState().flashAuthority();
            toast('All clear', 'Authority lifted the emergency', 'blue');
            break;
          case 'BROADCAST_ALERT':
            useUIStore.getState().flashAuthority();
            toast('Official alert', 'Broadcast from the Authority', 'violet');
            break;
        }
        break;
      case 'TX_ACCEPTED':
        toast('Request accepted', `${e.requestId} accepted by ${e.acceptedBy}`, 'teal');
        break;
      case 'AUTO_RESPOND_NONE':
        toast('No eligible responder', `${e.requestId} has no open taker`, 'gray');
        break;
      case 'DROPPED':
        if (e.reason === 'UNVERIFIABLE') forged++;
        break;
      case 'MODE_CHANGED':
        modeTo.set(e.to, (modeTo.get(e.to) ?? 0) + 1);
        break;
    }
  }
  if (forged > 0)
    toast('Forged message rejected', `${forged} node(s) dropped it: UNVERIFIABLE`, 'red');
  for (const [mode, n] of modeTo) {
    toast(
      'Mode change',
      `${n} node(s) now ${MODE_LABELS[mode as keyof typeof MODE_LABELS]}`,
      'blue',
    );
  }
}

/** Turns new engine events into toasts. Index-based so the capped recentEvents window is irrelevant. */
export function attachEventFeed(engine: SimEngine): () => void {
  let seen = engine.getEventLog().length;
  return engine.subscribe(() => {
    const log = engine.getEventLog();
    if (log.length < seen) seen = 0;
    const fresh = log.slice(seen);
    seen = log.length;
    if (fresh.length > 0) announce(fresh);
  });
}
