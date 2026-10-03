import { Button, Divider, Group, Stack, Text } from '@mantine/core';
import { simEvents } from '../../sim/events';

export function EventsPanel() {
  return (
    <Stack gap="md" p="md">
      <div>
        <h3 style={{ margin: '0 0 1rem 0' }}>Events</h3>

        <Stack gap="xs">
          {simEvents.map((event) => (
            <Button
              key={event.key}
              onClick={() => event.run()}
              variant="light"
              fullWidth
              justify="space-between"
            >
              <Group gap="xs" style={{ flex: 1 }}>
                <Text size="sm">{event.label}</Text>
                <Text size="xs" c="dimmed">
                  {event.hint}
                </Text>
              </Group>
              <kbd
                style={{
                  padding: '2px 6px',
                  backgroundColor: '#2c2e31',
                  borderRadius: 4,
                  fontSize: 11,
                }}
              >
                {event.key}
              </kbd>
            </Button>
          ))}
        </Stack>
      </div>

      <Divider />
    </Stack>
  );
}
