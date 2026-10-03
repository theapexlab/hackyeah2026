import { Group, Kbd, Modal, Stack, Table, Text } from '@mantine/core';
import { IconKeyboard } from '@tabler/icons-react';
import { type EventGroup, eventsInGroup } from '../../sim/events';
import { useUiStore } from '../../ui/store';

const GROUPS: readonly { readonly title: string; readonly group: EventGroup }[] = [
  { title: 'Network', group: 'infrastructure' },
  { title: 'Emergency', group: 'authority' },
  { title: 'Traffic', group: 'citizens' },
  { title: 'Playback', group: 'playback' },
  { title: 'View', group: 'view' },
];

/** Every hotkey from sim/events.ts, grouped. Opened by the "?" button; Esc closes it. */
export function ShortcutsModal() {
  const opened = useUiStore((s) => s.shortcutsOpen);
  const setOpen = useUiStore((s) => s.setShortcutsOpen);

  return (
    <Modal
      opened={opened}
      onClose={() => setOpen(false)}
      title={
        <Group gap="xs">
          <IconKeyboard size={20} />
          <Text fw={700}>Keyboard shortcuts</Text>
        </Group>
      }
      size="lg"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Shortcuts are ignored while typing in a field. Buttons in the side panel run the same
          events.
        </Text>
        {GROUPS.map(({ title, group }) => (
          <div key={group}>
            <Text
              size="xs"
              fw={700}
              c="dimmed"
              tt="uppercase"
              mb={4}
              style={{ letterSpacing: '0.08em' }}
            >
              {title}
            </Text>
            <Table verticalSpacing={4} withRowBorders={false}>
              <Table.Tbody>
                {eventsInGroup(group).map((event) => (
                  <Table.Tr key={event.key}>
                    <Table.Td w={90}>
                      <Kbd>{event.hotkey}</Kbd>
                    </Table.Td>
                    <Table.Td w={220}>
                      <Text size="sm" fw={600}>
                        {event.label}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {event.hint}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        ))}
      </Stack>
    </Modal>
  );
}
