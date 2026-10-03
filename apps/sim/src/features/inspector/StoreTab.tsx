import { Badge, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { useNodeDetail } from '../../sim/selectors';

interface StoreTabProps {
  nodeId: string;
}

export function StoreTab({ nodeId }: StoreTabProps) {
  const detail = useNodeDetail(nodeId);

  const store = (detail as any)?.store || [];

  if (store.length === 0) {
    return <Text c="dimmed">Store is empty</Text>;
  }

  return (
    <ScrollArea style={{ height: 400 }}>
      <Stack gap="md" p="md">
        {store.map((entry: any, idx: number) => (
          <Group key={idx} gap="xs" p="xs" style={{ borderBottom: '1px solid #2c2e31' }}>
            <Badge size="sm">{entry.msgId}</Badge>
            <Text size="xs">{entry.hop} hops</Text>
          </Group>
        ))}
      </Stack>
    </ScrollArea>
  );
}
