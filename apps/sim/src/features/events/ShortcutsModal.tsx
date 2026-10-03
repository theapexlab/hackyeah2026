import { Modal, Table } from '@mantine/core';
import { simEvents } from '../../sim/events';
import { useUIStore } from '../../ui/store';

const HOTKEYS = [
  ...simEvents.map((e) => ({ key: e.key, label: e.label, hint: e.hint })),
  { key: 'Space', label: 'Play/Pause', hint: 'Toggle simulation' },
  { key: '.', label: 'Step', hint: 'Execute one tick' },
  { key: '+/-', label: 'Speed', hint: 'Adjust playback speed' },
  { key: 'v', label: 'Ranges', hint: 'Toggle range circles' },
  { key: 't', label: 'Topology', hint: 'Toggle topology packets' },
  { key: 'd', label: 'Dark/Light', hint: 'Toggle theme' },
  { key: 'Esc', label: 'Deselect', hint: 'Clear selection' },
  { key: '?', label: 'Help', hint: 'Show this modal' },
];

export function ShortcutsModal() {
  const open = useUIStore((s) => s.shortcutsModalOpen);
  const setOpen = useUIStore((s) => s.setShortcutsModalOpen);

  return (
    <Modal opened={open} onClose={() => setOpen(false)} title="Keyboard Shortcuts" size="lg">
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Key</Table.Th>
            <Table.Th>Action</Table.Th>
            <Table.Th>Description</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {HOTKEYS.map((hk) => (
            <Table.Tr key={hk.key}>
              <Table.Td>
                <kbd style={{ padding: '2px 6px', backgroundColor: '#2c2e31', borderRadius: 4 }}>
                  {hk.key}
                </kbd>
              </Table.Td>
              <Table.Td fw={500}>{hk.label}</Table.Td>
              <Table.Td>{hk.hint}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Modal>
  );
}
