import {
  Button,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { MODE_POLICIES, type MessageClass, type NodeDetail } from '@pomoc/core';
import { useState } from 'react';
import { simCommands } from '../../../sim/commands';
import { useSimSnapshot } from '../../../sim/selectors';

interface MobileActionsProps {
  node: NodeDetail;
}

export function MobileActions({ node }: MobileActionsProps) {
  const snapshot = useSimSnapshot();
  const [requestClass, setRequestClass] = useState('LEND');
  const [requestText, setRequestText] = useState('Requesting supplies');
  const [hopLimit, setHopLimit] = useState(3);
  const [checkInStatus, setCheckInStatus] = useState<'OK' | 'NEED_EVACUATION' | 'TRAPPED'>('OK');

  const policy = MODE_POLICIES[snapshot?.nodes[0]?.mode ?? 'PEACE'];
  const originClasses = policy.originClasses.map((cls) => ({
    label: cls,
    value: cls,
  }));

  const handleSendRequest = () => {
    simCommands.sendRequest(node.id, requestClass as MessageClass, {
      kind: 'REQUEST',
      text: requestText,
    });
  };

  const handleCheckIn = () => {
    simCommands.sendCheckIn(node.id, checkInStatus);
  };

  const handleAccept = () => {
    if (snapshot) {
      const openRequest = snapshot.transactions.find((tx) => tx.status === 'open');
      if (openRequest) {
        simCommands.accept(node.id, openRequest.requestId);
      }
    }
  };

  return (
    <Stack gap="md">
      <div>
        <Text fw={500} size="sm" mb="xs">
          Send Request
        </Text>
        <Stack gap="sm">
          <Select
            label="Class"
            data={originClasses}
            value={requestClass}
            onChange={(val) => setRequestClass(val || 'LEND')}
          />
          <Textarea
            label="Message"
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            placeholder="Request text..."
            rows={3}
          />
          <NumberInput
            label="Hop limit"
            value={hopLimit}
            onChange={(val) => setHopLimit(Number(val) || 3)}
          />
          <Button onClick={handleSendRequest} fullWidth>
            Send Request
          </Button>
        </Stack>
      </div>

      <div>
        <Text fw={500} size="sm" mb="xs">
          Check In
        </Text>
        <Stack gap="sm">
          <SegmentedControl
            data={[
              { label: "I'm OK", value: 'OK' },
              { label: 'Need evacuation', value: 'NEED_EVACUATION' },
              { label: 'Trapped', value: 'TRAPPED' },
            ]}
            value={checkInStatus}
            onChange={(val) => setCheckInStatus(val as 'OK' | 'NEED_EVACUATION' | 'TRAPPED')}
          />
          <Button onClick={handleCheckIn} fullWidth>
            Send Check In
          </Button>
        </Stack>
      </div>

      <div>
        <Button onClick={handleAccept} fullWidth variant="light">
          Accept Request
        </Button>
      </div>
    </Stack>
  );
}
