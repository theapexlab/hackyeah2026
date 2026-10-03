import { Group, Progress, RingProgress, Stack, Text } from '@mantine/core';
import type { MetricsView } from '@pomoc/core';
import { useSimMetrics } from '../../sim/selectors';

export function MetricsPanel() {
  const metrics: MetricsView | undefined = useSimMetrics();
  const metricsData = metrics || {
    reachableFraction: 0,
    authorityReachableFraction: 0,
    componentCount: 0,
    storedTotal: 0,
    transitsThisTick: 0,
    deliveriesByClass: {},
    dropsByReason: {},
    medianHops: 0,
    medianLatency: 0,
  };

  const reachablePercent = Math.round(metricsData.reachableFraction * 100);
  const authorityReachablePercent = Math.round(metricsData.authorityReachableFraction * 100);

  return (
    <Stack gap="md" p="md">
      <Group grow>
        <div style={{ textAlign: 'center' }}>
          <RingProgress
            sections={[{ value: reachablePercent, color: 'blue' }]}
            label={<Text size="xs">{reachablePercent}%</Text>}
          />
          <Text size="xs" mt="xs">
            Reachable
          </Text>
        </div>

        <div style={{ textAlign: 'center' }}>
          <RingProgress
            sections={[{ value: authorityReachablePercent, color: 'green' }]}
            label={<Text size="xs">{authorityReachablePercent}%</Text>}
          />
          <Text size="xs" mt="xs">
            Authority
          </Text>
        </div>
      </Group>

      <div>
        <Text size="xs" fw={500} mb="xs">
          Components: {metricsData.componentCount}
        </Text>
        <Text size="xs" fw={500} mb="xs">
          Stored: {metricsData.storedTotal}
        </Text>
      </div>

      <div>
        <Text size="xs" fw={500} mb="xs">
          Delivery by Class
        </Text>
        <Stack gap="xs">
          {Object.entries(metricsData.deliveriesByClass)
            .slice(0, 3)
            .map(([cls, count]) => (
              <Group key={cls} gap="xs">
                <Text size="xs" style={{ flex: 1 }}>
                  {cls}
                </Text>
                <Progress value={Math.min(100, count * 5)} w={100} size="sm" />
              </Group>
            ))}
        </Stack>
      </div>
    </Stack>
  );
}
