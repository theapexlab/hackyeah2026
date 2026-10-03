import { Stack, Text } from '@mantine/core';
import type { NodeDetail } from '@pomoc/core';
import { MessageCard } from './MessageCard';

interface InboxTabProps {
  readonly detail: NodeDetail;
  readonly tick: number;
}

/** Packets waiting to be processed at the next tick, each with the path it took to get here. */
export function InboxTab({ detail, tick }: InboxTabProps) {
  if (detail.inbox.length === 0) {
    return (
      <Text size="sm" c="dimmed" py="sm">
        Inbox is empty. Packets arrive here one hop per tick and are processed on the next tick.
      </Text>
    );
  }
  return (
    <Stack gap="xs" py="xs">
      {detail.inbox.map((entry) => (
        <MessageCard
          key={`${entry.message.id}|${entry.lastHop ?? 'origin'}|${entry.hop}`}
          message={entry.message}
          tick={tick}
          hop={entry.hop}
          path={entry.path}
        />
      ))}
    </Stack>
  );
}
