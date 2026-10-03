import { ActionIcon, Badge, Divider, Group, ScrollArea, Stack, Tabs, Text } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { formatBackhaul, formatCredential, formatMode, formatNodeId } from '../../lib/format';
import { useNodeDetail, useNodeView } from '../../sim/selectors';
import { modeColorName } from '../../theme/tokens';
import { AUTHORITY, type InspectorTab, useUIStore } from '../../ui/store';
import { AuthorityActions } from './actions/AuthorityActions';
import { MobileActions } from './actions/MobileActions';
import { RouterActions } from './actions/RouterActions';
import { InboxTab } from './InboxTab';
import { LogTab } from './LogTab';
import { StoreTab } from './StoreTab';

function Header({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="nowrap">
        <Text fw={700}>{title}</Text>
        <ActionIcon
          aria-label="Close inspector"
          variant="subtle"
          onClick={() => useUIStore.getState().select(null)}
        >
          <IconX size={16} />
        </ActionIcon>
      </Group>
      {children}
    </Stack>
  );
}

function NodePanel({ id }: { id: string }) {
  const detail = useNodeDetail(id);
  const view = useNodeView(id);
  const tab = useUIStore((s) => s.inspectorTab);
  if (!detail) return <Header title="Node not found" />;

  return (
    <Stack gap="md">
      <Header title={formatNodeId(detail.id)}>
        <Group gap={6}>
          <Badge variant="outline">{detail.kind}</Badge>
          <Badge color={modeColorName[detail.mode]}>{formatMode(detail.mode)}</Badge>
          <Badge variant="light">{formatCredential(detail.credentialKind)}</Badge>
          <Badge color={detail.alive ? 'green' : 'red'} variant="light">
            {detail.alive ? 'powered' : 'powered off'}
          </Badge>
          <Badge color={detail.hasBackhaul ? 'green' : 'gray'} variant="light">
            backhaul: {detail.hasBackhaul ? formatBackhaul(detail.backhaul) : 'none'}
          </Badge>
          {view && <Badge variant="outline">component {view.componentId}</Badge>}
        </Group>
      </Header>
      <Divider />
      {detail.kind === 'mobile' ? (
        <MobileActions detail={detail} />
      ) : (
        <RouterActions detail={detail} />
      )}
      <Divider />
      <Tabs
        value={tab}
        onChange={(t) => t && useUIStore.getState().setInspectorTab(t as InspectorTab)}
      >
        <Tabs.List>
          <Tabs.Tab value="inbox">Inbox ({detail.inbox.length})</Tabs.Tab>
          <Tabs.Tab value="store">Store ({detail.store.length})</Tabs.Tab>
          <Tabs.Tab value="log">Log</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="inbox" pt="sm">
          <InboxTab detail={detail} />
        </Tabs.Panel>
        <Tabs.Panel value="store" pt="sm">
          <StoreTab detail={detail} />
        </Tabs.Panel>
        <Tabs.Panel value="log" pt="sm">
          <LogTab detail={detail} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

export function InspectorDrawer() {
  const selected = useUIStore((s) => s.selectedNodeId);
  if (!selected) return null;
  return (
    <ScrollArea h="100%" p="sm" type="auto">
      {selected === AUTHORITY ? (
        <Stack gap="md">
          <Header title="Authority console">
            <Text size="xs" c="dimmed">
              Virtual node: no position, no radio. Reaches every node with backhaul.
            </Text>
          </Header>
          <AuthorityActions />
        </Stack>
      ) : (
        <NodePanel id={selected} />
      )}
    </ScrollArea>
  );
}
