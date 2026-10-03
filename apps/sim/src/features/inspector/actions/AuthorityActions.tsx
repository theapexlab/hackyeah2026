import { Button, Group, SegmentedControl, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { simCommands } from '../../../sim/commands';

export function AuthorityActions() {
  const [declareLevel, setDeclareLevel] = useState<'L1' | 'L2' | 'L3'>('L1');
  const [alertText, setAlertText] = useState('ALERT: Critical infrastructure damage.');

  const handleDeclare = () => {
    simCommands.declareMode(declareLevel, undefined, 300);
  };

  const handleAllClear = () => {
    simCommands.allClear();
  };

  const handleBroadcastAlert = () => {
    simCommands.broadcastAlert(alertText);
  };

  return (
    <Stack gap="md">
      <div>
        <Text fw={500} size="sm" mb="xs">
          Declare Emergency
        </Text>
        <Stack gap="sm">
          <SegmentedControl
            data={[
              { label: 'L1 Disruption', value: 'L1' },
              { label: 'L2 Disaster', value: 'L2' },
              { label: 'L3 Security', value: 'L3' },
            ]}
            value={declareLevel}
            onChange={(val) => setDeclareLevel(val as any)}
            fullWidth
          />
          <Button onClick={handleDeclare} fullWidth>
            Declare {declareLevel}
          </Button>
        </Stack>
      </div>

      <div>
        <Button onClick={handleAllClear} fullWidth variant="light">
          All Clear
        </Button>
      </div>

      <div>
        <Text fw={500} size="sm" mb="xs">
          Broadcast Alert
        </Text>
        <Stack gap="sm">
          <Textarea
            value={alertText}
            onChange={(e) => setAlertText(e.target.value)}
            placeholder="Alert text..."
            rows={3}
          />
          <Button onClick={handleBroadcastAlert} fullWidth>
            Broadcast
          </Button>
        </Stack>
      </div>
    </Stack>
  );
}
