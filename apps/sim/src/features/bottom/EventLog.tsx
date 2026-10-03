import { Badge, Chip, Group, ScrollArea, Text } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatClass } from '../../lib/format';
import { useSimRecentEvents } from '../../sim/selectors';
import { useSimStore } from '../../sim/store';
import { useUIStore } from '../../ui/store';

type Filter = 'drop' | 'deliver' | 'forward' | 'mode' | 'tx';
type Row = { type: string; tick: number; [k: string]: unknown };

const FILTER_OF: Record<string, Filter> = {
  DROPPED: 'drop',
  DELIVERED: 'deliver',
  ORIGINATED: 'forward',
  STORED: 'forward',
  STORE_FLUSHED: 'forward',
  AUTHORITY_INJECTED: 'forward',
  AUTHORITY_RECEIVED: 'forward',
  MODE_CHANGED: 'mode',
  COMMAND: 'mode',
  TX_OPENED: 'tx',
  TX_ACCEPTED: 'tx',
  TX_CLOSED: 'tx',
  TX_RESPONSE_LATE: 'tx',
  AUTO_RESPOND_NONE: 'tx',
};
const COLOR: Record<Filter, string> = {
  drop: 'red',
  deliver: 'green',
  forward: 'blue',
  mode: 'orange',
  tx: 'teal',
};
const FILTERS: Filter[] = ['drop', 'deliver', 'forward', 'mode', 'tx'];

const s = (v: unknown): string => (typeof v === 'string' ? v : '');

function describe(e: Row): { node?: string; text: string } {
  const cls = e.class ? formatClass(s(e.class)) : '';
  switch (e.type) {
    case 'DROPPED':
      return { node: s(e.at), text: `${cls} ${s(e.msgId)} dropped: ${s(e.reason)}` };
    case 'DELIVERED':
      return { node: s(e.to), text: `${cls} ${s(e.msgId)} delivered (hop ${String(e.hop)})` };
    case 'ORIGINATED':
      return { node: s(e.originId), text: `${cls} ${s(e.msgId)} originated` };
    case 'STORED':
      return { node: s(e.at), text: `${cls} ${s(e.msgId)} stored` };
    case 'STORE_FLUSHED':
      return { node: s(e.to), text: `${cls} ${s(e.msgId)} flushed ${s(e.from)} to ${s(e.to)}` };
    case 'MODE_CHANGED':
      return { node: s(e.nodeId), text: `${s(e.from)} to ${s(e.to)} (${s(e.source)})` };
    case 'COMMAND':
      return { text: `command ${s((e.command as { type?: string } | undefined)?.type)}` };
    case 'TX_ACCEPTED':
      return { node: s(e.acceptedBy), text: `${s(e.requestId)} accepted` };
    case 'TX_OPENED':
      return { node: s(e.from), text: `${s(e.requestId)} opened` };
    case 'AUTHORITY_INJECTED':
      return { node: s(e.to), text: `${s(e.msgId)} injected` };
    default:
      return { text: `${s(e.msgId) || s(e.requestId)}` };
  }
}

export function EventLog() {
  const recent = useSimRecentEvents() as Row[];
  const followLog = useUIStore((st) => st.followLog);
  const [active, setActive] = useState<Filter[]>(FILTERS);
  const viewport = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    // recentEvents is a sliding tail of the engine log, so absolute position gives a stable key.
    const base = (useSimStore.getState().engine?.getEventLog().length ?? 0) - recent.length;
    return recent
      .map((e, i) => ({ e, seq: base + i }))
      .filter(({ e }) => e.type !== 'ADJACENCY' && active.includes(FILTER_OF[e.type] ?? 'forward'))
      .slice(-100);
  }, [recent, active]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever rows change
  useEffect(() => {
    if (followLog) viewport.current?.scrollTo({ top: viewport.current.scrollHeight });
  }, [rows, followLog]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Group gap={6} px="xs" py={4} wrap="nowrap" style={{ flex: 'none' }}>
        <Text size="xs" fw={700}>
          Event log
        </Text>
        <Chip.Group multiple value={active} onChange={(v) => setActive(v as Filter[])}>
          {FILTERS.map((f) => (
            <Chip key={f} value={f} size="xs" color={COLOR[f]}>
              {f}
            </Chip>
          ))}
        </Chip.Group>
        <Chip size="xs" checked={followLog} onChange={(v) => useUIStore.getState().setFollowLog(v)}>
          follow
        </Chip>
      </Group>
      <ScrollArea style={{ flex: 1, minHeight: 0 }} viewportRef={viewport} type="auto">
        {rows.map(({ e, seq }) => {
          const f = FILTER_OF[e.type] ?? 'forward';
          const { node, text } = describe(e);
          return (
            <Group
              key={seq}
              gap={6}
              px="xs"
              py={1}
              wrap="nowrap"
              component={node ? 'button' : 'div'}
              onClick={node ? () => useUIStore.getState().select(node) : undefined}
              style={{
                background: 'none',
                border: 0,
                width: '100%',
                textAlign: 'left',
                cursor: node ? 'pointer' : 'default',
                color: 'inherit',
              }}
            >
              <Text size="xs" c="dimmed" ff="monospace" w={44} style={{ flex: 'none' }}>
                T{e.tick}
              </Text>
              <Badge size="xs" color={COLOR[f]} variant="light" w={64} style={{ flex: 'none' }}>
                {f}
              </Badge>
              <Text size="xs" truncate>
                {text}
              </Text>
            </Group>
          );
        })}
      </ScrollArea>
    </div>
  );
}
