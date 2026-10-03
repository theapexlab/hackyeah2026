import { Box, Group, Text } from '@mantine/core';
import type { SimEvent } from '@pomoc/core';
import { memo } from 'react';
import { describeEvent } from '../../lib/eventText';
import { formatTick } from '../../lib/format';
import { useUiStore } from '../../ui/store';

interface EventRowProps {
  readonly event: SimEvent;
  /** Hide the tick column (node log already groups by tick). */
  readonly compact?: boolean;
}

/** One log line: tick, a dot in the class/mode colour, text. Click selects the node involved. */
export const EventRow = memo(function EventRow({ event, compact = false }: EventRowProps) {
  const summary = describeEvent(event);
  const onClick = (): void => {
    const ui = useUiStore.getState();
    if (summary.nodeId) ui.select(summary.nodeId);
    if (summary.msgId) ui.highlightMessage(summary.msgId);
  };

  return (
    <Group
      gap={6}
      wrap="nowrap"
      px={6}
      py={1}
      className="pomoc-log-row"
      onClick={onClick}
      role="button"
      tabIndex={-1}
    >
      {compact ? null : (
        <Text size="xs" ff="monospace" c="dimmed" style={{ width: 44, flexShrink: 0 }}>
          {formatTick(event.tick)}
        </Text>
      )}
      <Box
        w={8}
        h={8}
        style={{
          flexShrink: 0,
          borderRadius: '50%',
          background: `var(--mantine-color-${summary.color}-filled)`,
        }}
      />
      <Text size="xs" truncate style={{ color: `var(--mantine-color-${summary.color}-text)` }}>
        {summary.text}
      </Text>
    </Group>
  );
});
