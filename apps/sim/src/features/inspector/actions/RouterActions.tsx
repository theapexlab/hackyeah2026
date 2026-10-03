import { Button, Stack, Switch, Text } from '@mantine/core';
import type { NodeDetail } from '@pomoc/core';
import { formatBackhaul } from '../../../lib/format';
import { simCommands } from '../../../sim/commands';

export function RouterActions({ detail }: { detail: NodeDetail }) {
  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">
        Power
      </Text>
      <Switch
        label={detail.alive ? 'Powered on' : 'Powered off'}
        checked={detail.alive}
        onChange={(e) => simCommands.setNodePowered(detail.id, e.currentTarget.checked)}
      />
      {detail.poweredOverride !== null && (
        <Button
          size="compact-xs"
          variant="subtle"
          onClick={() => simCommands.setNodePowered(detail.id, null)}
        >
          Back to automatic (grid / battery)
        </Button>
      )}
      <Text size="xs" c="dimmed">
        Backhaul: {formatBackhaul(detail.backhaul)} &middot; battery:{' '}
        {detail.batteryBacked ? 'yes' : 'no'}
      </Text>
    </Stack>
  );
}
