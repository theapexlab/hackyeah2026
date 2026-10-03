import { Badge, Card, Group, Stack, Text } from '@mantine/core';
import type { MessageView } from '@pomoc/core';
import { classColors, modeColors } from '../../theme/tokens';
import { useUIStore } from '../../ui/store';

interface MessageCardProps {
  message: MessageView;
}

export function MessageCard({ message }: MessageCardProps) {
  const setHighlightedMessageId = useUIStore((s) => s.setHighlightedMessageId);
  const highlightedMessageId = useUIStore((s) => s.highlightedMessageId);

  const isHighlighted = highlightedMessageId === message.id;
  const color = (classColors as any)[message.class] || '#868e96';

  return (
    <Card
      padding="sm"
      radius="md"
      withBorder
      onClick={() => setHighlightedMessageId(isHighlighted ? null : message.id)}
      style={{
        cursor: 'pointer',
        borderColor: isHighlighted ? color : undefined,
        borderWidth: isHighlighted ? 2 : 1,
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between">
          <Badge style={{ backgroundColor: color }}>{message.class}</Badge>
          <Text size="xs" c="dimmed">
            {message.id}
          </Text>
        </Group>

        <Text size="sm">Origin: {message.originId}</Text>

        <Group gap="xs">
          <Text size="xs">Hop limit: {message.hopLimit}</Text>
          <Text size="xs">TTL: {message.ttlRemaining}</Text>
        </Group>
      </Stack>
    </Card>
  );
}
