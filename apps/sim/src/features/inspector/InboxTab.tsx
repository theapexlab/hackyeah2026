import { Stack, Text } from '@mantine/core';
import type { NodeDetail } from '@pomoc/core';
import { withKeys } from '../../lib/keys';
import { MessageCard } from './MessageCard';

export function InboxTab({ detail }: { detail: NodeDetail }) {
  if (detail.inbox.length === 0)
    return (
      <Text c="dimmed" size="sm">
        Inbox is empty
      </Text>
    );
  return (
    <Stack gap="xs">
      {withKeys(detail.inbox.slice(0, 40), (m) => `${m.id}:${m.hop}`).map(({ key, item }) => (
        <MessageCard key={key} message={item} />
      ))}
    </Stack>
  );
}
