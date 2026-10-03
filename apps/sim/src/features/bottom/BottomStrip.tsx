import { Box } from '@mantine/core';
import { EventLog } from './EventLog';
import { MetricsPanel } from './MetricsPanel';

/** Footer: event log (60 %) beside live metrics (40 %), both clipped to the footer height. */
export function BottomStrip() {
  return (
    <Box style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <Box style={{ flex: 3, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <EventLog />
      </Box>
      <Box
        style={{
          flex: 2,
          minWidth: 0,
          minHeight: 0,
          borderLeft: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <MetricsPanel />
      </Box>
    </Box>
  );
}
