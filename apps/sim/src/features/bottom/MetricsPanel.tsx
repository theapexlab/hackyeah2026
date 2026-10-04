import {
  Badge,
  Group,
  Progress,
  RingProgress,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import type { MessageClass } from '@pomoc/core';
import {
  CITIZEN_REQUEST_CLASSES,
  DROP_REASONS,
  deliveryAudience,
  deliveryCoverage,
  MESSAGE_CLASSES,
} from '@pomoc/core';
import { formatClass, formatPercent } from '../../lib/format';
import { useSimStore } from '../../sim/store';
import { CLASS_COLOR, DROP_REASON_LABEL, isRejection } from '../../theme/tokens';

function Ring({
  value,
  label,
  color,
}: {
  readonly value: number;
  readonly label: string;
  readonly color: string;
}) {
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return (
    <Stack gap={0} align="center">
      <RingProgress
        size={74}
        thickness={7}
        roundCaps
        sections={[{ value: pct * 100, color }]}
        label={
          <Text size="xs" ta="center" fw={700}>
            {formatPercent(pct)}
          </Text>
        }
      />
      <Text size="xs" c="dimmed" ta="center" lh={1.1}>
        {label}
      </Text>
    </Stack>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <Group gap={4} wrap="nowrap" justify="space-between">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="xs" ff="monospace" fw={600}>
        {value}
      </Text>
    </Group>
  );
}

/**
 * Live metrics (FR-SIM-06): reachability rings, per-class coverage bars, drops by reason,
 * medians. Delivery counts people: phones only. Coverage = phones reached per originated
 * message over the class's audience (registered phones for requests, every phone otherwise,
 * see deliveryAudience), a stable population, so bars never move retroactively when phones
 * die; the tooltip keeps the raw counters.
 */
export function MetricsPanel() {
  const metrics = useSimStore((s) => s.snapshot.metrics);
  const classes = MESSAGE_CLASSES.filter((cls) => metrics.byClass[cls].originated > 0);
  const drops = DROP_REASONS.filter((reason) => metrics.dropsByReason[reason] > 0);

  return (
    <ScrollArea h="100%" scrollbarSize={6}>
      <Group p="sm" gap="md" align="flex-start" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Ring value={metrics.reachableFraction} label="reachable" color="blue" />
          <Ring value={metrics.authorityReachableFraction} label="authority" color="violet" />
        </Group>

        <Stack gap={4} style={{ flex: 1, minWidth: 160 }}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
            Delivery by class
          </Text>
          {classes.length === 0 ? (
            <Text size="xs" c="dimmed">
              No messages originated yet.
            </Text>
          ) : (
            classes.map((cls: MessageClass) => {
              const m = metrics.byClass[cls];
              const coverage = deliveryCoverage(metrics, cls);
              const audience = deliveryAudience(metrics, cls);
              const who = CITIZEN_REQUEST_CLASSES.includes(cls) ? 'registered phones' : 'phones';
              return (
                <Tooltip
                  key={cls}
                  label={`${m.originated} originated · ${m.delivered} deliveries · ${m.uniqueReached} phones reached of ${audience} ${who} · ${m.dropped} dropped`}
                >
                  <div>
                    <Group gap={6} justify="space-between" wrap="nowrap">
                      <Text
                        size="xs"
                        style={{ color: `var(--mantine-color-${CLASS_COLOR[cls]}-text)` }}
                      >
                        {formatClass(cls)}
                      </Text>
                      <Text size="xs" ff="monospace" c="dimmed">
                        {m.delivered}/{m.originated} · {formatPercent(coverage)}
                      </Text>
                    </Group>
                    <Progress
                      value={coverage * 100}
                      color={CLASS_COLOR[cls]}
                      size="sm"
                      radius="xl"
                    />
                  </div>
                </Tooltip>
              );
            })
          )}
        </Stack>

        <Stack gap={4} style={{ minWidth: 180 }}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
            Drops by reason
          </Text>
          {drops.length === 0 ? (
            <Text size="xs" c="dimmed">
              No drops.
            </Text>
          ) : (
            <Group gap={4}>
              {drops.map((reason) => (
                <Tooltip key={reason} label={DROP_REASON_LABEL[reason]}>
                  <Badge
                    size="sm"
                    variant={isRejection(reason) ? 'filled' : 'light'}
                    color={isRejection(reason) ? 'red' : reason === 'DUPLICATE' ? 'gray' : 'orange'}
                  >
                    {reason.toLowerCase().replace(/_/g, ' ')} {metrics.dropsByReason[reason]}
                  </Badge>
                </Tooltip>
              ))}
            </Group>
          )}
          <Stat
            label="median hops"
            value={metrics.medianHops === null ? '–' : String(metrics.medianHops)}
          />
          <Stat
            label="median latency"
            value={metrics.medianLatency === null ? '–' : `${metrics.medianLatency} ticks`}
          />
          <Stat label="components" value={String(metrics.componentCount)} />
          <Stat label="stored packets" value={String(metrics.storedTotal)} />
          <Stat label="transits this tick" value={String(metrics.transitsThisTick)} />
        </Stack>
      </Group>
    </ScrollArea>
  );
}
