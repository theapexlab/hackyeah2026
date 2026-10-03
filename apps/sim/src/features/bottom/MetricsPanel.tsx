import { Badge, Group, Progress, RingProgress, ScrollArea, Stack, Text } from '@mantine/core';
import type { MessageClass } from '@pomoc/core';
import { formatClass } from '../../lib/format';
import { useSimMetrics } from '../../sim/selectors';
import { classCss } from '../../theme/tokens';

const pct = (f: number) => Math.round(f * 100);

function Ring({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <Stack gap={0} align="center">
      <RingProgress
        size={64}
        thickness={7}
        sections={[{ value, color }]}
        label={
          <Text size="xs" ta="center" fw={700}>
            {value}%
          </Text>
        }
        aria-label={`${label} ${value} percent`}
      />
      <Text size="xs">{label}</Text>
    </Stack>
  );
}

export function MetricsPanel() {
  const m = useSimMetrics();
  if (!m) return null;
  const deliveries = (Object.entries(m.deliveriesByClass) as [MessageClass, number][]).filter(
    ([, n]) => n > 0,
  );
  const max = Math.max(1, ...deliveries.map(([, n]) => n));
  const drops = Object.entries(m.dropsByReason).filter(([, n]) => n > 0);

  return (
    <ScrollArea h="100%" type="auto">
      <Group p="xs" gap="md" align="flex-start" wrap="nowrap">
        <Ring value={pct(m.reachableFraction)} label="Reachable" color="blue" />
        <Ring value={pct(m.authorityReachableFraction)} label="Authority" color="violet" />
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text size="xs">
            Components {m.componentCount} &middot; stored {m.storedTotal} &middot; median hops{' '}
            {m.medianHops} &middot; latency {m.medianLatency}
          </Text>
          {deliveries.length === 0 && (
            <Text size="xs" c="dimmed">
              No deliveries yet
            </Text>
          )}
          {deliveries.map(([cls, n]) => (
            <Group key={cls} gap={6} wrap="nowrap">
              <Text size="xs" w={110} truncate>
                {formatClass(cls)}
              </Text>
              <Progress
                value={(n / max) * 100}
                size="sm"
                style={{ flex: 1 }}
                aria-label={`${formatClass(cls)} deliveries`}
                styles={{ section: { background: classCss(cls) } }}
              />
              <Text size="xs" w={28} ta="right">
                {n}
              </Text>
            </Group>
          ))}
          <Group gap={4}>
            {drops.map(([reason, n]) => (
              <Badge key={reason} size="xs" color="red" variant="light">
                {reason} {n}
              </Badge>
            ))}
          </Group>
        </Stack>
      </Group>
    </ScrollArea>
  );
}
