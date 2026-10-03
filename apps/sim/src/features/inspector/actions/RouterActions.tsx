import { Stack, Switch, Text } from '@mantine/core';
import type { NodeDetail } from '@pomoc/core';
import { useState } from 'react';
import { formatBackhaul } from '../../../lib/format';
import { simCommands } from '../../../sim/commands';

interface RouterActionsProps {
  node: NodeDetail;
}

export function RouterActions({ node }: RouterActionsProps) {
  const [powered, setPowered] = useState(node.alive);

  const handleTogglePower = () => {
    const newPowered = !powered;
    setPowered(newPowered);
    simCommands.setNodePowered(node.id, newPowered ? true : false);
  };

  return (
    <Stack gap="md">
      <div>
        <Text fw={500} size="sm" mb="xs">
          Power Control
        </Text>
        <Switch
          label={powered ? 'Powered on' : 'Powered off'}
          checked={powered}
          onChange={handleTogglePower}
        />
        {node.kind === 'gateway' && (
          <Text size="xs" c="dimmed" mt="xs">
            Backhaul: {formatBackhaul(node.backhaul)}
          </Text>
        )}
      </div>
    </Stack>
  );
}
