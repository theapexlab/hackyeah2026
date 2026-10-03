import { Chip, Group, ScrollArea, Text } from '@mantine/core';
import type { SimEvent } from '@pomoc/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  eventCategory,
  eventKey,
  LOG_CATEGORIES,
  LOG_CATEGORY_LABEL,
  type LogCategory,
} from '../../lib/eventText';
import { useSimStore } from '../../sim/store';
import { useUiStore } from '../../ui/store';
import { EventRow } from './EventRow';

const MAX_ROWS = 100;
/** Duplicate drops and system chatter are hidden until asked for. */
const DEFAULT_FILTERS: readonly LogCategory[] = [
  'drop',
  'deliver',
  'store',
  'mode',
  'tx',
  'authority',
];
const CHIP_COLOR: Readonly<Record<LogCategory, string>> = {
  drop: 'red',
  dupe: 'gray',
  deliver: 'green',
  store: 'yellow',
  mode: 'blue',
  tx: 'teal',
  authority: 'violet',
  system: 'gray',
};

function isCategory(value: string): value is LogCategory {
  return (LOG_CATEGORIES as readonly string[]).includes(value);
}

/** Last 100 matching events with auto-follow; scrolling up pauses following, back to bottom resumes. */
export function EventLog() {
  const events = useSimStore((s) => s.snapshot.recentEvents);
  const followLog = useUiStore((s) => s.followLog);
  const setFollowLog = useUiStore((s) => s.setFollowLog);
  const [filters, setFilters] = useState<readonly LogCategory[]>(DEFAULT_FILTERS);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo<readonly SimEvent[]>(() => {
    const active = new Set(filters);
    const out: SimEvent[] = [];
    for (let i = events.length - 1; i >= 0 && out.length < MAX_ROWS; i--) {
      const event = events[i];
      if (event && active.has(eventCategory(event))) out.push(event);
    }
    return out.reverse();
  }, [events, filters]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !followLog || rows.length === 0) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [followLog, rows]);

  return (
    <>
      <Group gap={6} px="sm" py={6} wrap="nowrap" style={{ overflowX: 'auto' }}>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
          Log
        </Text>
        <Chip.Group
          multiple
          value={[...filters]}
          onChange={(values) => setFilters(values.filter(isCategory))}
        >
          {LOG_CATEGORIES.map((category) => (
            <Chip key={category} value={category} size="xs" color={CHIP_COLOR[category]}>
              {LOG_CATEGORY_LABEL[category]}
            </Chip>
          ))}
        </Chip.Group>
        <Chip
          size="xs"
          checked={followLog}
          onChange={(checked) => setFollowLog(checked)}
          variant="light"
          ml="auto"
        >
          follow
        </Chip>
      </Group>
      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        viewportRef={viewportRef}
        scrollbarSize={6}
        onScrollPositionChange={({ y }) => {
          const viewport = viewportRef.current;
          if (!viewport) return;
          const atBottom = y + viewport.clientHeight >= viewport.scrollHeight - 12;
          if (atBottom !== followLog) setFollowLog(atBottom);
        }}
      >
        {rows.length === 0 ? (
          <Text size="xs" c="dimmed" px="sm" py="xs">
            Nothing yet. Press play, send a request, or trigger an outage.
          </Text>
        ) : (
          rows.map((event) => <EventRow key={eventKey(event)} event={event} />)
        )}
      </ScrollArea>
    </>
  );
}
