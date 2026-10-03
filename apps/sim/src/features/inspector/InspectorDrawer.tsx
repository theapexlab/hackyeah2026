import { Badge, Divider, Drawer, Group, Stack, Tabs, Text } from '@mantine/core';
import { formatCredential, formatMode, formatNodeId } from '../../lib/format';
import { useNodeDetail, useSimSnapshot } from '../../sim/selectors';
import { useUIStore } from '../../ui/store';
import { AuthorityActions } from './actions/AuthorityActions';
import { MobileActions } from './actions/MobileActions';
import { RouterActions } from './actions/RouterActions';
import { InboxTab } from './InboxTab';
import { LogTab } from './LogTab';
import { StoreTab } from './StoreTab';

export function InspectorDrawer() {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useUIStore((s) => s.setSelectedNodeId);
  const inspectorTab = useUIStore((s) => s.inspectorTab);
  const setInspectorTab = useUIStore((s) => s.setInspectorTab);
  const node = useNodeDetail(
    selectedNodeId && selectedNodeId !== 'authority' ? selectedNodeId : null,
  );
  const snapshot = useSimSnapshot();

  const isOpen = selectedNodeId !== null;

  if (!isOpen) return null;

  if (selectedNodeId === 'authority') {
    return (
      <Drawer
        opened={isOpen}
        onClose={() => setSelectedNodeId(null)}
        title="Authority Console"
        position="right"
        size={380}
      >
        <Stack gap="md">
          <AuthorityActions />

          <Divider />

          <div>
            <Text fw={500} size="sm" mb="xs">
              Received Uplinks
            </Text>
            {snapshot?.authority.received && snapshot.authority.received.length > 0 ? (
              <Stack gap="xs">
                {snapshot.authority.received.slice(-10).map((uplink) => (
                  <Badge key={uplink.msgId} variant="light">
                    {uplink.msgId} (T{uplink.tick})
                  </Badge>
                ))}
              </Stack>
            ) : (
              <Text c="dimmed" size="sm">
                No uplinks received
              </Text>
            )}
          </div>
        </Stack>
      </Drawer>
    );
  }

  if (!node) return null;

  return (
    <Drawer
      opened={isOpen}
      onClose={() => setSelectedNodeId(null)}
      title={formatNodeId(node.id)}
      position="right"
      size={380}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Badge>{node.kind}</Badge>
          <Badge variant="light">{formatMode(node.mode)}</Badge>
          <Badge variant="light">{formatCredential(node.credentialKind)}</Badge>
        </Group>

        <Divider />

        {node.kind === 'mobile' && <MobileActions node={node} />}
        {node.kind !== 'mobile' && <RouterActions node={node} />}

        <Divider />

        <Tabs value={inspectorTab} onChange={(tab) => setInspectorTab(tab as any)}>
          <Tabs.List>
            <Tabs.Tab value="inbox">Inbox</Tabs.Tab>
            <Tabs.Tab value="store">Store</Tabs.Tab>
            <Tabs.Tab value="log">Log</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="inbox" pt="md">
            <InboxTab nodeId={node.id} />
          </Tabs.Panel>

          <Tabs.Panel value="store" pt="md">
            <StoreTab nodeId={node.id} />
          </Tabs.Panel>

          <Tabs.Panel value="log" pt="md">
            <LogTab nodeId={node.id} />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Drawer>
  );
}
