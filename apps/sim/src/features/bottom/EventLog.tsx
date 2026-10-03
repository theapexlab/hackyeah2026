import { Badge, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { useSimRecentEvents } from '../../sim/selectors';

const eventTypeColors: Record<string, string> = {
  ORIGINATED: 'blue',
  DELIVERED: 'green',
  DROPPED: 'red',
  STORED: 'yellow',
  MODE_CHANGED: 'orange',
  TX_OPENED: 'cyan',
  TX_ACCEPTED: 'teal',
};

export function EventLog() {
  const events = useSimRecentEvents() as Array<{ type?: string }>;

  return (
    <ScrollArea style={{ height: '100%' }}>
      <Stack gap="xs" p="md">
        {events
          .slice()
          .reverse()
          .map((event, idx) => {
            const type = event?.type || 'UNKNOWN';
            const color = eventTypeColors[type] || 'gray';

            return (
              <Group
                key={`event-${idx}`}
                gap="xs"
                p="xs"
                style={{ borderBottom: '1px solid #2c2e31' }}
              >
                <Badge size="sm" style={{ backgroundColor: color }}>
                  {type}
                </Badge>
                <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                  {JSON.stringify(event).substring(0, 100)}...
                </Text>
              </Group>
            );
          })}
      </Stack>
    </ScrollArea>
  );
}
