import {
  ActionIcon,
  AppShell,
  Badge,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import type { NodeId, NodeView } from '@pomoc/core';
import {
  IconDatabase,
  IconFocusCentered,
  IconInbox,
  IconListDetails,
  IconX,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { formatCredential, formatKind, formatMetres } from '../../lib/format';
import { selectNodeById, selectTick } from '../../sim/selectors';
import { useSimStore } from '../../sim/store';
import { AUTHORITY_ICON, KIND_ICON } from '../../theme/icons';
import { MODE_COLOR, MODE_LABEL } from '../../theme/tokens';
import { type InspectorTab, useUiStore } from '../../ui/store';
import { AuthorityActions } from './actions/AuthorityActions';
import { MobileActions } from './actions/MobileActions';
import { RouterActions } from './actions/RouterActions';
import { InboxTab } from './InboxTab';
import { LogTab } from './LogTab';
import { StoreTab } from './StoreTab';
import { useNodeDetail } from './useNodeDetail';

const TABS: readonly InspectorTab[] = ['inbox', 'store', 'log'];

function isInspectorTab(value: string | null): value is InspectorTab {
  return value !== null && (TABS as readonly string[]).includes(value);
}

function Header({
  title,
  icon,
  onClose,
  extra,
}: {
  readonly title: string;
  readonly icon: ReactNode;
  readonly onClose: () => void;
  readonly extra?: ReactNode;
}) {
  return (
    <Group justify="space-between" wrap="nowrap">
      <Group gap="sm" wrap="nowrap">
        {icon}
        <Title order={4} ff="monospace">
          {title}
        </Title>
      </Group>
      <Group gap={4} wrap="nowrap">
        {extra}
        <Tooltip label="Close (Esc)">
          <ActionIcon variant="subtle" onClick={onClose} aria-label="Close inspector">
            <IconX size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}

function NodeBadges({ node }: { readonly node: NodeView }) {
  return (
    <Group gap={6}>
      <Badge variant="light">{formatKind(node.kind)}</Badge>
      <Badge color={MODE_COLOR[node.mode]}>
        {MODE_LABEL[node.mode]}
        {node.modeSource !== 'local' ? ` · ${node.modeSource}` : ''}
      </Badge>
      <Badge variant="outline" color={node.credentialKind === 'none' ? 'gray' : undefined}>
        {formatCredential(node.credentialKind)}
      </Badge>
      <Badge color={node.alive ? 'green' : 'red'} variant="light">
        {node.alive ? 'powered' : 'off'}
      </Badge>
      <Badge color={node.hasBackhaul ? 'green' : 'gray'} variant="light">
        {node.hasBackhaul ? 'backhaul' : 'no backhaul'}
      </Badge>
      <Badge variant="default">component {node.componentId}</Badge>
      <Badge variant="default">{node.neighbourCount} neighbours</Badge>
      <Badge variant="default">range {formatMetres(node.range)}</Badge>
    </Group>
  );
}

function NodeInspector({ id }: { readonly id: NodeId }) {
  const node = useSimStore(selectNodeById(id));
  const tick = useSimStore(selectTick);
  const detail = useNodeDetail(id);
  const tab = useUiStore((s) => s.inspectorTab);
  const setTab = useUiStore((s) => s.setInspectorTab);
  const deselect = useUiStore((s) => s.deselect);
  const requestFocus = useUiStore((s) => s.requestFocus);

  if (!node) {
    return (
      <Stack gap="sm" p="md">
        <Header title={id} icon={null} onClose={deselect} />
        <Text size="sm" c="dimmed">
          This node is not in the current world.
        </Text>
      </Stack>
    );
  }
  const Icon = KIND_ICON[node.kind];

  return (
    <Stack gap="sm" p="md">
      <Header
        title={node.id}
        icon={
          <ThemeIcon variant="light" color={MODE_COLOR[node.mode]} size="lg" radius="md">
            <Icon size={20} />
          </ThemeIcon>
        }
        onClose={deselect}
        extra={
          <Tooltip label="Centre on the map">
            <ActionIcon
              variant="subtle"
              onClick={() => requestFocus(node.id)}
              aria-label="Centre on node"
            >
              <IconFocusCentered size={18} />
            </ActionIcon>
          </Tooltip>
        }
      />
      <NodeBadges node={node} />
      <Divider />
      {detail ? (
        node.kind === 'mobile' ? (
          <MobileActions node={node} detail={detail} tick={tick} />
        ) : (
          <RouterActions node={node} />
        )
      ) : null}
      <Divider />
      <Tabs
        value={tab}
        onChange={(value) => isInspectorTab(value) && setTab(value)}
        keepMounted={false}
      >
        <Tabs.List grow>
          <Tabs.Tab value="inbox" leftSection={<IconInbox size={14} />}>
            Inbox{detail && detail.inbox.length > 0 ? ` (${detail.inbox.length})` : ''}
          </Tabs.Tab>
          <Tabs.Tab value="store" leftSection={<IconDatabase size={14} />}>
            Store{detail && detail.store.length > 0 ? ` (${detail.store.length})` : ''}
          </Tabs.Tab>
          <Tabs.Tab value="log" leftSection={<IconListDetails size={14} />}>
            Log
          </Tabs.Tab>
        </Tabs.List>
        {detail ? (
          <>
            <Tabs.Panel value="inbox">
              <InboxTab detail={detail} tick={tick} />
            </Tabs.Panel>
            <Tabs.Panel value="store">
              <StoreTab detail={detail} tick={tick} />
            </Tabs.Panel>
            <Tabs.Panel value="log">
              <LogTab detail={detail} />
            </Tabs.Panel>
          </>
        ) : null}
      </Tabs>
      {detail ? (
        <Text size="xs" c="dimmed">
          {detail.seenCount} message ids remembered for de-duplication
        </Text>
      ) : null}
    </Stack>
  );
}

function AuthorityInspector() {
  const deselect = useUiStore((s) => s.deselect);
  const Icon = AUTHORITY_ICON;
  return (
    <Stack gap="sm" p="md">
      <Header
        title="Authority"
        icon={
          <ThemeIcon variant="filled" color="violet" size="lg" radius="md">
            <Icon size={20} />
          </ThemeIcon>
        }
        onClose={deselect}
      />
      <Text size="xs" c="dimmed">
        Virtual node without a position. Its messages enter the mesh at every alive node with a
        backhaul and flood from there; forged ones are dropped by every receiver.
      </Text>
      <Divider />
      <AuthorityActions />
    </Stack>
  );
}

/** Aside content: the selected node or the Authority console. Esc deselects (hotkey). */
export function InspectorDrawer() {
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  return (
    <AppShell.Section grow component={ScrollArea}>
      {selectedNodeId === null ? null : selectedNodeId === 'authority' ? (
        <AuthorityInspector />
      ) : (
        // Keyed on the node so form state (composer text, hop limit, check-in) never leaks
        // from one phone to the next. The Authority console deliberately keeps its state.
        <NodeInspector key={selectedNodeId} id={selectedNodeId} />
      )}
    </AppShell.Section>
  );
}
