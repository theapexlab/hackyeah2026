import { Code, ScrollArea, Stack, Text } from '@mantine/core';
import { useNodeDetail } from '../../sim/selectors';

interface LogTabProps {
  nodeId: string;
}

export function LogTab({ nodeId }: LogTabProps) {
  const detail = useNodeDetail(nodeId);

  if (!detail) {
    return <Text c="dimmed">Loading...</Text>;
  }

  const logs = (detail as any).log || [];

  if (logs.length === 0) {
    return <Text c="dimmed">No events logged</Text>;
  }

  return (
    <ScrollArea style={{ height: 400 }}>
      <Stack gap="xs">
        {logs.map((entry: any, idx: number) => (
          <Code key={idx} block style={{ fontSize: 11 }}>
            {JSON.stringify(entry, null, 2)}
          </Code>
        ))}
      </Stack>
    </ScrollArea>
  );
}
