import type {
  CheckInStatus,
  CredentialKind,
  MessageClass,
  MessageView,
  NodeKind,
  Payload,
  RequestViewStatus,
} from '@pomoc/core';

const KIND_LABEL: Readonly<Record<NodeKind, string>> = {
  mobile: 'Phone',
  router: 'Router',
  gateway: 'Gateway',
};

const CREDENTIAL_LABEL: Readonly<Record<CredentialKind, string>> = {
  citizen: 'Citizen',
  relay: 'Relay',
  authority: 'Authority',
  none: 'Unregistered',
};

export function formatKind(kind: NodeKind): string {
  return KIND_LABEL[kind];
}

export function formatCredential(kind: CredentialKind): string {
  return CREDENTIAL_LABEL[kind];
}

/** 'LIFE_CRITICAL' -> 'Life critical'. */
export function formatClass(cls: MessageClass): string {
  const lower = cls.toLowerCase().replace(/_/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function formatTick(tick: number): string {
  return tick.toLocaleString('en-US');
}

export function formatPercent(fraction: number, digits = 0): string {
  if (!Number.isFinite(fraction)) return '–';
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatMetres(metres: number): string {
  return `${Math.round(metres)} m`;
}

export function formatHops(hop: number, hopLimit: number | null): string {
  return `${hop}/${hopLimit === null ? '∞' : hopLimit}`;
}

export function truncate(text: string, max = 80): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function formatSeed(seed: number): string {
  return String(seed >>> 0);
}

const CHECK_IN_LABEL: Readonly<Record<CheckInStatus, string>> = {
  OK: "I'm OK",
  NEED_EVACUATION: 'Need evacuation',
  TRAPPED: 'Trapped',
};

export function formatCheckIn(status: CheckInStatus): string {
  return CHECK_IN_LABEL[status];
}

/** One-line human summary of a message body. */
export function formatPayload(payload: Payload): string {
  switch (payload.kind) {
    case 'REQUEST':
      return payload.price !== undefined && payload.price > 0
        ? `${payload.text} (${payload.price} zł)`
        : payload.text;
    case 'RESPONSE':
      return `Response to ${payload.requestId} from ${payload.responderId}`;
    case 'CLOSE':
      return `Close ${payload.requestId}: accepted by ${payload.accepterId}`;
    case 'CHECK_IN':
      return payload.text
        ? `Check-in: ${formatCheckIn(payload.status)} — ${payload.text}`
        : `Check-in: ${formatCheckIn(payload.status)}`;
    case 'ALERT':
      return payload.text;
    case 'MODE_DECLARATION':
      return payload.level === 'ALL_CLEAR'
        ? 'All-clear'
        : `Declare ${payload.level} until tick ${formatTick(payload.untilTick)}`;
    case 'TOPOLOGY':
      return `Topology gossip (${payload.neighbours.length} neighbours)`;
  }
}

/** Ticks a message has left before TTL expiry (negative when expired). */
export function ttlRemaining(
  message: Pick<MessageView, 'createdTick' | 'ttlTicks'>,
  tick: number,
): number {
  return message.createdTick + message.ttlTicks - tick;
}

const REQUEST_STATUS_LABEL: Readonly<Record<RequestViewStatus, string>> = {
  open: 'open',
  taken: 'taken',
  mine: 'mine',
  'accepted-by-me': 'accepted by me',
};

export function formatRequestStatus(status: RequestViewStatus): string {
  return REQUEST_STATUS_LABEL[status];
}
