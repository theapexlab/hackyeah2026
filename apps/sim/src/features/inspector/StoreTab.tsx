import { Badge, Group, Stack, Text } from '@mantine/core';
import type { NodeDetail } from '@pomoc/core';
import { formatTick } from '../../lib/format';
import { MessageCard } from './MessageCard';

interface StoreTabProps {
  readonly detail: NodeDetail;
  readonly tick: number;
}

/** Store-and-forward buffer: kept until TTL, flushed to every new neighbour (data mule). */
export function StoreTab({ detail, tick }: StoreTabProps) {
  if (detail.store.length === 0) {
    return (
      <Text size="sm" c="dimmed" py="sm">
        Nothing stored. In L1–L3 a node with no route keeps the packet and hands it to whoever comes
        into range.
      </Text>
    );
  }
  return (
    <Stack gap="xs" py="xs">
      {detail.store.map((entry) => (
        <MessageCard
          key={entry.message.id}
          message={entry.message}
          tick={tick}
          hop={entry.hop}
          badges={
            <Badge variant="light" color="yellow" size="sm">
              stored t{formatTick(entry.storedTick)}
            </Badge>
          }
          actions={
            <Group gap={4} wrap="wrap">
              <Text size="xs" c="dimmed">
                flushed to {entry.sentTo.length === 0 ? 'nobody yet' : ''}
              </Text>
              {entry.sentTo.map((id) => (
                <Badge key={id} variant="default" size="xs" ff="monospace">
                  {id}
                </Badge>
              ))}
            </Group>
          }
        />
      ))}
    </Stack>
  );
}
