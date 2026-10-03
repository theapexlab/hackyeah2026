import { Kbd, Modal, Table, useMantineColorScheme } from '@mantine/core';
import { useMemo } from 'react';
import { allHotkeys } from '../../ui/hotkeys';
import { useUIStore } from '../../ui/store';

export function ShortcutsModal() {
  const open = useUIStore((s) => s.shortcutsOpen);
  const { toggleColorScheme } = useMantineColorScheme();
  const rows = useMemo(() => allHotkeys({ toggleScheme: toggleColorScheme }), [toggleColorScheme]);

  return (
    <Modal
      opened={open}
      onClose={() => useUIStore.getState().setShortcutsOpen(false)}
      title="Keyboard shortcuts"
      size="lg"
    >
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Key</Table.Th>
            <Table.Th>Action</Table.Th>
            <Table.Th>Effect</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.display}>
              <Table.Td>
                <Kbd>{r.display}</Kbd>
              </Table.Td>
              <Table.Td fw={500}>{r.label}</Table.Td>
              <Table.Td>{r.hint}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Modal>
  );
}
