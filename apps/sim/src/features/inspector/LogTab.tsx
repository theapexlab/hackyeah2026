import { Stack, Text } from '@mantine/core';
import type { NodeDetail } from '@pomoc/core';
import { withKeys } from '../../lib/keys';

export function LogTab({ detail }: { detail: NodeDetail }) {
  if (detail.nodeLog.length === 0)
    return (
      <Text c="dimmed" size="sm">
        No node log entries
      </Text>
    );
  return (
    <Stack gap={2}>
      {withKeys(detail.nodeLog.slice(-60), (l) => l).map(({ key, item }) => (
        <Text key={key} size="xs" ff="monospace">
          {item}
        </Text>
      ))}
    </Stack>
  );
}
