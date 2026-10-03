import { Badge, Button, Group, Kbd, Stack, Text, Tooltip } from '@mantine/core';
import { simEvents } from '../../sim/events';
import { useCellsUp, useGridUp } from '../../sim/selectors';

export function EventsPanel() {
  const cellsUp = useCellsUp();
  const gridUp = useGridUp();
  const state: Record<string, boolean> = { c: cellsUp, g: gridUp };

  return (
    <Stack gap={6} p="sm">
      <Text fw={700} size="sm">
        Events
      </Text>
      {simEvents.map((e) => (
        <Tooltip key={e.key} label={e.hint} position="right" openDelay={400}>
          <Button
            variant="light"
            size="xs"
            justify="space-between"
            fullWidth
            aria-label={`${e.label}, key ${e.key}`}
            onClick={e.run}
            rightSection={<Kbd size="xs">{e.key}</Kbd>}
          >
            <Group gap={6} wrap="nowrap">
              {e.label}
              {e.key in state && (
                <Badge size="xs" color={state[e.key] ? 'green' : 'red'} variant="filled">
                  {state[e.key] ? 'on' : 'off'}
                </Badge>
              )}
            </Group>
          </Button>
        </Tooltip>
      ))}
    </Stack>
  );
}
