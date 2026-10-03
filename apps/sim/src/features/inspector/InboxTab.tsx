import { ScrollArea, Stack, Text } from '@mantine/core';
import { useNodeDetail } from '../../sim/selectors';
import { MessageCard } from './MessageCard';

interface InboxTabProps {
  nodeId: string;
}

export function InboxTab({ nodeId }: InboxTabProps) {
  const detail = useNodeDetail(nodeId);

  const inbox = (detail as any)?.inbox || [];

  if (inbox.length === 0) {
    return <Text c="dimmed">No messages in inbox</Text>;
  }

  return (
    <ScrollArea style={{ height: 400 }}>
      <Stack gap="md" p="md">
        {inbox.map((msg: any) => (
          <MessageCard key={msg.id} message={msg} />
        ))}
      </Stack>
    </ScrollArea>
  );
}
