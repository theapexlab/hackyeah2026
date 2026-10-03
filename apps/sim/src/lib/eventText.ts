import type { MessageClass, MessageId, Mode, NodeId, SimEvent } from '@pomoc/core';
import {
  CLASS_COLOR,
  DROP_REASON_LABEL,
  isRejection,
  type MantineColorName,
  MODE_COLOR,
} from '../theme/tokens';

/** Filter buckets of the event log. */
export type LogCategory =
  | 'drop'
  | 'dupe'
  | 'deliver'
  | 'store'
  | 'mode'
  | 'tx'
  | 'authority'
  | 'system';

export const LOG_CATEGORIES: readonly LogCategory[] = [
  'drop',
  'dupe',
  'deliver',
  'store',
  'mode',
  'tx',
  'authority',
  'system',
];

export const LOG_CATEGORY_LABEL: Readonly<Record<LogCategory, string>> = {
  drop: 'drop',
  dupe: 'dupes',
  deliver: 'deliver',
  store: 'store',
  mode: 'mode',
  tx: 'tx',
  authority: 'authority',
  system: 'system',
};

/** Presentation of one SimEvent for log rows and toasts. */
export interface EventSummary {
  readonly text: string;
  readonly color: MantineColorName;
  readonly category: LogCategory;
  /** Node to select when the row is clicked. */
  readonly nodeId: NodeId | null;
  readonly msgId: MessageId | null;
  readonly cls: MessageClass | null;
  readonly mode: Mode | null;
}

export function eventCategory(event: SimEvent): LogCategory {
  switch (event.type) {
    case 'DROPPED':
      return event.reason === 'DUPLICATE' ? 'dupe' : 'drop';
    case 'ORIGINATED':
    case 'DELIVERED':
      return 'deliver';
    case 'STORED':
    case 'STORE_FLUSHED':
      return 'store';
    case 'MODE_CHANGED':
      return 'mode';
    case 'TX_OPENED':
    case 'TX_ACCEPTED':
    case 'TX_CLOSED':
    case 'TX_RESPONSE_LATE':
    case 'AUTO_RESPOND_NONE':
      return 'tx';
    case 'AUTHORITY_RECEIVED':
    case 'AUTHORITY_INJECTED':
      return 'authority';
    case 'COMMAND':
    case 'ADJACENCY':
      return 'system';
  }
}

function base(
  event: SimEvent,
  text: string,
  color: MantineColorName,
  extra: Partial<Pick<EventSummary, 'nodeId' | 'msgId' | 'cls' | 'mode'>> = {},
): EventSummary {
  return {
    text,
    color,
    category: eventCategory(event),
    nodeId: extra.nodeId ?? null,
    msgId: extra.msgId ?? null,
    cls: extra.cls ?? null,
    mode: extra.mode ?? null,
  };
}

/** Human text and colour for a SimEvent. */
export function describeEvent(event: SimEvent): EventSummary {
  switch (event.type) {
    case 'COMMAND':
      return base(event, `command ${event.command.type}`, 'gray');
    case 'ORIGINATED':
      return base(
        event,
        `${event.nodeId} sent ${event.class} ${event.msgId}`,
        CLASS_COLOR[event.class],
        {
          nodeId: event.nodeId,
          msgId: event.msgId,
          cls: event.class,
        },
      );
    case 'DELIVERED':
      return base(
        event,
        `${event.msgId} delivered at ${event.nodeId} (hop ${event.hop})`,
        CLASS_COLOR[event.class],
        { nodeId: event.nodeId, msgId: event.msgId, cls: event.class },
      );
    case 'DROPPED':
      return base(
        event,
        `${event.nodeId} dropped ${event.msgId}: ${DROP_REASON_LABEL[event.reason]}`,
        isRejection(event.reason) ? 'red' : event.reason === 'DUPLICATE' ? 'gray' : 'orange',
        { nodeId: event.nodeId, msgId: event.msgId, cls: event.class },
      );
    case 'STORED':
      return base(event, `${event.nodeId} stored ${event.msgId} for later`, 'yellow', {
        nodeId: event.nodeId,
        msgId: event.msgId,
      });
    case 'STORE_FLUSHED':
      return base(event, `${event.nodeId} flushed ${event.msgId} to ${event.to}`, 'yellow', {
        nodeId: event.nodeId,
        msgId: event.msgId,
      });
    case 'MODE_CHANGED':
      return base(
        event,
        `${event.nodeId} ${event.from} → ${event.to} (${event.source})`,
        MODE_COLOR[event.to],
        { nodeId: event.nodeId, mode: event.to },
      );
    case 'TX_OPENED':
      return base(event, `request ${event.requestId} opened by ${event.nodeId}`, 'lime', {
        nodeId: event.nodeId,
        msgId: event.requestId,
      });
    case 'TX_ACCEPTED':
      return base(event, `request ${event.requestId} accepted by ${event.accepterId}`, 'teal', {
        nodeId: event.accepterId,
        msgId: event.requestId,
      });
    case 'TX_CLOSED':
      return base(event, `request ${event.requestId} closed`, 'gray', {
        nodeId: event.nodeId,
        msgId: event.requestId,
      });
    case 'TX_RESPONSE_LATE':
      return base(
        event,
        `late response from ${event.responderId} to ${event.requestId} (already taken)`,
        'orange',
        { nodeId: event.responderId, msgId: event.requestId },
      );
    case 'AUTHORITY_RECEIVED':
      return base(
        event,
        `Authority received ${event.class} ${event.msgId} via ${event.via}`,
        'violet',
        { nodeId: event.via, msgId: event.msgId, cls: event.class },
      );
    case 'AUTHORITY_INJECTED':
      return base(
        event,
        `Authority injected ${event.class} at ${event.count} backhaul node${event.count === 1 ? '' : 's'}`,
        'violet',
        { msgId: event.msgId, cls: event.class },
      );
    case 'ADJACENCY':
      return base(
        event,
        `topology v${event.version}: ${event.edges} edges, ${event.components} components`,
        'gray',
      );
    case 'AUTO_RESPOND_NONE':
      return base(
        event,
        event.requestId
          ? `nobody can respond to ${event.requestId}`
          : 'no open request to respond to',
        'orange',
        { msgId: event.requestId },
      );
  }
}

const eventKeys = new WeakMap<SimEvent, number>();
let nextEventKey = 1;

/** Stable React key for an event object (events are immutable and keep their identity). */
export function eventKey(event: SimEvent): number {
  let key = eventKeys.get(event);
  if (key === undefined) {
    key = nextEventKey++;
    eventKeys.set(event, key);
  }
  return key;
}
