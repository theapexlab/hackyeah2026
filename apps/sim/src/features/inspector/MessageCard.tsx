import { Badge, Group, Paper, Text } from '@mantine/core';
import type { MessageView } from '@pomoc/core';
import { formatClass } from '../../lib/format';
import { classCss } from '../../theme/tokens';
import { useUIStore } from '../../ui/store';

export function MessageCard({ message }: { message: MessageView }) {
  const highlighted = useUIStore((s) => s.highlightedMessageId === message.id);
  const color = classCss(message.class);

  return (
    <Paper
      component="button"
      type="button"
      withBorder
      p="xs"
      radius="md"
      aria-pressed={highlighted}
      aria-label={`${formatClass(message.class)} message ${message.id}, highlight on map`}
      onClick={() => useUIStore.getState().setHighlightedMessageId(highlighted ? null : message.id)}
      style={{
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        borderColor: highlighted ? color : undefined,
        borderWidth: highlighted ? 2 : 1,
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Badge size="sm" style={{ background: color, color: '#000' }}>
          {formatClass(message.class)}
        </Badge>
        <Text size="xs" c="dimmed" truncate>
          {message.id}
        </Text>
      </Group>
      <Text size="xs" mt={4}>
        from {message.originId} &middot; hop {message.hop}/
        {message.unbounded ? '\u221e' : message.hopLimit} &middot; ttl {message.ttlRemaining}
        {message.status ? ` · ${message.status}` : ''}
      </Text>
    </Paper>
  );
}
