import { Divider, Group } from '@mantine/core';
import { EventLog } from './EventLog';
import { MetricsPanel } from './MetricsPanel';

export function BottomStrip() {
  return (
    <Group grow h="100%" gap={0} wrap="nowrap">
      <div style={{ flex: '60%', overflow: 'hidden' }}>
        <EventLog />
      </div>
      <Divider orientation="vertical" />
      <div style={{ flex: '40%', overflow: 'hidden' }}>
        <MetricsPanel />
      </div>
    </Group>
  );
}
