import { Box, Divider } from '@mantine/core';
import { EventLog } from './EventLog';
import { MetricsPanel } from './MetricsPanel';

export function BottomStrip() {
  return (
    <Box style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <Box style={{ flex: '0 0 60%', minWidth: 0, minHeight: 0 }}>
        <EventLog />
      </Box>
      <Divider orientation="vertical" />
      <Box style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <MetricsPanel />
      </Box>
    </Box>
  );
}
