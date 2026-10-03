import { Badge, Group, Stack, Text } from '@mantine/core';
import type { NodeDetail } from '@pomoc/core';
import { formatClass } from '../../lib/format';
import { classCss } from '../../theme/tokens';

export function StoreTab({ detail }: { detail: NodeDetail }) {
  if (detail.store.length === 0)
    return (
      <Text c="dimmed" size="sm">
        Store-and-forward buffer is empty
      </Text>
    );
  return (
    <Stack gap="xs">
      {detail.store.map((s) => (
        <Group key={s.msgId} gap="xs" wrap="nowrap">
          <Badge size="sm" style={{ background: classCss(s.class), color: '#000' }}>
            {formatClass(s.class)}
          </Badge>
          <Text size="xs" truncate>
            {s.msgId} &middot; stored at hop {s.hop}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}
